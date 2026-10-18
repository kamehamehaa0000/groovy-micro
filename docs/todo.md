# Groovy Rebuild - Implementation TODO & Roadmap

---

## ✅ Completed Sprints

## 📋 Upcoming Sprints

### Sprint 5: Edge & Observability

- [ ] Cloudflare Worker proxy for HLS edge caching with $0 egress.
  - [ ] Push metrics to Grafana Cloud Free Tier (P95 latency, RPS, active WebSocket rooms).
- [ ] Root `docker-compose.prod.yml` with Caddy automatic SSL for single-VM Oracle Cloud deployment.

### Sprint 6: In-App Notifications & Lyrics Subsystem
- [ ] **Lyrics Subsystem**:
  - Synced (timestamped `.lrc` format) and unsynced plain-text lyrics metadata storage and R2 file uploads.
  - CRUD endpoints on songs (`PUT /api/v1/songs/:id/lyrics`).
  - Player drawer synchronized lyrics sheet with live line highlighting following playback position.
- [ ] **Server-Based Edge Caching & Cloudflare Tunnel Switchover**:
  - Fastify / Nginx stream caching proxy service for persistent VM deployment (Oracle Cloud Always Free / VPS) as an alternative to serverless Workers.
  - Cloudflare Tunnel (`cloudflared`) Docker service with zero open inbound ports and encrypted edge routing.
  - Dual-mode switchover configuration (`STREAM_ROUTING_MODE: 'worker' | 'tunnel'`) enabling instant switch from `*.workers.dev` to custom domain edge caching whenever a domain becomes available.
