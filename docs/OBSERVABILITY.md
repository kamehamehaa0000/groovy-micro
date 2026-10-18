# Observability: metrics for the Groovy API

This document explains the one thing that turns "the app feels slow" into a
number you can point at: **metrics**.

Everything here is already wired into the API. There is no separate service to
run; the API now exposes a `/metrics` page that Prometheus can read, and you can
put Grafana on top to draw it.

Plain-language summary:

- every request is **timed**, and the time is filed under the endpoint's *shape*
  (`/api/v1/songs/:id`), never the real URL;
- Redis, Postgres and the two BullMQ queues are **checked every 15 seconds**;
- all of it appears as text on `GET /metrics`;
- if you do not want any of it, one environment variable turns it off.

---

## 1. The 30-second version

```powershell
# Start the API (metrics are on by default outside production/tests)
cd server; bun run dev

# Look at the raw numbers
curl http://localhost:4000/metrics
```

In production, add `METRICS_TOKEN=some-long-secret` to the API environment, and
Prometheus sends it as `Authorization: Bearer some-long-secret`. Without a token
the endpoint is **not published at all** in production (it answers `404`), so you
cannot leak it by accident.

---

## 2. What gets measured

### Requests (this is the latency part)

| Metric | Meaning |
| --- | --- |
| `groovy_http_request_duration_seconds` | Histogram of how long each request took. Labels: `method`, `route`, `status`. |
| `groovy_http_requests_total` | Counter of requests. Labels: `method`, `route`, `status`. |
| `groovy_http_requests_in_flight` | How many requests are being handled right now. |
| `groovy_http_streams_open` | How many long-lived SSE connections are open. Label: `route`. |

`route` is always the **route template**, not the real URL. A request to
`/api/v1/songs/9f2c...` is filed under `/api/v1/songs/:id`. A request to a path
that does not exist is filed under `unmatched`, so a bot hammering
`/wp-login.php` cannot create a new series for every URL it guesses.

Three things are deliberately kept out of the latency histogram, because their
timings would be nonsense or noise:

- the SSE routes (`/api/v1/player/session/events`,
  `/api/v1/notifications/stream`) — they are counted in `groovy_http_streams_open`
  instead, since a connection that stays open for an hour is not a "slow
  request";
- `/healthz` — infrastructure polls it, not users;
- `/metrics` itself — the scrape would otherwise show up as traffic.

You can add or remove paths with `METRICS_SKIP_ROUTES` (see §6).

### Runtime (the "is the process healthy" part)

| Metric | Meaning |
| --- | --- |
| `groovy_process_cpu_seconds_total` | CPU time used. `rate()` it to get cores used. |
| `groovy_process_resident_memory_bytes` | RAM the process holds (RSS). |
| `groovy_nodejs_eventloop_lag_mean_seconds` | How late the event loop is running. Rising lag = the process is blocked, and *everything* gets slower. |
| `groovy_nodejs_eventloop_lag_p99_seconds` | The bad-case version of the same number. |
| `groovy_process_start_time_seconds` | When the process started (so you can see restarts). |

### Redis

| Metric | Meaning |
| --- | --- |
| `groovy_redis_up` | `1` if `PING` answered, `0` if not. |
| `groovy_redis_memory_used_bytes` | Memory Redis is using. |
| `groovy_redis_connected_clients` | Open client connections. |
| `groovy_redis_ops_per_sec` | Commands per second Redis is serving right now. |
| `groovy_redis_keyspace_keys{db="0"}` | How many keys are stored. |
| `groovy_redis_commands_processed_total`, `..._keyspace_hits_total`, `..._keyspace_misses_total` | Counters; hits vs misses gives you the cache hit ratio. |

### Postgres

| Metric | Meaning |
| --- | --- |
| `groovy_db_up` | `1` if a `SELECT 1` answered, `0` if not. |
| `groovy_db_connections_active` | Backends running a query right now. A line that climbs and stays up is the classic "stuck query". |
| `groovy_db_connections_idle` | Backends connected but doing nothing. Compare with the pool cap (`DB_MAX_CONNECTIONS`, default 20). |

### Background work (BullMQ)

| Metric | Meaning |
| --- | --- |
| `groovy_queue_jobs{queue, state}` | Jobs per queue and state: `waiting`, `active`, `completed`, `failed`, `delayed`, `paused`, ... |

Queues covered: `media-transcode` (audio conversion) and `scheduled-releases`
(album drops). A `waiting` line that keeps growing means the worker cannot keep
up.

### Is the monitor itself alive?

| Metric | Meaning |
| --- | --- |
| `groovy_metrics_collector_errors_total{collector}` | Failed health polls, per collector. |
| `groovy_metrics_last_collect_timestamp_seconds` | When the pollers last ran. |

These two exist so you never stare at an all-zero dashboard wondering whether the
backend is dead or the *monitoring* is broken.

---

## 3. Reading latency: what p90 / p95 / p99 mean

Say you have 100 requests:

- **p50 (median)** — 50 of them were faster than this, 50 slower. The "typical" user.
- **p90** — 90 were faster. 10 were slower. This is the "normal bad day" number.
- **p95** — 95 were faster. 5 were slower. This is what you usually promise users.
- **p99** — 99 were faster. **The slowest 1%.** This is where the pain hides: a
  single slow query or a lock can be invisible in the average and obvious here.

Averages are deliberately not used: one 30-second outlier among 1000 fast
requests drags an average around while hiding the fact that 1% of users are
furious.

### How they are computed

Prometheus cannot store every individual request time; the histogram stores
counters per bucket (`5ms`, `10ms`, `25ms`, ... `10s`). `histogram_quantile()`
then estimates the percentile from those buckets. So the numbers are close
approximations, and the bucket list is what makes them useful — ours is
`[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]` seconds, which is
fine-grained exactly where a music API lives (5–100 ms) and coarse where it does
not matter (seconds).

### The money query: latency per endpoint

```promql
# p95 latency of each endpoint over the last 5 minutes
histogram_quantile(
  0.95,
  sum by (route, le) (rate(groovy_http_request_duration_seconds_bucket[5m]))
)
```

Swap `0.95` for `0.9` or `0.99` for the other two. Add `topk(15, ...)` to get just
the worst offenders. This is exactly the "basic backend metric" that tells you
*which* endpoint to optimise, which a global average never does.

**Rate of requests per endpoint** (who is busy):

```promql
topk(10, sum by (route) (rate(groovy_http_requests_total[5m])))
```

**Error share** (is it broken?):

```promql
sum(rate(groovy_http_requests_total{status=~"5.."}[5m]))
  / clamp_min(sum(rate(groovy_http_requests_total[5m])), 0.0001)
```

---

## 4. Why route templates, not real URLs

Labels are the part of a metric that creates a new time series per combination.
Using something with unbounded values — a user id, a song id, a raw URL — means
unlimited series, unlimited memory, and a monitoring system that dies slowly.
So:

- `route` = the route template (`/api/v1/playlists/:id/tracks`) → ~100 values,
  stable forever;
- `method` → 6 values;
- `status` → a handful;
- everything else (user, song, device, session) is **never** a label.

This is not a style preference, it is the difference between a dashboard that
works for years and one that falls over in a month.

---

## 5. What is *not* measured (on purpose)

- **The jam service** (`jam-service`, port 4001) — it is a separate process. It
  can get the same treatment later; see §10.
- **The media conversion worker** (`media-convertion-worker`) — same thing. For
  now, use `groovy_queue_jobs{queue="media-transcode"}` to see whether it is
  behind.
- **Per-user or per-song behaviour.** Who listens to what is product analytics,
  not operations. The player telemetry (`listening_history`, play counts) already
  records that in the database, where it belongs.
- **Database query level timings.** Add that only when a specific endpoint's p99
  sends you hunting; the endpoint percentile is the signal, the query is the
  detail.

---

## 6. Turning it on and off

All settings are environment variables, read when the API boots.

| Variable | Default | What it does |
| --- | --- | --- |
| `METRICS_ENABLED` | on in dev and production, **off** when `NODE_ENV=test` | The master switch. `false` = no hooks, no timers, no `/metrics` route. |
| `METRICS_PATH` | `/metrics` | Where the endpoint lives. `internal/metrics` is normalised to `/internal/metrics`. |
| `METRICS_TOKEN` | unset | When set, `/metrics` needs `Authorization: Bearer <token>` (or `?token=`). **In production, without this the route is not published at all.** |
| `METRICS_ALLOW_PUBLIC` | `false` | Publish `/metrics` in production without a token. Only for a network nobody else can reach. |
| `METRICS_PROCESS` | `true` | Collect the process/Node runtime metrics. |
| `METRICS_COLLECTORS` | `true` | Poll Redis / Postgres / queues. |
| `METRICS_POLL_MS` | `15000` | How often the pollers run (minimum 1000). |
| `METRICS_STREAM_ROUTES` | *(see §2)* | Extra long-lived SSE paths to count instead of timing. |
| `METRICS_SKIP_ROUTES` | `/healthz`, `/metrics`, the SSE routes | Extra route templates to leave out of the latency histogram. |
| `METRICS_SERVICE_NAME` | `groovy-api` | The `service` label, useful when several services share one Prometheus. |

### What "off" actually means

With `METRICS_ENABLED=false` the API does **no work at all** for metrics: no
request hooks, no timers, no route, no prom-client process collector. Request
handling is the same code path as before this feature existed. That is the
intended way to disable it in an emergency:

```powershell
$env:METRICS_ENABLED="false"; bun run dev     # scrape endpoint is gone (404)
```

You do not need to remove the dependency or edit code.

### Production checklist

1. Set `METRICS_TOKEN` to a long random string.
2. Put the same string in `monitoring/secrets/metrics_token` (or your real
   deployment's secret store).
3. Scrape it from Prometheus:

```yaml
scrape_configs:
  - job_name: groovy-api
    metrics_path: /metrics
    authorization:
      type: Bearer
      credentials_file: /etc/prometheus/metrics_token
    static_configs:
      - targets: ["api.yourdomain.com:4000"]
```

4. Do not put `/metrics` behind the public CDN, and do not expose it on a port
   that is open to the internet without the token.

---

## 7. Running Prometheus + Grafana locally

The stack lives in `monitoring/` and is a compose file of its own, so it can be
started and stopped without touching anything else:

```powershell
podman compose -f monitoring/docker-compose.yml up -d
# API must be running and bound to 0.0.0.0 (it is, by default)
# Prometheus:  http://localhost:9090
# Grafana:     http://localhost:3000   (admin / groovy)
```

Both containers are configured by files, not clicking:

- `monitoring/prometheus.yml` — what to scrape;
- `monitoring/grafana/provisioning/` — the Prometheus datasource and the
  dashboard folder;
- `monitoring/grafana/dashboards/groovy-api.json` — the starter dashboard
  ("Groovy API — Health & Latency"): traffic per endpoint, error rate, p90/p95/p99,
  p95/p99 tables per endpoint, SSE streams, backend health, queue depth, Redis
  detail and runtime.

To stop it: `podman compose -f monitoring/docker-compose.yml down`
(add `-v` to also throw away the collected data).

### Why this stack uses host networking

On Windows the podman machine is a WSL VM running with *mirrored* networking: the
VM shares the Windows IP address. From a normal (bridged) container,
`host.docker.internal` resolves to the VM's own bridge gateway, so the scrape
dies with `connect: connection refused` on something like `10.89.1.1:4000` — the
packets never leave the VM. The VM's loopback, however, does reach Windows.

`network_mode: host` puts the containers in the VM's network namespace, which is
that loopback: the API is then simply `127.0.0.1:4000`, and no port mapping is
needed because Grafana and Prometheus listen on the VM's own 3000/9090 (which
Windows reaches at `localhost`).

On a Linux server or Docker Desktop, drop `network_mode: host`, publish the
ports, set `PROMETHEUS_URL=http://prometheus:9090` and scrape
`host.docker.internal:4000` instead. `monitoring/README.md` has the exact diff.

### If the target is still DOWN

Check, in order:

```powershell
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:4000/metrics   # expect 200
curl.exe -s http://localhost:9090/api/v1/targets                        # expect health=up
```

Then confirm the API is bound to `0.0.0.0` (it is: `host = '0.0.0.0'` in
`server/src/index.ts`); if it only listened on `127.0.0.1` a remote scrape would
be refused.

---

## 8. Doing this in production

The instrumentation is identical in every option below, so this is a reversible
choice — start with whichever is less work today.

| Option | Good when | Notes |
| --- | --- | --- |
| The same compose stack on the API's server | you already have one VPS/Docker host | Simplest. Keep Prometheus bound to localhost/VPN. |
| **Grafana Cloud (free tier) + Grafana Alloy** | you do not want to operate Prometheus | Alloy runs on the server, scrapes `/metrics`, pushes to Grafana. Free tier is plenty for one API. |
| Managed Prometheus (AWS/GCP/Azure) | the API is already in that cloud | Agent-based scraping; a bit more setup. |

Practical points for any of them:

- **Retention:** 30 days of raw samples is a sane default (`--storage.tsdb.retention.time=30d`).
- **Scrape interval:** 15s matches the collectors; there is no point scraping
  faster, since the HTTP histogram buckets are cumulative counters.
- **Cardinality:** the design above keeps the series count in the low hundreds
  (~100 routes × few methods × few statuses + runtime + Redis + Postgres +
  queues). If a dashboard suddenly has thousands of series, something derived a
  label from user data — that is the bug.
- **Storage:** raw samples for the API above are a few MB per day. You will run
  out of disk for other reasons first.

### Alerts worth having on day one

| Symptom | PromQL | Starting threshold |
| --- | --- | --- |
| API is broken | `sum(rate(groovy_http_requests_total{status=~"5.."}[5m])) / clamp_min(sum(rate(groovy_http_requests_total[5m])), 0.0001)` | `> 0.02` for 10m |
| An endpoint got slow | `histogram_quantile(0.95, sum by (route, le) (rate(groovy_http_request_duration_seconds_bucket[5m])))` | `> 1` (1s) for 10m |
| Database gone | `groovy_db_up` | `== 0` for 2m |
| Cache gone | `groovy_redis_up` | `== 0` for 2m |
| Upload backlog | `groovy_queue_jobs{queue="media-transcode",state="waiting"}` | `> 50` for 15m |
| Process stuck | `groovy_nodejs_eventloop_lag_p99_seconds` | `> 0.5` for 10m |
| Monitoring itself broken | `time() - groovy_metrics_last_collect_timestamp_seconds` | `> 120` for 10m |

Adjust the thresholds to your traffic; they are starting points, not gospel.

---

## 9. Adding your own metric

Metrics live in `server/src/lib/metrics/metrics.ts`. Add the metric there, then
use it anywhere:

```ts
// 1. define it once (metrics.ts)
export const playerCommandsTotal = new Counter({
  name: 'groovy_player_commands_total',
  help: 'Player commands received, by command type.',
  labelNames: ['type'] as const,   // bounded values only!
  registers: [registry],
})

// 2. use it wherever the thing happens
playerCommandsTotal.inc({ type: command.type })
```

Rules that keep this safe:

1. **Never** label with a user id, song id, device id, session id or a free-text
   value. If you feel the urge, what you actually want is a log line or a
   database row.
2. Keep label values from a fixed list (an enum, a route template, a status).
3. Counter = "how many times did this happen" (only goes up). Gauge = "what is
   the value right now" (up and down). Histogram = "how long / how big".
4. If a metric only exists to answer a product question ("how many people
   pressed shuffle?"), do not put it here — that belongs in the database.

When metrics are disabled, the metric object still exists (so the code compiles
and never crashes) but nothing scrapes it, and the request hooks that would call
it are not registered.

---

## 10. Doing the same for the other services

`jam-service` and `media-convertion-worker` are separate processes, so each needs
its own `/metrics` endpoint and its own scraper job. The work is the same shape:

1. copy `server/src/lib/metrics/` into the service (or publish it as a shared
   package later);
2. `attachMetrics(app, { deps: { ... } })` at boot;
3. add a second `scrape_configs` entry in `prometheus.yml`:

```yaml
  - job_name: groovy-jam
    metrics_path: /metrics
    static_configs:
      - targets: ["host.docker.internal:4001"]
```

The `service="..."` label (`METRICS_SERVICE_NAME`) is what keeps the two apart in
Grafana when they are in the same datasource. The SSE gauge is only meaningful in
the API, so the jam service would drop that one.

---

## 11. Where the code lives

| File | What it does |
| --- | --- |
| `server/src/lib/metrics/config.ts` | Reads the environment variables, decides whether the endpoint may be published. |
| `server/src/lib/metrics/metrics.ts` | The registry and every metric definition (the list in §2). |
| `server/src/lib/metrics/attach.ts` | The request hooks, the `/metrics` route, and its token check. |
| `server/src/lib/metrics/collectors.ts` | The Redis / Postgres / BullMQ pollers. |
| `server/src/lib/metrics/index.ts` | The public surface: `attachMetrics(...)` and the metric objects. |
| `server/src/lib/metrics/metrics.test.ts` | 31 checks covering the hooks, labels, protection, disable path and streams. |
| `server/src/index.ts` | One call to `attachMetrics(...)` inside `bootstrap()`. |
| `monitoring/` | Prometheus + Grafana compose stack, scrape config and dashboard. |

### Two details worth knowing when debugging

- `groovy_http_requests_in_flight` reads **1 while a scrape is happening** — the
  scrape request is itself a request being handled. That is expected.
- The first collector poll runs 1 second after boot and then every
  `METRICS_POLL_MS`. If Redis or Postgres is down at startup, the `*_up` gauges
  read `0` and `groovy_metrics_collector_errors_total` climbs; the API itself
  keeps running exactly as before.
