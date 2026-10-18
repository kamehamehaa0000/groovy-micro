# Groovy monitoring stack

Prometheus + Grafana for the Groovy API. Start and stop it independently of
everything else:

```powershell
podman compose -f monitoring/docker-compose.yml up -d
podman compose -f monitoring/docker-compose.yml down
```

| | |
| --- | --- |
| Grafana | http://localhost:3000 — `admin` / `groovy` (override with `GRAFANA_USER` / `GRAFANA_PASSWORD`) |
| Prometheus | http://localhost:9090 |
| Scrape target | the API on the host, port 4000 (`host.docker.internal:4000`) |
| Dashboard | "Groovy API — Health & Latency", provisioned automatically |

The API's metrics endpoint has to be reachable before this is useful:

```powershell
cd server; bun run dev            # metrics on by default outside production/tests
curl http://localhost:4000/metrics
```

## Files

| File | What it is |
| --- | --- |
| `docker-compose.yml` | The two containers (Prometheus, Grafana) and their volumes. |
| `prometheus.yml` | What to scrape and how often. Edit the `targets` for a deployed API. |
| `secrets/metrics_token` | The bearer token Prometheus sends. Must match the API's `METRICS_TOKEN`. A placeholder is fine in development, where the API ignores it. |
| `grafana/provisioning/` | Datasource + dashboard folder, applied on start. |
| `grafana/dashboards/groovy-api.json` | The starter dashboard. Edit it in the UI if you like, re-export to keep it. |

## Production

1. On the API: `METRICS_TOKEN=<long random string>`.
2. Here: put the same value in `secrets/metrics_token` (or mount your secret
   store's file at `/etc/prometheus/metrics_token`).
3. Point `prometheus.yml` at the real API host instead of `host.docker.internal`.
4. Reload: `curl -X POST http://localhost:9090/-/reload`.

Turning metrics off entirely is an API-side switch, not a stack-side one:
`METRICS_ENABLED=false` (the `/metrics` route then answers 404).

Full explanation of every metric, the percentiles and the alerting ideas:
[`../docs/OBSERVABILITY.md`](../docs/OBSERVABILITY.md).

## Troubleshooting

- **Prometheus target is DOWN** — the containers cannot see your host's
  `localhost`. Check the target IP in `prometheus.yml`, and confirm the API is
  bound to `0.0.0.0` (it is, by default).
- **Grafana dashboard is empty** — open Prometheus → Status → Targets and confirm
  the `groovy-api` job is UP; then on Grafana's Explore page check that
  `groovy_http_requests_total` returns data.
- **Everything reads zero** — the API may have no traffic yet. Make a few
  requests, then check `/metrics` directly.
- **401 on /metrics** — the API has `METRICS_TOKEN` set; make sure
  `secrets/metrics_token` holds the same value.
