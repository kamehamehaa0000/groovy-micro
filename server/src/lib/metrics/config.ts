/**
 * Observability configuration.
 *
 * Everything about metrics is driven from environment variables so the feature
 * can be switched on and off in production without a code change:
 *
 *   METRICS_ENABLED=false   -> nothing runs: no hooks, no timers, no /metrics route
 *   METRICS_ENABLED=true    -> latency/error/RPS numbers + Redis/Postgres/queue health
 *
 * The defaults are chosen to be safe:
 *   - on in development and production, off while running tests (no stray timers)
 *   - in production the /metrics route is only exposed when you set METRICS_TOKEN
 *     (or explicitly opt in with METRICS_ALLOW_PUBLIC=true). Prometheus sends the
 *     token as `Authorization: Bearer ...`.
 */

/** Routes that stay open for a long time (Server-Sent Events) and are therefore
 *  counted as "open streams" instead of being timed like normal requests. */
export const DEFAULT_STREAM_ROUTES = [
  '/api/v1/player/session/events',
  '/api/v1/notifications/stream',
]

export interface MetricsConfig {
  /** Master switch. Off = no hooks, no pollers, no route. */
  enabled: boolean
  /** Where the Prometheus text endpoint lives. */
  path: string
  /** When set, /metrics requires `Authorization: Bearer <token>` or `?token=`. */
  token: string | null
  /** Allow an unauthenticated /metrics endpoint in production (not recommended). */
  allowPublic: boolean
  /** Collect node process metrics (CPU, memory, event loop, GC). */
  processMetrics: boolean
  /** Poll Redis / Postgres / BullMQ for health numbers. */
  collectors: boolean
  /** How often the pollers run. */
  pollIntervalMs: number
  /** Exact paths served as long-lived streams. */
  streamRoutes: string[]
  /** Route templates left out of the latency histogram (health checks, streams). */
  skipRoutes: string[]
}

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on'])
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off'])

/** Reads a boolean env var, falling back to `fallback` when it is unset or junk. */
export function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback
  const normalised = value.trim().toLowerCase()
  if (normalised === '') return fallback
  if (TRUE_VALUES.has(normalised)) return true
  if (FALSE_VALUES.has(normalised)) return false
  return fallback
}

/** Reads a comma separated env var into a trimmed, de-duplicated list. */
export function parseList(value: string | undefined): string[] {
  if (!value) return []
  const seen = new Set<string>()
  for (const part of value.split(',')) {
    const item = part.trim()
    if (item) seen.add(item)
  }
  return [...seen]
}

const normalisePath = (value: string): string =>
  value.startsWith('/') ? value : `/${value}`

export function readMetricsConfig(
  env: NodeJS.ProcessEnv = process.env,
): MetricsConfig {
  const isTest = env.NODE_ENV === 'test'
  const path = normalisePath(env.METRICS_PATH?.trim() || '/metrics')

  const streamRoutes = [
    ...new Set([...DEFAULT_STREAM_ROUTES, ...parseList(env.METRICS_STREAM_ROUTES)]),
  ]

  // Health checks and the scrape endpoint itself would otherwise dominate the
  // slowest-route charts without telling us anything about real traffic.
  const skipRoutes = [
    ...new Set([
      ...streamRoutes,
      '/healthz',
      path,
      ...parseList(env.METRICS_SKIP_ROUTES),
    ]),
  ]

  const pollIntervalMs = Number(env.METRICS_POLL_MS)
  const token = env.METRICS_TOKEN?.trim() || null

  return {
    enabled: parseBool(env.METRICS_ENABLED, !isTest),
    path,
    token,
    allowPublic: parseBool(env.METRICS_ALLOW_PUBLIC, false),
    processMetrics: parseBool(env.METRICS_PROCESS, true),
    collectors: parseBool(env.METRICS_COLLECTORS, true),
    pollIntervalMs:
      Number.isFinite(pollIntervalMs) && pollIntervalMs >= 1000
        ? pollIntervalMs
        : 15_000,
    streamRoutes,
    skipRoutes,
  }
}

/**
 * Should the /metrics route be reachable?
 *
 * In production we refuse to publish it unless it is protected or explicitly
 * forced public, because the endpoint leaks route names and traffic volumes.
 */
export function isMetricsRouteExposed(
  config: MetricsConfig,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!config.enabled) return false
  if (config.token) return true
  if (config.allowPublic) return true
  return env.NODE_ENV !== 'production'
}
