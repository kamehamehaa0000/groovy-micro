/**
 * Observability: Prometheus metrics for the Groovy API.
 *
 * Everything is opt-out via `METRICS_ENABLED=false`. See
 * `docs/OBSERVABILITY.md` for the full story (what is measured, how to read it
 * with p90/p95/p99, and how to run Prometheus + Grafana on top).
 */
export {
  isMetricsRouteExposed,
  readMetricsConfig,
  DEFAULT_STREAM_ROUTES,
  parseBool,
  parseList,
} from './config'
export type { MetricsConfig } from './config'

export { attachMetrics } from './attach'
export type { AttachMetricsOptions } from './attach'

export { startCollectors, parseRedisInfo } from './collectors'
export type { CollectorDeps, PgLike, QueueLike, RedisLike } from './collectors'

export {
  HTTP_LATENCY_BUCKETS,
  dbConnectionsActive,
  dbConnectionsIdle,
  dbUp,
  httpRequestDurationSeconds,
  httpRequestsInFlight,
  httpRequestsTotal,
  httpStreamsOpen,
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
  registry,
} from './metrics'
