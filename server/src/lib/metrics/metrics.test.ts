/**
 * Observability tests.
 *
 * These are deliberately hermetic: they build a small Fastify app, attach the
 * metrics, and check the hook wiring, the scrape endpoint and its protection.
 * No database and no Redis are needed, because the pollers are switched off
 * (`collectors: false`). The pollers themselves are exercised by the API booting
 * normally with them running (see docs/OBSERVABILITY.md).
 */
import Fastify from 'fastify'
import {
  attachMetrics,
  httpRequestDurationSeconds,
  httpRequestsInFlight,
  httpRequestsTotal,
  httpStreamsOpen,
  readMetricsConfig,
} from './index'

const silent = { logger: false as const }

interface ReadableMetric {
  get(): Promise<{ values: unknown[] }>
}

interface MetricSeries {
  value: number
  metricName?: string
  labels: Record<string, string | number | undefined>
}

let failures = 0
let checks = 0

function check(name: string, condition: boolean, detail?: unknown) {
  checks += 1
  if (condition) {
    console.log(`   PASS  ${name}`)
    return
  }
  failures += 1
  console.log(
    `   FAIL  ${name}${detail === undefined ? '' : ` -> ${JSON.stringify(detail)}`}`,
  )
}

/** Reads one series out of a prom-client metric by matching label values. */
async function seriesValue(
  metric: ReadableMetric,
  labels: Record<string, string | number>,
  metricName?: string,
): Promise<number | undefined> {
  const { values } = await metric.get()
  const series = (values as MetricSeries[]).find((entry) => {
    if (metricName && entry.metricName !== metricName) return false
    return Object.entries(labels).every(
      ([key, value]) => entry.labels[key] === value,
    )
  })
  return series?.value
}

async function waitFor(
  predicate: () => Promise<boolean>,
  timeoutMs = 3_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return true
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  return predicate()
}

async function runTests() {
  console.log('Testing Prometheus metrics...\n')

  // -------------------------------------------------------------------------
  console.log('1. Request timing hooks and label hygiene')
  const appA = Fastify(silent)
  appA.get('/api/v1/alpha/:id', async () => ({ ok: true }))
  appA.get('/healthz', async () => ({ ok: true }))
  attachMetrics(appA, {
    config: { enabled: true, collectors: false, processMetrics: true },
  })

  const alpha = await appA.inject({ method: 'GET', url: '/api/v1/alpha/abc123' })
  check('templated route answers 200', alpha.statusCode === 200, alpha.statusCode)
  await appA.inject({ method: 'GET', url: '/healthz' })
  await appA.inject({ method: 'GET', url: '/api/v1/nowhere/xyz789' })

  const alphaLabels = {
    method: 'GET',
    route: '/api/v1/alpha/:id',
    status: '200',
  }
  check(
    'request counter uses the route template',
    (await seriesValue(httpRequestsTotal, alphaLabels)) === 1,
    await seriesValue(httpRequestsTotal, alphaLabels),
  )
  check(
    'latency histogram counts the request',
    (await seriesValue(
      httpRequestDurationSeconds,
      alphaLabels,
      'groovy_http_request_duration_seconds_count',
    )) === 1,
  )
  check(
    'health check is excluded from the histogram',
    (await seriesValue(httpRequestsTotal, { route: '/healthz' })) === undefined,
  )
  check(
    'unknown paths are labelled unmatched',
    (await seriesValue(httpRequestsTotal, { route: 'unmatched', status: '404' })) ===
      1,
  )

  console.log('\n2. Scrape endpoint')
  const scrape = await appA.inject({ method: 'GET', url: '/metrics' })
  const scrapeBody = scrape.body
  check('GET /metrics answers 200', scrape.statusCode === 200, scrape.statusCode)
  check(
    'content type is the Prometheus text format',
    String(scrape.headers['content-type']).includes('text/plain'),
    scrape.headers['content-type'],
  )
  check(
    'output carries the request metrics',
    scrapeBody.includes('groovy_http_requests_total{') &&
      scrapeBody.includes('groovy_http_request_duration_seconds_bucket'),
  )
  check(
    'output carries process metrics',
    scrapeBody.includes('groovy_process_cpu_user_seconds_total'),
  )
  check(
    'no raw url or id ever becomes a label',
    !scrapeBody.includes('abc123') && !scrapeBody.includes('xyz789'),
  )
  check(
    'the scrape itself is not counted as traffic',
    (await seriesValue(httpRequestsTotal, { route: '/metrics' })) === undefined,
  )
  check(
    'in-flight gauge is back to zero when idle',
    (await seriesValue(httpRequestsInFlight, {})) === 0,
    await seriesValue(httpRequestsInFlight, {}),
  )
  await appA.close()

  // -------------------------------------------------------------------------
  console.log('\n3. Token protection')
  const appB = Fastify(silent)
  attachMetrics(appB, {
    config: {
      enabled: true,
      collectors: false,
      processMetrics: false,
      token: 'sekret',
    },
  })
  const noToken = await appB.inject({ method: 'GET', url: '/metrics' })
  check('without a token it answers 401', noToken.statusCode === 401, noToken.statusCode)
  const bearer = await appB.inject({
    method: 'GET',
    url: '/metrics',
    headers: { authorization: 'Bearer sekret' },
  })
  check('with the bearer token it answers 200', bearer.statusCode === 200, bearer.statusCode)
  const wrongToken = await appB.inject({
    method: 'GET',
    url: '/metrics',
    headers: { authorization: 'Bearer nope' },
  })
  check('with a wrong token it answers 401', wrongToken.statusCode === 401)
  const queryToken = await appB.inject({ method: 'GET', url: '/metrics?token=sekret' })
  check('the ?token= shortcut works too', queryToken.statusCode === 200)
  await appB.close()

  // -------------------------------------------------------------------------
  console.log('\n4. Production stays locked unless asked otherwise')
  const previousEnv = process.env.NODE_ENV
  const appC = Fastify(silent)
  appC.get('/api/v1/gamma/:id', async () => ({ ok: true }))
  process.env.NODE_ENV = 'production'
  try {
    attachMetrics(appC, {
      config: { enabled: true, collectors: false, processMetrics: false },
    })
    const hidden = await appC.inject({ method: 'GET', url: '/metrics' })
    check(
      'production without a token hides the route',
      hidden.statusCode === 404,
      hidden.statusCode,
    )
    await appC.inject({ method: 'GET', url: '/api/v1/gamma/1' })
    check(
      'but requests are still measured',
      (await seriesValue(httpRequestsTotal, {
        route: '/api/v1/gamma/:id',
        status: '200',
      })) === 1,
    )
  } finally {
    process.env.NODE_ENV = previousEnv
    await appC.close()
  }

  // -------------------------------------------------------------------------
  console.log('\n5. Attaching twice does not double count')
  const appD = Fastify(silent)
  appD.get('/api/v1/delta/:id', async () => ({ ok: true }))
  const options = {
    config: { enabled: true, collectors: false, processMetrics: false },
  }
  attachMetrics(appD, options)
  attachMetrics(appD, options)
  await appD.inject({ method: 'GET', url: '/api/v1/delta/1' })
  check(
    'exactly one observation per request',
    (await seriesValue(httpRequestsTotal, {
      route: '/api/v1/delta/:id',
      status: '200',
    })) === 1,
  )
  await appD.close()

  // -------------------------------------------------------------------------
  console.log('\n6. Disabled means disabled')
  const appE = Fastify(silent)
  appE.get('/api/v1/epsilon/:id', async () => ({ ok: true }))
  attachMetrics(appE, {
    config: { enabled: false, collectors: false, processMetrics: false },
  })
  const disabled = await appE.inject({ method: 'GET', url: '/metrics' })
  check('no metrics route when disabled', disabled.statusCode === 404, disabled.statusCode)
  await appE.inject({ method: 'GET', url: '/api/v1/epsilon/1' })
  check(
    'no request is recorded when disabled',
    (await seriesValue(httpRequestsTotal, { route: '/api/v1/epsilon/:id' })) ===
      undefined,
  )
  await appE.close()

  // -------------------------------------------------------------------------
  console.log('\n7. Streams are counted, not timed')
  const appF = Fastify(silent)
  appF.get('/stream', async (request, reply) => {
    reply.hijack()
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    reply.raw.write('data: hello\n\n')
  })
  attachMetrics(appF, {
    config: {
      enabled: true,
      collectors: false,
      processMetrics: false,
      streamRoutes: ['/stream'],
      skipRoutes: ['/stream'],
    },
  })

  const address = await appF.listen({ port: 0, host: '127.0.0.1' })
  const controller = new AbortController()
  const streamResponse = await fetch(`${address}/stream`, {
    signal: controller.signal,
  })
  const reader = streamResponse.body!.getReader()
  await reader.read()

  check(
    'open stream is counted while it is open',
    await waitFor(
      async () => (await seriesValue(httpStreamsOpen, { route: '/stream' })) === 1,
    ),
  )

  await reader.cancel().catch(() => {})
  controller.abort()

  check(
    'the count drops back to zero when the client leaves',
    await waitFor(
      async () => (await seriesValue(httpStreamsOpen, { route: '/stream' })) === 0,
    ),
  )
  check(
    'the stream never enters the latency histogram',
    (await seriesValue(httpRequestDurationSeconds, { route: '/stream' })) ===
      undefined,
  )
  await appF.close()

  // -------------------------------------------------------------------------
  console.log('\n8. Configuration parsing')
  const disabledByEnv = readMetricsConfig({ NODE_ENV: 'test' } as NodeJS.ProcessEnv)
  check('tests get metrics off by default', disabledByEnv.enabled === false)
  const explicitOn = readMetricsConfig({
    NODE_ENV: 'test',
    METRICS_ENABLED: 'true',
    METRICS_PATH: 'internal/metrics',
    METRICS_TOKEN: ' x ',
    METRICS_POLL_MS: '500',
  } as NodeJS.ProcessEnv)
  check('METRICS_ENABLED=true wins', explicitOn.enabled === true)
  check('the path is normalised', explicitOn.path === '/internal/metrics')
  check('the token is trimmed', explicitOn.token === 'x')
  check(
    'a silly poll interval falls back to the default',
    explicitOn.pollIntervalMs === 15_000,
    explicitOn.pollIntervalMs,
  )
  check(
    'the metrics path and health checks are skipped by default',
    explicitOn.skipRoutes.includes('/internal/metrics') &&
      explicitOn.skipRoutes.includes('/healthz'),
  )
  check(
    'the SSE routes are known by default',
    explicitOn.streamRoutes.includes('/api/v1/player/session/events'),
  )

  console.log(`\n${checks - failures}/${checks} checks passed`)
  if (failures > 0) {
    throw new Error(`${failures} metrics check(s) failed`)
  }
  console.log('\nALL METRICS TESTS PASSED!\n')
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('METRICS TEST SUITE FAILED:', err)
    process.exit(1)
  })
