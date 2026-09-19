  ### Architectural Analysis & Findings from Codebase

  During codebase inspection of storage.service.ts, artists.service.ts, player.service.ts, and the client, several key details were
  identified:

  1. Multi-Artist & Collaborator Relational Model:
      • Groovy already has a dedicated catalog.ts:163 table (songId, artistId, role) with enum roles PRIMARY, FEATURED, PRODUCER, etc.
      Currently, bulk personal import lumps comma-separated artist strings into a single monolithic string rather than splitting them
      into primary and featured credits.
  2. Personal Artist Privacy Leak:
      • In artists.service.ts:138, artist profiles are fetched and cached in Redis without checking artistProfiles.scope or
      artistProfiles.ownerUserId. A user who enters the URL of a personal artist from another browser could view that private artist
      profile!
  3. Soft-Deleted Songs in Listen History:
      • In player.service.ts:249-260, the query lacks isNull(songs.deletedAt). This is why soft-deleted songs continued appearing in
      recent play history.
  4. Soft-Deleted Songs Cache Invalidation:
      • Soft-deleting songs/releases in storage.service.ts did not evict cacheKeys.catalog.song(songId) from Redis, leaving deleted
      songs cached for up to 10 minutes.
## Detailed Plan for the 7 Refactors

  ### 1. Client-Side Deduplication on Upload

  • Current state: Staged tracks are parsed into releases without checking for duplicate files within the batch or against songs
  already saved in the collection.
  • Solution:
      • Normalization Key: Generate a composite fingerprint for each audio track:


    key = lower(trim(title)) + "::" + lower(trim(artistName)) + "::" + lower(trim(albumTitle)) + "::" + Math.round(durationSeconds)

    *(duration matched within a ±2-second tolerance)*.

  • Deduplication Checkpoints:
      1. Intra-batch: Prevent the same file or identical song dropped twice in the same upload queue.
      2. Collection-aware: Compare against existing tracks in personalReleases (already loaded in client state).
  • User Clarification UI:
      • Filter out duplicates automatically during parsing.
      • Show an alert banner in the Import tab:
      │ "⚡ 3 duplicate track(s) were automatically detected and removed from the upload queue (already in collection or duplicate
      │ file)."

      • Add a small expandable "View skipped tracks" drawer showing titles and reasons.

  ──────
  ### 2. Server-Side Deduplication on Upload & Import

  • Current state: POST /bulk-import-release blindly inserts all tracks in the payload.
  • Solution:
      • Authoritative Server Check:
      In storage.service.ts:241:
          1. Query all active personal songs owned by this user:
            SELECT id, title, duration_seconds, artist_id FROM songs 
            WHERE uploader_user_id = $1 AND scope = 'PERSONAL' AND deleted_at IS NULL

          2. Before inserting each track in input.tracks:
              • Match by case-insensitive title and duration within ±2 seconds where the artist profile matches this user's personal
              artist.
              • If a match exists: skip inserting that song and do not queue an audio transcoding outbox event.
          3. If all tracks in a release are duplicates, skip creating the album and return { skippedDuplicates: count, message: "All
          tracks already exist in your personal collection" }.
          4. Recalculate the album's totalTracks and totalDurationSeconds based solely on actually created tracks.
          5. Return { album, artist, tracks, skippedDuplicates: number } in the API response.

 ### 3. 

  ──────
  ### 4. Multi-Artist Parsing & Collaborator Profiles

  • Current state: "artist1, ARTIST 2, aRtist3" creates a single monolithic personal artist with that full comma-separated name.
  • Solution:
      • Parsing String into Primary + Collaborators:
          • Extract artist names by splitting on separators: ,, /, ;, feat., ft., &.
          • Trim and clean each name.
          • names[0] → Primary Artist.
          • names.slice(1) → Collaborators / Featured Artists.
      • Per-Artist Deduplication in Database:
          • For each artist name (primary and collaborators):
              • Query artistProfiles where ownerUserId = userId AND scope = 'PERSONAL' AND lower(stageName) = lower(name).
              • If found: reuse existing artistProfile.id.
              • If not found: insert a new personal artist profile for this user.

      • Relational Credits in Database:
          • Set songs.artistId = primaryArtist.id.
          • Insert into songCredits:
              • Primary credit: { songId, artistId: primaryArtist.id, role: 'PRIMARY' }.
              • Featured credits: { songId, artistId: collaborator.id, role: 'FEATURED' } for each collaborator.

      • Displaying in API and UI:
          • In getUserLockerReleases, join songCredits to return credits: [{ id, stageName, role }].
          • Format track display as: Primary Artist (feat. Collab 1, Collab 2).


  ──────
  ### 5. Artists Page Filter (Global vs Personal Collection vs All)

  • Current state: /artists queries all artists without checking scope, lacks filtering by source, and leaks personal artists.
  • Solution:
      • Security & Scoping in Backend (GET /api/v1/artists):
          • Add query parameter scope: "GLOBAL" | "PERSONAL" | "ALL" (default: "GLOBAL").
          • If user is unauthenticated or scope === 'GLOBAL', only return scope = 'GLOBAL'.
          • If scope === 'PERSONAL' or 'ALL':
              • Check if user has lockerIncludeInSearch: true in user settings.
              • Only include personal artists where ownerUserId = request.user.id.
              • Zero Leakage: Never include another user's personal artists.

      • Sorting Filters:
          • Add sortBy: "listeners" (monthly listeners), "followers" (follower count), "name" (stage name A-Z), "recent" (newest).
      • Frontend UI in /artists:
          • Tab bar / Filter chips:
              • [Global Artists] (default)
              • [Personal Collection] (only visible when logged in and user has personal artists)
              • [All Artists]
          • Sort dropdown: Most Monthly Listeners, Most Followers, Alphabetical (A-Z), Recently Added.
          • Badge sandboxed artists with a discreet [Personal] tag.


  ──────
  ### 6. Artists Section Inside Personal Collection Page

  • Current state: /collection only has "Releases" (with embedded tracks) and "Upload". No way to view sandboxed artists directly.
  • Solution:
      • Backend Endpoint:
          • GET /api/v1/storage/personal-collection/artists:
              • Queries artistProfiles where ownerUserId = request.user.id AND scope = 'PERSONAL'.
              • Aggregates counts of active releases and songs attached to each personal artist.

      • Frontend UI:
          • Add an "Artists" tab in the /collection navigation bar (Releases | Artists | Trash | Import).
          • Displays a roster grid of the user's personal artists:
              • Artist stage name, avatar/monogram, total tracks count, and total releases count.
              • Clicking an artist filters the releases/songs by that artist.



  ──────
  ### 7. Trash / Recycle Bin (Restore & Permanent Delete)

  • Current state: Deleting a song or release sets deletedAt = NOW(), but there is no UI or endpoint to view, restore, or permanently
  purge them. Soft-deleted songs still lingered in listening history.
  • Solution:
      • Backend Endpoints:
          1. GET /api/v1/storage/personal-collection/trash:
              • Lists all soft-deleted personal songs and releases (deletedAt IS NOT NULL) for this user.
          2. POST /api/v1/storage/personal-collection/songs/:id/restore:
              • Validates quota: if usedSongs + 1 > maxSongs, rejects with 403 ("Quota limit reached. Cannot restore song.").
              • Clears deletedAt = null, updates parent album duration/track count, and evicts cache.
          3. POST /api/v1/storage/personal-collection/releases/:id/restore:
              • Validates quota for all tracks in the release.
              • Restores the album and all its tracks (deletedAt = null), evicts cache.
          4. DELETE /api/v1/storage/personal-collection/songs/:id/permanent:
              • Hard deletes the song row from songs (and deletes audio files in R2/S3).
          5. DELETE /api/v1/storage/personal-collection/releases/:id/permanent:
              • Hard deletes album and its tracks from database.
          6. DELETE /api/v1/storage/personal-collection/trash:
              • "Empty Trash" — hard purges all soft-deleted songs and albums for this user.

      • Ghost Item Cleanups:
          • Fix player.service.ts:250 to add isNull(songs.deletedAt).
          • Fix artists.service.ts:138 to block non-owners from personal artist profiles.
          • Evict Redis song/album cache keys upon deletion and restoration.
      • Frontend UI in /collection:
          • Add a "Trash" tab with a badge showing the count of trashed items.
          • Table/list of trashed items showing Title, Artist, Deleted Date, and actions:
              • [Restore] (with quota check)
              • [Delete Permanently]
          • An [Empty Trash] button at the top to clean up all deleted items in one click.