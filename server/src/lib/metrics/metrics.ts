/**
 * Metric definitions for the Groovy API.
 *
 * Every metric lives in one private registry (`registry`) instead of the
 * prom-client global default, so the numbers are easy to reason about and other
 * libraries cannot accidentally add or replace series.
 *
 * Two rules keep these numbers cheap and useful:
 *   1. Labels are always from a small fixed set (a route *template* such as
 *      `/api/v1/songs/:id`, an HTTP status, a queue name). Never a user id, a
 *      song id, a device id or a raw URL: that would create unlimited series and
 *      take the monitoring down with the app.
 *   2. Long-lived streams (SSE) are counted as a gauge, not timed as requests:
 *      a connection that stays open for an hour would otherwise show up as a
 *      one-hour request and ruin every latency percentile.
 */
import { Counter, Gauge, Histogram, Registry } from 'prom-client'

export const registry = new Registry()

registry.setDefaultLabels({
  service: process.env.METRICS_SERVICE_NAME?.trim() || 'groovy-api',
  env: process.env.NODE_ENV || 'development',
})

/**
 * Latency buckets, in seconds, tuned for an API where almost everything is a
 * fast Redis or Postgres round trip. The fine-grained low end is what makes
 * p90/p95/p99 meaningful; `Infinity` is added by prom-client automatically.
 */
export const HTTP_LATENCY_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
]

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

export const httpRequestDurationSeconds = new Histogram({
  name: 'groovy_http_request_duration_seconds',
  help: 'HTTP request latency in seconds, labelled by route template, method and status.',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: HTTP_LATENCY_BUCKETS,
  registers: [registry],
})

export const httpRequestsTotal = new Counter({
  name: 'groovy_http_requests_total',
  help: 'Total HTTP requests handled, labelled by route template, method and status.',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [registry],
})

export const httpRequestsInFlight = new Gauge({
  name: 'groovy_http_requests_in_flight',
  help: 'Requests currently being handled (streams excluded: they are counted separately).',
  registers: [registry],
})

export const httpStreamsOpen = new Gauge({
  name: 'groovy_http_streams_open',
  help: 'Open Server-Sent Events connections, labelled by route.',
  labelNames: ['route'] as const,
  registers: [registry],
})

// ---------------------------------------------------------------------------
// Redis
// ---------------------------------------------------------------------------

export const redisUp = new Gauge({
  name: 'groovy_redis_up',
  help: '1 when Redis answered PING, 0 when it did not.',
  registers: [registry],
})

export const redisMemoryUsedBytes = new Gauge({
  name: 'groovy_redis_memory_used_bytes',
  help: 'Memory used by Redis (INFO used_memory).',
  registers: [registry],
})

export const redisConnectedClients = new Gauge({
  name: 'groovy_redis_connected_clients',
  help: 'Client connections currently open on Redis.',
  registers: [registry],
})

export const redisOpsPerSecond = new Gauge({
  name: 'groovy_redis_ops_per_sec',
  help: 'Commands Redis is currently serving per second (INFO instantaneous_ops_per_sec).',
  registers: [registry],
})

export const redisKeyspaceKeys = new Gauge({
  name: 'groovy_redis_keyspace_keys',
  help: 'Number of keys stored per Redis database.',
  labelNames: ['db'] as const,
  registers: [registry],
})

export const redisCommandsProcessedTotal = new Counter({
  name: 'groovy_redis_commands_processed_total',
  help: 'Commands Redis has processed, accumulated between polls.',
  registers: [registry],
})

export const redisKeyspaceHitsTotal = new Counter({
  name: 'groovy_redis_keyspace_hits_total',
  help: 'Successful lookups in the Redis keyspace (cache hits).',
  registers: [registry],
})

export const redisKeyspaceMissesTotal = new Counter({
  name: 'groovy_redis_keyspace_misses_total',
  help: 'Failed lookups in the Redis keyspace (cache misses).',
  registers: [registry],
})

// ---------------------------------------------------------------------------
// Postgres
// ---------------------------------------------------------------------------

export const dbUp = new Gauge({
  name: 'groovy_db_up',
  help: '1 when Postgres answered a query, 0 when it did not.',
  registers: [registry],
})

export const dbConnectionsActive = new Gauge({
  name: 'groovy_db_connections_active',
  help: 'Postgres backends for this database currently running a query.',
  registers: [registry],
})

export const dbConnectionsIdle = new Gauge({
  name: 'groovy_db_connections_idle',
  help: 'Postgres backends for this database connected but idle.',
  registers: [registry],
})

// ---------------------------------------------------------------------------
// Background jobs
// ---------------------------------------------------------------------------

export const queueJobs = new Gauge({
  name: 'groovy_queue_jobs',
  help: 'BullMQ jobs per queue and state (waiting, active, completed, failed, delayed, paused).',
  labelNames: ['queue', 'state'] as const,
  registers: [registry],
})

// ---------------------------------------------------------------------------
// Self-monitoring: is the collector itself healthy?
// ---------------------------------------------------------------------------

export const metricsCollectorErrorsTotal = new Counter({
  name: 'groovy_metrics_collector_errors_total',
  help: 'Failed collector polls, labelled by collector (redis, postgres, queue:<name>).',
  labelNames: ['collector'] as const,
  registers: [registry],
})

export const metricsLastCollectTimestamp = new Gauge({
  name: 'groovy_metrics_last_collect_timestamp_seconds',
  help: 'Unix time of the last collector poll loop; goes stale if the poller stops running.',
  registers: [registry],
})
