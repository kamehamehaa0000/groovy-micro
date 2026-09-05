# Groovy Streaming - PostgreSQL Database Design

This document details the complete production PostgreSQL schema design for the rebuilt **Groovy Streaming** platform, including SQL DDL definitions, indexing strategies, and the specific product features each table supports.

---

## Domain 1: Identity & Artist Management

### 1. `users`
**Features Supported:**
- Email/password authentication and OAuth (Google, etc.) with unified account linking.
- Role-based authorization (`LISTENER`, `ARTIST`, `ADMIN`).
- Instant token revocation: `token_version` allows invalidating all active refresh tokens on security events without in-memory blacklists.
- Account suspension and soft deletion (`is_active`).

```sql
CREATE TYPE user_role AS ENUM ('LISTENER', 'ARTIST', 'ADMIN');

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),                    -- Nullable for OAuth-only users
    display_name VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    role user_role NOT NULL DEFAULT 'LISTENER',
    is_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,       -- Account suspension or deactivation
    token_version INTEGER NOT NULL DEFAULT 0,      -- Incrementing revokes all existing refresh tokens
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
```

---

### 2. `artist_profiles`
**Features Supported:**
- 1:1 Profile for users with the `ARTIST` role (a user can claim an artist profile without creating a separate login).
- Verification badge ("blue tick" verification).
- Public artist page customization (bio, banner image, social links).
- Monthly listener count caching (updated asynchronously by an analytics worker).

```sql
CREATE TABLE artist_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stage_name VARCHAR(150) NOT NULL,
    bio TEXT,
    banner_url TEXT,
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    monthly_listeners INTEGER NOT NULL DEFAULT 0,
    social_links JSONB DEFAULT '{}'::jsonb,       -- e.g. {"instagram": "...", "twitter": "..."}
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_artists_stage_name ON artist_profiles(stage_name);
```

---

### 3. `artist_followers`
**Features Supported:**
- "Follow Artist" button.
- Feeds user "New Releases from Artists You Follow" notifications.
- Composite primary key prevents duplicate follows.

```sql
CREATE TABLE artist_followers (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    artist_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, artist_id)
);

CREATE INDEX idx_artist_followers_artist ON artist_followers(artist_id);
```

---

## Domain 2: Subscriptions & Entitlements

### 4. `subscription_plans`
**Features Supported:**
- Tiered subscriptions (e.g. `free`, `premium_individual`, `premium_student`).
- Dynamic feature flags (`features` JSONB): Controls maximum bitrate (128k vs 320k), ad-free listening, lossless audio, and maximum participants in Live Jam rooms without requiring code deploys.

```sql
CREATE TABLE subscription_plans (
    id VARCHAR(50) PRIMARY KEY,                    -- e.g. 'free', 'premium_individual'
    name VARCHAR(100) NOT NULL,
    price_cents INTEGER NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    interval VARCHAR(20) NOT NULL DEFAULT 'month', -- 'month', 'year', 'lifetime'
    features JSONB NOT NULL DEFAULT '{
        "max_bitrate_kbps": 128,
        "lossless": false,
        "ad_free": false,
        "can_host_jam": false,
        "max_jam_participants": 3
    }'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);
```

---

### 5. `user_subscriptions`
**Features Supported:**
- Tracks the active plan of each user. Every user is given the `'free'` plan by default.
- Payment gateway readiness: Stores external customer & subscription IDs (Stripe/Razorpay/LemonSqueezy) for zero-schema-change payment integration later.
- Grace periods & cancellation scheduling (`cancel_at_period_end`).

```sql
CREATE TYPE subscription_status AS ENUM (
    'active', 'trialing', 'past_due', 'canceled', 'incomplete'
);

CREATE TABLE user_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id VARCHAR(50) NOT NULL REFERENCES subscription_plans(id),
    status subscription_status NOT NULL DEFAULT 'active',
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_period_end TIMESTAMPTZ,                -- NULL for lifetime/free plans
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    external_customer_id VARCHAR(255),             -- e.g. Stripe cus_xxx
    external_subscription_id VARCHAR(255),         -- e.g. Stripe sub_xxx
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_subscriptions_user ON user_subscriptions(user_id);
```

---

## Domain 3: Music Catalog & Audio Pipeline

### 6. `albums`
**Features Supported:**
- Album, EP, and Single releases.
- Release date tracking for release radar algorithms.
- Explicit content flag at the album level.

```sql
CREATE TYPE album_type AS ENUM ('ALBUM', 'SINGLE', 'EP');

CREATE TABLE albums (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artist_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    album_type album_type NOT NULL DEFAULT 'ALBUM',
    cover_image_url TEXT NOT NULL,
    release_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_albums_artist ON albums(artist_id);
```

---

### 7. `songs`
**Features Supported:**
- Complete audio lifecycle: Tracks raw upload to Cloudflare R2 (`raw_audio_key`), transcode progress (`processing_status`), and final multi-bitrate HLS manifest (`hls_manifest_url`).
- Album track numbering and disc numbers.
- Global play count and like count caching (for fast sorting on "Top Tracks" without slow table joins).
- Search optimization index (Full-text search on song titles via `pg_trgm`).

```sql
CREATE TYPE song_status AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

CREATE TABLE songs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artist_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
    album_id UUID REFERENCES albums(id) ON DELETE SET NULL, -- Single releases may not require an album
    title VARCHAR(255) NOT NULL,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    track_number INTEGER DEFAULT 1,
    disc_number INTEGER DEFAULT 1,
    is_explicit BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Audio Processing Fields
    raw_audio_key TEXT,                            -- Temporary original uploaded file path in R2
    hls_manifest_url TEXT,                         -- Cloudflare CDN URL to master.m3u8
    processing_status song_status NOT NULL DEFAULT 'PENDING',
    processing_error TEXT,                         -- Debugging info if FFmpeg fails
    
    -- Cached Aggregates for Instant Reads
    plays_count BIGINT NOT NULL DEFAULT 0,
    likes_count INTEGER NOT NULL DEFAULT 0,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_songs_artist ON songs(artist_id);
CREATE INDEX idx_songs_album ON songs(album_id);
CREATE INDEX idx_songs_status ON songs(processing_status);
-- Fast full-text search index for the search bar:
CREATE INDEX idx_songs_title_trgm ON songs USING gin (title gin_trgm_ops);
```

---

## Domain 4: Playlists & User Library

### 8. `playlists`
**Features Supported:**
- User-created custom playlists.
- Public vs Private playlists.
- Collaborative playlists (allowing multiple friends to add tracks).

```sql
CREATE TABLE playlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    cover_image_url TEXT,
    is_public BOOLEAN NOT NULL DEFAULT TRUE,
    is_collaborative BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_playlists_owner ON playlists(owner_id);
```

---

### 9. `playlist_songs`
**Features Supported:**
- Custom drag-and-drop track ordering (`position` column).
- Collaborative attribution: Tracks who added which song to the playlist (`added_by_user_id`).

```sql
CREATE TABLE playlist_songs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    playlist_id UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    song_id UUID NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    added_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,                     -- For custom ordering within the playlist
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (playlist_id, song_id)                  -- Prevents adding duplicate songs to the same playlist
);

CREATE INDEX idx_playlist_songs_order ON playlist_songs(playlist_id, position);
```

---

### 10. `user_library_albums`
**Features Supported:**
- "Save Album to Library" feature.
- Instant user library page rendering.

```sql
CREATE TABLE user_library_albums (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    album_id UUID NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
    saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, album_id)
);
```

---

### 11. `user_library_playlists` (Saving 3rd-Party Playlists)
**Features Supported:**
- "Save Playlist to Library" / "Follow Playlist" feature.
- Allows users to bookmark public playlists created by *other* users, artists, or editorial curators into their own library without duplicating playlist records.
- Enables computing playlist popularity / followers (`COUNT(*)`).

```sql
CREATE TABLE user_library_playlists (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    playlist_id UUID NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, playlist_id)
);

CREATE INDEX idx_user_library_playlists_user ON user_library_playlists(user_id);
```

---

## Domain 5: Social Interactions (Likes & Nested Comments)

### 12. `song_likes`
**Features Supported:**
- "Heart" button on songs.
- Powers the user's automated "Liked Songs" collection.
- Composite primary key prevents duplicate likes.

```sql
CREATE TABLE song_likes (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    song_id UUID NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, song_id)
);

CREATE INDEX idx_song_likes_user ON song_likes(user_id);
```

---

### 13. `comments`
**Features Supported:**
- Song discussion threads.
- Threaded replies: Handled via self-referential `parent_comment_id` (enables Reddit/YouTube-style reply trees).
- Timestamped song comments: `timestamp_seconds` allows users to comment on specific moments in a track (SoundCloud-style).

```sql
CREATE TABLE comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    song_id UUID NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_comment_id UUID REFERENCES comments(id) ON DELETE CASCADE, -- NULL = Top-level comment
    content TEXT NOT NULL,
    timestamp_seconds INTEGER,                     -- Optional: comment linked to a specific playback second
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comments_song ON comments(song_id);
CREATE INDEX idx_comments_parent ON comments(parent_comment_id);
```

---

## Domain 6: Analytics & Listening History

### 14. `listening_history`
**Features Supported:**
- "Recently Played" screen on the client.
- Song recommendation algorithms and Spotify Wrapped-style metrics.
- Fraud prevention: `completed` flag ensures play counts are only incremented when users listen past a threshold (e.g. >30 seconds).

```sql
CREATE TABLE listening_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    song_id UUID NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    duration_listened_seconds INTEGER NOT NULL,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    played_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_history_user_recent ON listening_history(user_id, played_at DESC);
```

---

## Domain 7: Reliability & Event Consistency (Outbox)

### 15. `outbox_events`
**Features Supported:**
- Implements the **Transactional Outbox Pattern**.
- Solves dual-write inconsistencies permanently: Database mutations and event emissions occur within the **same ACID transaction**.
- A background worker reads unprocessed records, publishes them to Redis Streams, and marks `published_at = NOW()`.
- State recovery: Allows full event replay if services ever need to rebuild state.

```sql
CREATE TABLE outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type VARCHAR(50) NOT NULL,           -- e.g. 'SONG', 'USER', 'SUBSCRIPTION'
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(100) NOT NULL,              -- e.g. 'SONG_UPLOADED', 'USER_REGISTERED'
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ,                      -- NULL indicates pending dispatch
    retry_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT
);

CREATE INDEX idx_outbox_pending ON outbox_events(created_at) WHERE published_at IS NULL;
```
