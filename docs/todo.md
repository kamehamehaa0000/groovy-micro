# Groovy Rebuild - Implementation TODO & Roadmap

# commands

- ```bash
   podman compose -f docker-compose.dev.yml up -d
  ```
- ```bash
   cd server && bun run db:push
  ```

- ```bash
   bun run src/db/seed.ts
  ```
- ```bash
   bun run db:studio
  ```

- ```bash
   bun run dev
  ```

---

## 📋 Upcoming Sprints

### Sprint 2: Core Monolith API Modules (`server/src/modules/`)

- [x] **Auth Module**: Registration, login, Argon2id password hashing (portable Bun/Node abstraction), JWT signing, refresh token rotation with reuse detection via httpOnly cookies, Google OAuth with account linking, and `requireAuth` / `requireRole` preHandler guards.
- [ ] **Catalog Module**: Artist profiles, albums, songs metadata CRUD, and S3/R2 Pre-Signed Upload URL generator.
- [ ] **Subscription & Entitlement Guard**: Middleware to enforce feature gating (`max_bitrate`, `lossless`, `can_host_jam`) based on active user plan.
- [ ] **Social Module**: Playlists CRUD, nested comments, and high-concurrency likes with Redis write-behind buffer.
- [ ] **Transactional Outbox Worker**: Background poller to publish pending `outbox_events` to Redis Streams.

### Sprint 3: Real-Time Live Jam Service (`jam-service/`)

- [ ] Fastify + WebSocket / Socket.IO server.
- [ ] In-memory Redis session state (room metadata, queue, participants).
- [ ] Server-anchored audio clock-sync algorithm for synchronized playback.

### Sprint 4: Media Transcoder Worker (`worker/`)

- [ ] BullMQ worker consuming `SONG_UPLOADED` jobs from Redis.
- [ ] FFmpeg multi-bitrate HLS segmentation (128k, 192k, 320k) and master playlist generation.
- [ ] Direct upload of `.m3u8` and `.ts` segments to Cloudflare R2.

### Sprint 5: Edge & Observability

- [ ] Cloudflare Worker proxy for HLS edge caching with $0 egress.
- [ ] Push metrics to Grafana Cloud Free Tier (P95 latency, RPS, active WebSocket rooms).
- [ ] Root `docker-compose.prod.yml` with Caddy automatic SSL for single-VM Oracle Cloud deployment.

```

```
