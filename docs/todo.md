# Groovy Rebuild - Implementation TODO & Roadmap

---

## 📋 Upcoming Sprints

### Sprint 2: Core Monolith API Modules (`server/src/modules/`)

- [x] **Auth Module**: Registration, login, Argon2id password hashing (portable Bun/Node abstraction), JWT signing, refresh token rotation with reuse detection via httpOnly cookies, Google OAuth with account linking, `requireAuth` / `requireRole` preHandler guards, and **Email Verification subsystem** (Brevo REST API with exponential backoff & dev console fallback, SHA-256 tokens in Redis with 24h TTL, 60s cooldown, 403 unverified login guard, and public resend endpoint).
- [x] **Storage & Pre-Signed Uploads Subsystem**: Upload preset registry (avatars, banners, covers, raw audio, lyrics, verification docs), S3/Cloudflare R2 client, and pre-signed PUT generator with domain authorization guards.
- [x] **User Management Module**: Profile update (`displayName`, `avatarUrl`) and password update with Argon2id and session revocation (`tokenVersion++`).
- [x] **Frontend Auth & Upload Test Harness (`client_test/`)**: React 19 + TanStack Router (file-based) + TanStack Query + Zustand store with silent 401 refresh queue.
- [x] **Setting-up Cloudflare R2 along with cdn**: setup Cloudflare R2 bucket with CORS policy, public development URL (CDN), API credentials, and end-to-end upload/retrieval verification.
- [x] **Artist Profile & Verification Module**: Instant upgrade from Listener to Artist, slug generation & dual-lookup (`:idOrSlug`), profile customization (bio, R2 banner, socials), follower system, and admin review desk (pitch, contact info, links verification).
- [x] **Catalog Module (Albums & Songs)**: Albums, songs metadata CRUD, multi-artist credits, and raw audio / cover pre-signed upload generator.
- [x] **Subscription & Entitlement Guard**: Middleware to enforce feature gating (`max_bitrate`, `lossless`, `can_host_jam`) based on active user plan, dynamic Feature Catalog for Admins, two-tier Redis caching, and mock checkout/upgrade workflow.
- [x] **Platform Caching & Hybrid Likes Architecture** (`docs/CACHING_AND_INVALIDATION_STRATEGY.md`):
  - Extracted standalone `server/src/db/redis.ts`.
  - Type-safe centralized key registry (`server/src/lib/cache/keys.ts`).
  - Cache manager with single-flight mutex lock (`SET lock:{key} 1 NX EX 5`), negative caching sentinel, and compound entity invalidators.
  - Hybrid Likes Service with Option A ACID durability, Redis in-memory sets (`SMISMEMBER` enrichment), and fast sync endpoints (`GET /api/v1/songs/liked/ids`, `GET /api/v1/albums/liked/ids`).
  - Global client Zustand store (`client_test/src/stores/likes.store.ts`) for 0ms optimistic UI toggles across albums, artists, and catalog views.
- [x] **Optimistic In-Memory & Redis Set Caching Expansion** (`docs/OPTIMISTIC_CACHING_EXPANSION_STRATEGY.md`):
  - [x] **Phase 1: Follows Caching & 0ms Optimistic UI**:
    - Backend Redis Set `groovy:social:user:{id}:following_artists` ($O(1)$ membership, zero-join `SMISMEMBER` roster enrichment).
    - Fast sync endpoint `GET /api/v1/artists/following/ids`.
    - Zero-DB profile visits and ACID durability in `artist_followers`.
    - Client `useFollowsStore` (`client_test/src/stores/follows.store.ts`) for 0ms follow toggles across artist pages and roster cards.
  - [x] **Phase 2: Pre-Saves Caching & 0ms Optimistic UI**:
    - Backend Redis Set `groovy:social:user:{id}:presaved_albums`.
    - Fast sync endpoint `GET /api/v1/albums/presaves/ids`.
    - Zero-join `SMISMEMBER` pre-save enrichment.
    - Client `usePreSavesStore` (`client_test/src/stores/presaves.store.ts`) for 0ms pre-save toggles on upcoming releases.
  - [x] **Phase 3: Dynamic Entitlements Caching & 0ms UI Gating**:
    - Backend Redis Set `groovy:sub:user:{id}:entitlements:set` and JSON caching with sub-millisecond Fastify streaming authorization gate (`SISMEMBER`) on `/songs/:id/stream?quality=flac`.
    - Client `useEntitlementsStore` (`client_test/src/stores/entitlements.store.ts`) for 0ms client-side feature checks, optimistic plan upgrades, and profile gating.
- [ ] **Social & Playback Modules** (Detailed Spec: `docs/AUDIO_PLAYER_QUEUE_AND_SOCIAL_ROADMAP.md`):
  - [x] **Playlists Subsystem**:
    - Complete CRUD, metadata editing, and owner display enrichment.
    - Dynamic auto-generated 2×2 mosaic covers (client-side CSS grid `<PlaylistCover />` based on top 4 constituent track album arts) with distinct artwork fallback.
    - Configurable duplicate songs setting per playlist (`allowDuplicates: boolean`).
    - Release visibility control (`PUBLIC`, `UNLISTED` with secure `shareToken`, `PRIVATE`).
    - Token-based collaboration lifecycle (invite tokens, join endpoint, token regeneration invalidating stale links, member kicking, and collaboration disable) backed by `playlist_collaborators` table.
    - Playlist cloning with security rules (Public & Unlisted cloneable with token; Private playlists strictly restricted to owner).
    - Sequential Integers Track Reordering (Atomic batch reorder via SQL `CASE` statement).
    - 4-Tier Hybrid In-Memory + Redis Set library saves architecture (`groovy:social:user:{id}:saved_playlists`, atomic `savesCount` counter, fast sync endpoint `GET /api/v1/playlists/saved/ids`, zero-join `SMISMEMBER` search enrichment).
    - Frontend client API client (`client_test/src/lib/playlists.api.ts`), TypeScript types (`client_test/src/types/playlist.ts`), `<PlaylistCover />` component, and `usePlaylistsStore` (`client_test/src/stores/playlists.store.ts`) wired into root auth sync.
  - [x] **Phase 1: Core Audio Player & Queue Subsystem**:
    - Global Zustand `usePlayerStore` (current track, user priority queue, context queue, history, playbackStatus, volume, seeking, shuffle, repeat modes, dynamic raw/HLS streaming with HLS.js fallback).
    - Global persistent `<PlayerBar />` UI (responsive mobile mini-player `h-16` with top 2px scrubber bar + desktop `h-20` 3-column deck; interactive links to album/artist; reactive like button; 3-dots action menu).
    - Interactive `<QueueDrawer />` UI (Now Playing card, user priority queue with native HTML5 drag-and-drop reordering, click-to-play any queue item, context queue, clear queue).
    - Universal `<SongActionMenu />` (Play Now, Play Next, Add to Queue, Add to Playlist modal picker, Go to Artist, Go to Album).
    - Full Catalog, Album, Artist, Playlist, and Home page integration with single audio engine.
    - Clean teardown on logout (pauses `<audio>`, destroys HLS.js, wipes `src`, clears queues and `localStorage`) with guest streaming access permitted (Option A).
    - Creator comment permission controls (`allowComments: boolean`) with toggle switches in Create/Edit Release (Studio), Create/Edit Playlist modals, and 1-click artist album page toggle.
    - Unauthenticated/Guest Auth Prompt Modal: Non-intrusive modal prompt ("Save your favorites", "Build your playlists") on Like or Add to Playlist actions with uninterrupted background playback and decoupled guest 401 handling in auth store.
    - `localStorage` persistence for queue, active song, volume, and playback preferences across reloads.
  - [x] **Phase 2: Playback Telemetry, History & Live Presence ("What Friends Are Listening To")**:
    - [x] **Presence Heartbeat & Multi-Device Takeover (Option A)**:
      - Client ping every 15s during playback to `POST /api/v1/player/heartbeat` tracking active device (`deviceId`, `deviceName`).
      - Redis presence key `groovy:presence:user:{id}` with 45s TTL and active lease key `groovy:player:active_device:{userId}`.
      - Option A soft pause / takeover semantics: Device B can take over playback lease (`takeover: true`); superseded device receives status `superseded` and gracefully pauses playback with user banner.
    - [x] **Cross-Device Playback State Persistence (Snapshots)**:
      - Snapshots stored in Redis `groovy:player:state:{userId}` on heartbeat, track change, or pause.
      - Seamless rehydration on login/app mount via `GET /api/v1/player/state` with zero audio glitches.
    - [x] **Playback Telemetry & 30-Second Rule**:
      - Client telemetric tracker recording qualified stream after 30 seconds of continuous playback via `POST /api/v1/player/telemetry/play`.
      - High-frequency buffer in Redis hash `groovy:telemetry:song_plays` with scheduled/batch write-behind flushing to PostgreSQL `songs.plays_count` and persistent logging to `listening_history`.
      - Fast recent history endpoint `GET /api/v1/player/history/recent` rendering the high-fidelity `<RecentlyPlayedShelf />` on the Catalog (`/`) and Profile (`/profile`) pages.
    - [x] **Social Follow, Friend Requests & Privacy Architecture**:
      - PostgreSQL schema: `follow_status` (`PENDING`, `ACCEPTED`), `listening_activity_privacy` (`FRIENDS_ONLY`, `FOLLOWERS`, `OFF`), `library_privacy` (`PUBLIC`, `FOLLOWERS_ONLY`, `PRIVATE`), and `user_follows` table.
      - Private account gating (`isPrivateAccount`): target user approval required (`PENDING`) or direct follow (`ACCEPTED`). Mutual accepted follow constitutes "Friends".
      - REST API (`/api/v1/social/`): follow, unfollow, accept/reject requests, incoming desk, mutual friends list, user directory search with live relationship status.
      - Real-time friends activity endpoint `GET /api/v1/player/friends-activity` with privacy filtering and sub-millisecond batch `redis.mget()`.
      - Complete UI integration: Dedicated `/activity` route (Live Sessions with spinning vinyl, Incoming Requests desk, Member Search directory), Profile Privacy Settings card, and desktop/mobile navigation links.
      - 100% backend test coverage across `player.test.ts` and `social.test.ts`.
  - [x] **Phase 3: Nested Comments Subsystem** (`docs/NESTED_COMMENTS_SUBSYSTEM_DESIGN.md`):
    - [x] Complete 2-level nested data model (`comments`, `comment_votes` with check constraint `chk_comments_single_target` across songs, albums, and playlists).
    - [x] Creator controls: configurable comment permissions (`allowComments: boolean`) per song, album, and playlist with 403 enforcement.
    - [x] Reddit-style two-way voting (Likes & Dislikes) with hybrid PostgreSQL durability + Redis Hash caching (`groovy:social:user:{id}:comment_votes`) and fast sync endpoint `GET /api/v1/comments/votes/mine`.
    - [x] Multi-mode sorting algorithms: `top`, `newest`, `oldest`, `disliked`, and `controversial`.
    - [x] Soft-delete thread preservation (`[Comment deleted]` placeholder with generic User avatar preserving child replies; hard-delete for leaf comments).
    - [x] Artist / Curator comment pinning mechanics (`isPinned: boolean` hoisted to top of discussions).
    - [x] Full Fastify REST API (`GET /`, `GET /:id/replies`, `POST /`, `PATCH /:id`, `DELETE /:id`, `POST /:id/vote`, `PATCH /:id/pin`, `GET /votes/mine`) with 100% test coverage (10-step integration suite).
    - [x] Client integration: TypeScript interfaces, `commentsApi`, 0ms synchronous optimistic `useCommentVotesStore`, `<CommentSection />`, `<CommentItem />`, and `<CommentForm />` embedded into Album and Playlist detail routes.
  - [ ] **Phase 4: Aggregated Social Feed**:
    - Chronological activity stream endpoint `GET /api/v1/social/feed` (new releases from followed artists, friend playlists, engagement milestones).
    - Cursor-based pagination with Redis caching.
    - Frontend `/feed` route with embedded playback shortcuts.

### Sprint 3: Real-Time Live Jam Service (`jam-service/`)

- [ ] Fastify + WebSocket / Socket.IO server.
- [ ] In-memory Redis session state (room metadata, queue, participants) - directly extending Phase 1's Queue.
- [ ] Server-anchored audio clock-sync algorithm for synchronized playback.

### Sprint 4: Media Transcoder Worker (`worker/`)

- [ ] BullMQ worker consuming `SONG_UPLOADED` jobs from Redis.
- [ ] FFmpeg multi-bitrate HLS segmentation (128k, 192k, 320k) and master playlist generation.
- [ ] Direct upload of `.m3u8` and `.ts` segments to Cloudflare R2.

### Sprint 5: Edge & Observability

- [ ] Cloudflare Worker proxy for HLS edge caching with $0 egress.
- [ ] Push metrics to Grafana Cloud Free Tier (P95 latency, RPS, active WebSocket rooms).
- [ ] Root `docker-compose.prod.yml` with Caddy automatic SSL for single-VM Oracle Cloud deployment.
