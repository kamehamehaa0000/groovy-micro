# Groovy Rebuild - Implementation TODO & Roadmap

---

## 📋 Upcoming Sprints

### Sprint 2: Core Monolith API Modules (`server/src/modules/`)

- [x] **Auth Module**: Registration, login, Argon2id password hashing (portable Bun/Node abstraction), JWT signing, refresh token rotation with reuse detection via httpOnly cookies, Google OAuth with account linking, `requireAuth` / `requireRole` preHandler guards, and **Email Verification subsystem** (Brevo REST API with exponential backoff & dev console fallback, SHA-256 tokens in Redis with 24h TTL, 60s cooldown, 403 unverified login guard, and public resend endpoint).
- [x] **Storage & Pre-Signed Uploads Subsystem**: Upload preset registry (avatars, banners, covers, raw audio, lyrics, verification docs), S3/Cloudflare R2 client, and pre-signed PUT generator with domain authorization guards.
- [x] **User Management Module**: Profile update (`displayName`, `avatarUrl`) and password update with Argon2id and session revocation (`tokenVersion++`).
- [x] **Frontend Auth & Upload Test Harness (`client_test/`)**: React 19 + TanStack Router (file-based) + TanStack Query + Zustand store with silent 401 refresh queue.
- [x] **Setting-up Cloudflare R2 along with cdn**: setup Cloudflare R2 bucket with CORS policy, public development URL (CDN), API credentials, and end-to-end upload/retrieval verification.
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
