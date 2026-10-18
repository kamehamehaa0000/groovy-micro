/**
 * Health pollers for the pieces of the backend that do not report themselves.
 *
 * The HTTP hooks cover request latency. These pollers add the "is the rest of
 * the machine healthy?" half: Redis, Postgres and the BullMQ queues. They run on
 * a plain interval (default every 15s), never overlap, and never take the API
 * down: a failing poll records a 0 on the `*_up` gauge and moves on.
 */
import type { MetricsConfig } from './config'
import {
  dbConnectionsActive,
  dbConnectionsIdle,
  dbUp,
  metricsCollectorErrorsTotal,
  metricsLastCollectTimestamp,
  queueJobs,
  redisCommandsProcessedTotal,
  redisConnectedClients,
  redisKeyspaceHitsTotal,
  redisKeyspaceMissesTotal,
  redisKeyspaceKeys,
  redisMemoryUsedBytes,
  redisOpsPerSecond,
  redisUp,
} from './metrics'

export interface RedisLike {
  ping(): Promise<string>
  info(): Promise<string>
}

export interface PgLike {
  unsafe(query: string): PromiseLike<unknown[]>
}

export interface QueueLike {
  name: string
  getJobCounts(...types: string[]): Promise<Record<string, number>>
}

export interface LoggerLike {
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  debug(...args: unknown[]): void
}

export interface CollectorDeps {
  redis?: RedisLike
  pg?: PgLike
  queues?: QueueLike[]
  log?: LoggerLike
}

/** Parses the `key:value` lines of a Redis INFO reply. */
export function parseRedisInfo(info: string): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const rawLine of info.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf(':')
    if (separator === -1) continue
    fields[line.slice(0, separator)] = line.slice(separator + 1)
  }
  return fields
}

const toNumber = (value: string | undefined): number | null => {
  if (value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Starts the pollers. Returns a stop function which the plugin wires into the
 * Fastify `onClose` hook, so closing the app (tests, shutdown) leaves no timers
 * behind.
 */
export function startCollectors(
  config: MetricsConfig,
  deps: CollectorDeps,
): () => void {
  const log = deps.log
  const timeoutMs = Math.max(2_000, Math.min(config.pollIntervalMs, 10_000))
  let stopped = false
  let running = false

  // A failing poll should not flood the log; one line per outage is enough.
  const outage = new Set<string>()

  const noteFailure = (collector: string, err: unknown) => {
    metricsCollectorErrorsTotal.inc({ collector })
    const message = err instanceof Error ? err.message : String(err)
    if (outage.has(collector)) {
      log?.debug({ collector, err: message }, 'metrics collector still failing')
      return
    }
    outage.add(collector)
    log?.warn({ collector, err: message }, 'metrics collector poll failed')
  }

  const noteSuccess = (collector: string) => {
    outage.delete(collector)
  }

  const withTimeout = async <T>(value: PromiseLike<T>): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        Promise.resolve(value),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`timed out after ${timeoutMs}ms`)),
            timeoutMs,
          )
          timer.unref?.()
        }),
      ])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  // Redis counters only ever grow, so we store the previous reading and publish
  // the difference as a real `_total` counter (rate() then works as expected).
  const lastCounters: Record<string, number | null> = {
    commands: null,
    hits: null,
    misses: null,
  }

  const incDelta = (
    counter: { inc(value: number): void },
    key: string,
    current: number | null,
  ) => {
    const previous = lastCounters[key]
    lastCounters[key] = current
    if (current === null || previous === null) return
    if (current >= previous) counter.inc(current - previous)
  }

  const collectRedis = async () => {
    const redis = deps.redis
    if (!redis) return
    // Kept separate from the INFO read below: a failed INFO is a collector
    // problem, not proof that Redis is down.
    let answeredPing = false
    try {
      const pong = await withTimeout(redis.ping())
      answeredPing = true
      redisUp.set(pong === 'PONG' ? 1 : 0)

      const fields = parseRedisInfo(await withTimeout(redis.info()))
      const memory = toNumber(fields.used_memory)
      const clients = toNumber(fields.connected_clients)
      const opsPerSec = toNumber(fields.instantaneous_ops_per_sec)
      if (memory !== null) redisMemoryUsedBytes.set(memory)
      if (clients !== null) redisConnectedClients.set(clients)
      if (opsPerSec !== null) redisOpsPerSecond.set(opsPerSec)

      incDelta(
        redisCommandsProcessedTotal,
        'commands',
        toNumber(fields.total_commands_processed),
      )
      incDelta(
        redisKeyspaceHitsTotal,
        'hits',
        toNumber(fields.keyspace_hits),
      )
      incDelta(
        redisKeyspaceMissesTotal,
        'misses',
        toNumber(fields.keyspace_misses),
      )

      for (const [key, value] of Object.entries(fields)) {
        if (!/^db\d+$/.test(key)) continue
        const keys = /keys=(\d+)/.exec(value)?.[1]
        redisKeyspaceKeys.set({ db: key.slice(2) }, Number(keys ?? 0))
      }

      noteSuccess('redis')
    } catch (err) {
      if (!answeredPing) redisUp.set(0)
      noteFailure('redis', err)
    }
  }

  const collectPostgres = async () => {
    const pg = deps.pg
    if (!pg) return
    let answeredQuery = false
    try {
      await withTimeout(pg.unsafe('SELECT 1'))
      answeredQuery = true
      dbUp.set(1)

      const rows = await withTimeout(
        pg.unsafe(
          `SELECT count(*) FILTER (WHERE state = 'active')::int AS active,
                  count(*) FILTER (WHERE state = 'idle')::int AS idle
             FROM pg_stat_activity
            WHERE datname = current_database()`,
        ),
      )
      const row = (rows?.[0] ?? {}) as { active?: number; idle?: number }
      dbConnectionsActive.set(Number(row.active ?? 0))
      dbConnectionsIdle.set(Number(row.idle ?? 0))

      noteSuccess('postgres')
    } catch (err) {
      if (!answeredQuery) dbUp.set(0)
      noteFailure('postgres', err)
    }
  }

  // BullMQ reports counts per state; we remember every state we have seen so a
  // queue that drains back to zero drops to 0 instead of hiding the last value.
  const knownQueueStates = new Set<string>()

  const collectQueues = async () => {
    for (const queue of deps.queues ?? []) {
      const collector = `queue:${queue.name}`
      try {
        const counts = await withTimeout(queue.getJobCounts())
        const present = new Set(Object.keys(counts))
        for (const [state, jobs] of Object.entries(counts)) {
          knownQueueStates.add(state)
          queueJobs.set({ queue: queue.name, state }, Number(jobs) || 0)
        }
        for (const state of knownQueueStates) {
          if (present.has(state)) continue
          queueJobs.set({ queue: queue.name, state }, 0)
        }
        noteSuccess(collector)
      } catch (err) {
        noteFailure(collector, err)
      }
    }
  }

  const collect = async () => {
    if (stopped || running) return
    running = true
    try {
      await collectRedis()
      await collectPostgres()
      await collectQueues()
      metricsLastCollectTimestamp.set(Date.now() / 1000)
    } finally {
      running = false
    }
  }

  // First poll is deferred slightly so the API finishes booting (and Redis has a
  // chance to connect) before the first round of health queries.
  const firstRun = setTimeout(collect, 1_000)
  firstRun.unref?.()

  const timer = setInterval(collect, config.pollIntervalMs)
  timer.unref?.()

  return () => {
    stopped = true
    clearTimeout(firstRun)
    clearInterval(timer)
  }
}
