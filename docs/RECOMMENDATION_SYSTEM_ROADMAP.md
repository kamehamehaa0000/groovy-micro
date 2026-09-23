# Music Recommendation System: Architecture Blueprint & Strategic Roadmap

## 1. Executive Summary & Vision

This document details the engineering blueprint, algorithmic strategies, data pipelines, and progressive roadmap for building a Spotify/Apple Music-grade music recommendation system for the platform.

The system is designed to leverage:
1. **Rich Acoustic & Catalog Taxonomy**: 30 Core Primary Genres, 300 Curated Sub-Genres (10 per genre), 12 Catalog Moods, Freeform Tags, BPM (tempo), Musical Key, and Algorithmic Energy ($0.00 - 1.00$).
2. **Explicit & Implicit User Signals**: Track likes, playlist additions, album saves, listen completions, repeat loops, and artist follows.
3. **Immediate Skip Negative Feedback Telemetry**: Negative preference signals captured whenever a track is skipped within $< 5.0$ seconds (`skipped: true`, `skip_duration_seconds`).
4. **Sub-second Execution**: A two-stage architecture (Fast Candidate Retrieval $\rightarrow$ Heavyweight Ranking & Diversity Filtering) with Redis caching.

---

## 2. The Data Foundation (Signals Inventory)

```
                            ┌─────────────────────────────────────────┐
                            │          USER FEEDBACK SIGNALS          │
                            └────────────────────┬────────────────────┘
                                                 │
                   ┌─────────────────────────────┴─────────────────────────────┐
                   ▼                                                           ▼
      ┌─────────────────────────┐                                 ┌─────────────────────────┐
      │     EXPLICIT SIGNALS    │                                 │     IMPLICIT SIGNALS    │
      ├─────────────────────────┤                                 ├─────────────────────────┤
      │ • Track Like (+3.0)     │                                 │ • Completion (+2.0)     │
      │ • Add to Playlist (+2.5)│                                 │ • Replay / Loop (+2.5)  │
      │ • Artist Follow (+2.0)  │                                 │ • Listen >30s (+1.0)    │
      │ • Album Save (+1.5)     │                                 │ • Skip 5-30s (-0.5)     │
      │ • Social Share (+1.0)   │                                 │ • Immediate Skip (-2.0) │
      └─────────────────────────┘                                 └─────────────────────────┘
```

### A. Item Features (The Song Representation)
Each track in the catalog is represented as a multidimensional vector containing:
- **Acoustic Tuple**:
  - `bpm`: Integer (normalized as $\frac{\text{bpm} - 60}{140} \in [0, 1]$).
  - `energy`: Float $\in [0.05, 0.99]$ (derived from EBU R128 integrated loudness & tempo).
  - `musical_key`: Harmonically mapped via the Camelot Wheel (pitch class distance).
  - `duration_seconds`: Float.
- **Taxonomic & Semantic Features**:
  - `primary_genre`: Categorical (1 of 30 core genres).
  - `sub_genre`: Categorical (1 of 300 granular subgenres).
  - `moods`: Multi-hot binary vector of 12 catalog moods.
  - `tags`: Bag-of-words / text embedding.
- **Graph & Provenance Features**:
  - `artist_id` and collaborator credits (featured artists, producers).
  - `release_date`: Freshness and release decay penalty.
  - `popularity`: Rolling 7-day play velocity.

### B. User Implicit Feedback Weighting Formula
For a given user $u$ and song $i$, the aggregate interaction weight $R_{u, i}$ is:

$$R_{u, i} = 3.0 \cdot \text{Like} + 2.5 \cdot \text{PlaylistAdd} + 2.0 \cdot \text{Completions} + 1.0 \cdot \text{Plays}_{>30s} - 2.0 \cdot \text{ImmediateSkips}_{<5s} - 0.5 \cdot \text{Skips}_{5-30s}$$

Where:
- $\text{ImmediateSkips}_{<5s}$ heavily penalizes tracks that the user rejected instantly.
- If $R_{u, i} < -1.0$, the track is actively filtered out from personalized radio and autoplay.

---

## 3. Two-Stage Recommendation Architecture

To serve millions of potential user sessions with sub-50ms latency, the system uses the industry-standard two-stage funnel:

```
┌────────────────────────────────────────────────────────┐
│  STAGE 1: CANDIDATE GENERATION (Retrieval)             │
│  Target: Filter catalog from 100,000+ tracks to 200    │
│  Latency budget: < 15ms                                │
│                                                        │
│  Sources:                                              │
│  • Collaborative Filtering (Item-Item nearest neighbors)│
│  • Acoustic Content-Based Similarity (KNN on BPM/Energy)│
│  • Playlist Co-Occurrence Graph                        │
│  • User Favorite Artist Fresh Drops                    │
└──────────────────────────┬─────────────────────────────┘
                           │ 200 Candidates
                           ▼
┌────────────────────────────────────────────────────────┐
│  STAGE 2: SCORING & RANKING                            │
│  Target: Sort 200 candidates to top 20-50 tracks       │
│  Latency budget: < 25ms                                │
│                                                        │
│  Operations:                                           │
│  • Score against User Taste Profile Vector             │
│  • Harmonic Key & BPM Transition Matching (Camelot)    │
│  • Immediate Skip Penalty Subtraction                  │
└──────────────────────────┬─────────────────────────────┘
                           │ Ranked Top 50
                           ▼
┌────────────────────────────────────────────────────────┐
│  STAGE 3: DIVERSITY, DEDUPLICATION & RE-RANKING        │
│  Target: Final stream / queue delivered to player      │
│  Latency budget: < 5ms                                 │
│                                                        │
│  Operations:                                           │
│  • Deduplicate tracks heard in the past 7 days         │
│  • Limit max 2 tracks per artist per 10-song window    │
│  • Exploration injection (10-15% novel discovery)      │
└────────────────────────────────────────────────────────┘
```

---

## 4. Phase-by-Phase Implementation Roadmap

### Phase 1: Heuristic & Acoustic Content-Based Engine
*Goal: Fast to ship, 0 ML Ops complexity, immediate support for "Track Radio", "Artist Radio", and "Autoplay Next".*

1. **Acoustic Similarity Function**:
   Compute distance between seed track $A$ and candidate track $B$:
   $$\text{Dist}(A, B) = w_g \cdot \mathbb{I}(\text{genre}_A \ne \text{genre}_B) + w_{sg} \cdot \mathbb{I}(\text{subgenre}_A \ne \text{subgenre}_B) + w_e \cdot |\text{energy}_A - \text{energy}_B| + w_b \cdot \frac{|\text{BPM}_A - \text{BPM}_B|}{50} + w_m \cdot (1 - \text{Jaccard}(\text{moods}_A, \text{moods}_B))$$
2. **Harmonic Key Compatibility (Camelot Wheel)**:
   - Tracks in compatible keys (same key, $\pm 1$ fifth, or relative major/minor) receive a scoring bonus for smooth transitions in Autoplay.
3. **Seed-to-Queue Endpoints**:
   - `GET /api/v1/recommendations/radio?seedSongId=...`
   - `GET /api/v1/recommendations/autoplay?currentSongId=...&history=[...]`
4. **Negative Filtering**:
   - Exclude any track where the current user logged `skipped = true` in the last 30 days.

### Phase 2: Playlist Co-occurrence & Graph Association
*Goal: Leverage collective user curation wisdom.*

1. **Playlist Co-Occurrence Matrix**:
   - Two songs $i$ and $j$ that frequently appear together in user playlists share a strong implicit connection regardless of genre label.
   - $\text{Affinity}(i, j) = \frac{|P_i \cap P_j|}{\sqrt{|P_i| \cdot |P_j|}}$, where $P_i$ is the set of playlists containing song $i$.
2. **Artist Affinity Graph**:
   - Computes "Fans Also Like" for artist profiles based on co-listening sessions.
3. **Scheduled Materialized Views**:
   - Nightly worker job pre-computing top 50 related tracks for each release into a Redis cache / database lookup table (`track_similarities`).

### Phase 3: Collaborative Filtering with Implicit Feedback (ALS)
*Goal: True personalization based on historical taste vectors.*

1. **Implicit Alternating Least Squares (iALS)**:
   - Construct sparse User-Item interaction matrix from $R_{u, i}$.
   - Decompose into User Latent Vectors $X_u \in \mathbb{R}^{64}$ and Item Latent Vectors $Y_i \in \mathbb{R}^{64}$.
   - Predicted affinity: $\hat{p}_{u, i} = X_u^T Y_i$.
2. **Handling the Cold-Start Problem**:
   - **New User**: Prompt with 3-5 favorite primary genres and moods during onboarding $\rightarrow$ initialize user vector from genre centroid.
   - **New Track**: Pure acoustic/taxonomy embedding matching existing cluster until the track accumulates its first 20 plays.
3. **Discovery vs. Familiarity Balance (80/20 Rule)**:
   - 70-80% Familiar / Exploitation (genres and artists the user frequently completes).
   - 20-30% Discovery / Exploration (novel artists within the user's preferred sub-genres).

### Phase 4: Real-time Session Awareness & Vector Search
*Goal: Spotify-grade "Discover Weekly", contextual mood feeds, and sub-10ms vector querying.*

1. **Vector Database Integration (`pgvector` or Qdrant/Milvus)**:
   - Store 128-dimensional hybrid embeddings (Acoustic + Tag semantic vector + Latent iALS factor) for each track.
   - Sub-5ms Approximate Nearest Neighbor (ANN) search via HNSW indexing.
2. **Contextual & Time-of-Day Adaptation**:
   - Morning: Boost `Focus / Study`, `Peaceful / Meditative`, lower energy.
   - Afternoon / Workout: Boost `Energetic`, `Workout / Hype`, BPM $125 - 145$.
   - Late Night: Boost `Lo-Fi / Chillhop`, `Dark / Moody`, `Ambient`.
3. **Session Fatigue & Frequency Capping**:
   - Deduplicate tracks played within the last 7 days.
   - Soft-cap: No more than 2 tracks from the same album or artist in any 15-track queue.

---

## 5. User-Facing Product Features Enabled

| Feature | Primary Algorithm | Refresh Cadence |
| :--- | :--- | :--- |
| **Track Radio / Infinite Autoplay** | Acoustic Nearest Neighbor + Camelot Key Transition | Real-time on queue drain |
| **Discover Weekly** | Hybrid iALS + Exploration Multi-Armed Bandit | Weekly (Monday 00:00 UTC) |
| **Daily Mood Mixes (12 Mixes)** | Mood Filter + User Taste Centroid Scoring | Daily at 04:00 UTC |
| **Artist Radio** | Artist Co-occurrence Graph + Subgenre Clustering | Real-time on demand |
| **"Because You Listened To [Track]"** | Item-to-Item Similarity | Cached 24 hours |
| **Fans Also Like (Artist Page)** | User Co-listening Bipartite Graph | Cached 48 hours |

---

## 6. Database Schema Additions for Future Phases

When transitioning from Phase 1 to Phase 2/3, the following schema additions will be introduced:

```sql
-- Track similarity cache table (Phase 1 & 2)
CREATE TABLE IF NOT EXISTS track_similarities (
  seed_song_id UUID NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  target_song_id UUID NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  similarity_score REAL NOT NULL,
  similarity_type VARCHAR(32) NOT NULL, -- 'ACOUSTIC', 'CO_OCCURRENCE', 'COLLABORATIVE'
  computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (seed_song_id, target_song_id, similarity_type)
);
CREATE INDEX idx_track_similarities_lookup ON track_similarities(seed_song_id, similarity_score DESC);

-- User taste centroid cache (Phase 2 & 3)
CREATE TABLE IF NOT EXISTS user_taste_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  top_primary_genres JSONB DEFAULT '[]'::jsonb,
  top_moods JSONB DEFAULT '[]'::jsonb,
  avg_bpm REAL DEFAULT 120.0,
  avg_energy REAL DEFAULT 0.5,
  skip_rate REAL DEFAULT 0.0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## 7. Metrics & Verification Framework

To evaluate recommendation performance objectively, the platform will monitor:

1. **Skip Rate at 5s (Negative Signal)**:
   - $\text{SkipRate}_{<5s} = \frac{\text{Skips}_{<5s}}{\text{Total Plays}}$. Target: $< 15\%$ on algorithmic queues.
2. **Completion Rate (Positive Signal)**:
   - $\text{CompletionRate} = \frac{\text{Listens}_{\ge 90\%}}{\text{Total Plays}}$. Target: $> 60\%$.
3. **Save/Like Conversion**:
   - Ratio of recommended plays that resulted in an explicit Like or Playlist Add.
4. **Session Listening Depth**:
   - Number of consecutive algorithmic tracks listened to before the user interrupts or leaves.
