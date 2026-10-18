/**
 * Wires the metrics into a running Fastify app.
 *
 * Call it once, from `bootstrap()`, before the server starts listening:
 *
 *   attachMetrics(app, { deps: { redis, pg: pgClient, queues: [...] } })
 *
 * When metrics are disabled the function returns immediately: no hooks are
 * registered, no timers are started and no route exists, so a disabled build is
 * byte-for-byte the same hot path as before this feature existed.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { collectDefaultMetrics } from 'prom-client'
import { isMetricsRouteExposed, readMetricsConfig, type MetricsConfig } from './config'
import { startCollectors, type CollectorDeps } from './collectors'
import {
  httpRequestDurationSeconds,
  httpRequestsInFlight,
  httpRequestsTotal,
  httpStreamsOpen,
  registry,
} from './metrics'

export interface AttachMetricsOptions {
  /** Overrides for the env-derived configuration (used by tests). */
  config?: Partial<MetricsConfig>
  /** Live Redis / Postgres / queue handles to poll. */
  deps?: CollectorDeps
}

interface RequestState {
  isStream: boolean
  streamRoute: string
  settled: boolean
  startedAt: number
}

const requestStates = new WeakMap<FastifyRequest, RequestState>()
const instrumentedApps = new WeakSet<FastifyInstance>()
let defaultMetricsStarted = false

export function attachMetrics(
  app: FastifyInstance,
  options: AttachMetricsOptions = {},
): MetricsConfig {
  const config: MetricsConfig = { ...readMetricsConfig(), ...options.config }

  // Registering twice would double-count every request.
  if (instrumentedApps.has(app)) return config
  instrumentedApps.add(app)

  if (!config.enabled) {
    app.log.info('Metrics are off (METRICS_ENABLED=false)')
    return config
  }

  if (config.processMetrics && !defaultMetricsStarted) {
    defaultMetricsStarted = true
    try {
      // CPU, memory, event loop lag, GC - prefixed so everything in one scrape
      // response looks like it belongs to the same app.
      collectDefaultMetrics({ register: registry, prefix: 'groovy_' })
    } catch (err) {
      app.log.warn({ err }, 'Could not start process metrics')
    }
  }

  // -------------------------------------------------------------------------
  // Per-request timing
  // -------------------------------------------------------------------------
  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0]
    const streamRoute = config.streamRoutes.find((route) => route === path) ?? ''
    const state: RequestState = {
      isStream: streamRoute !== '',
      streamRoute,
      settled: false,
      startedAt: performance.now(),
    }
    requestStates.set(request, state)

    if (state.isStream) {
      // A stream is measured as "how many are open", never as a duration. The
      // client going away is what ends it, so the raw socket close is the signal
      // to trust (Fastify's reply may never finish for a long-lived stream).
      httpStreamsOpen.inc({ route: streamRoute })
      const release = () => {
        if (state.settled) return
        state.settled = true
        httpStreamsOpen.dec({ route: streamRoute })
      }
      reply.raw.once('close', release)
      reply.raw.once('finish', release)
      return
    }

    httpRequestsInFlight.inc()
    // Backstop for a client that disconnects before Fastify can answer: without
    // this the in-flight gauge would climb forever on a flaky network.
    request.raw.once('close', () => {
      if (state.settled) return
      state.settled = true
      httpRequestsInFlight.dec()
    })
  })

  app.addHook('onResponse', async (request, reply) => {
    const state = requestStates.get(request)
    if (!state || state.isStream || state.settled) return
    state.settled = true
    httpRequestsInFlight.dec()

    // `routeOptions.url` is the *template* (`/api/v1/songs/:id`), which is what
    // keeps the number of series bounded. Unknown paths land in `unmatched`.
    const route = request.routeOptions?.url || 'unmatched'
    if (config.skipRoutes.includes(route)) return

    const labels = {
      method: request.method,
      route,
      status: String(reply.statusCode),
    }
    httpRequestsTotal.inc(labels)
    httpRequestDurationSeconds.observe(
      labels,
      (performance.now() - state.startedAt) / 1000,
    )
  })

  // -------------------------------------------------------------------------
  // The scrape endpoint
  // -------------------------------------------------------------------------
  if (isMetricsRouteExposed(config)) {
    app.get(
      config.path,
      { config: { rateLimit: false } },
      async (request, reply) => {
        if (config.token) {
          const header = request.headers.authorization
          const bearer =
            typeof header === 'string' && header.startsWith('Bearer ')
              ? header.slice('Bearer '.length)
              : ''
          const queryToken = (request.query as { token?: unknown } | undefined)
            ?.token
          if (bearer !== config.token && queryToken !== config.token) {
            return reply.status(401).send({ error: 'Unauthorized' })
          }
        }

        reply.header('Content-Type', registry.contentType)
        reply.header('Cache-Control', 'no-store')
        reply.header('X-Robots-Tag', 'noindex')
        return reply.send(await registry.metrics())
      },
    )
    app.log.info(
      { path: config.path, protected: Boolean(config.token) },
      'Metrics endpoint ready',
    )
  } else {
    app.log.warn(
      `Metrics are enabled but ${config.path} is not exposed in production. ` +
        'Set METRICS_TOKEN=<secret> (Prometheus then sends it as a Bearer token) ' +
        'or METRICS_ALLOW_PUBLIC=true to publish it unauthenticated.',
    )
  }

  // -------------------------------------------------------------------------
  // Health pollers
  // -------------------------------------------------------------------------
  const hasSomethingToPoll = Boolean(
    options.deps?.redis || options.deps?.pg || options.deps?.queues?.length,
  )
  if (config.collectors && hasSomethingToPoll) {
    const stopCollectors = startCollectors(config, {
      ...options.deps,
      log: options.deps?.log ?? app.log,
    })
    app.addHook('onClose', async () => {
      stopCollectors()
    })
    app.log.info(
      { intervalMs: config.pollIntervalMs },
      'Metrics health collectors started',
    )
  }

  return config
}
