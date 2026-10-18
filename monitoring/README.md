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
| Scrape target | the API on this machine, port 4000 (`127.0.0.1:4000`) |
| Dashboard | "Groovy API — Health & Latency", provisioned automatically |

The API's metrics endpoint has to be reachable before this is useful:

```powershell
cd server; bun run dev            # metrics on by default outside production/tests
curl http://localhost:4000/metrics
```

Both containers use `network_mode: host`. That is deliberate and it is what makes
the scrape work on Windows: the podman machine is a WSL VM with *mirrored*
networking, so it shares the Windows IP address. From a bridged container,
`host.docker.internal` resolves to the VM's own bridge gateway (a connection
refused), while the VM's loopback does reach Windows. Sharing the VM's network
namespace puts the containers on that loopback, where `127.0.0.1:4000` is the
API. As a bonus there is no port mapping to keep in sync — 3000 and 9090 are
simply the VM's ports, which Windows reaches at `localhost`.

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

## If you are not on Windows + podman

The host networking above is a Windows-podman requirement. On a Linux server, or
with Docker Desktop, use a normal container network instead — then
`host.docker.internal` (or the service name) works as usual:

```yaml
services:
  prometheus:
    # remove: network_mode: host
    ports: ["9090:9090"]
    extra_hosts: ["host.docker.internal:host-gateway"]
  grafana:
    # remove: network_mode: host
    ports: ["3000:3000"]
    environment:
      PROMETHEUS_URL: http://prometheus:9090
```

…and in `prometheus.yml` use `host.docker.internal:4000` (Docker Desktop) or the
API's real hostname as the scrape target.

## Troubleshooting

- **"Error scraping target: connection refused ... 10.89.1.1:4000"** — you are
  seeing the Windows + podman mirrored-networking problem described above:
  `host.docker.internal` points at the podman VM itself, not at Windows. Use the
  shipped config (`network_mode: host` + `127.0.0.1:4000`), and confirm the API
  really is listening:
  `curl.exe -s -o NUL -w "%{http_code}" http://localhost:4000/metrics` → 200.
- **Grafana dashboard is empty** — open Prometheus → Status → Targets and confirm
  the `groovy-api` job is UP; then on Grafana's Explore page check that
  `groovy_http_requests_total` returns data.
- **Everything reads zero** — the API may have no traffic yet. Make a few
  requests, then check `/metrics` directly.
- **401 on /metrics** — the API has `METRICS_TOKEN` set; make sure
  `secrets/metrics_token` holds the same value.
