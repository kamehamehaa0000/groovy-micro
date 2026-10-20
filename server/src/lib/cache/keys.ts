/**
 * Centralized, Type-Safe Redis Key Registry for Groovy Streaming.
 * Conforms to docs/CACHING_AND_INVALIDATION_STRATEGY.md
 */
export const cacheKeys = {
  auth: {
    tokenVersion: (userId: string) => `user:${userId}:token_version`,
    session: (familyId: string, jti: string) =>
      `groovy:auth:session:${familyId}:${jti}`,
    emailVerify: (tokenHash: string) => `groovy:auth:email_verify:${tokenHash}`,
    emailVerifyCooldown: (userId: string) =>
      `groovy:auth:email_verify_cooldown:${userId}`,
  },
  profile: {
    /**
     * GET /auth/me - the authenticated user's own composite view (identity,
     * privacy/locker preferences, subscription and artist pointer).
     */
    self: (userId: string) => `groovy:profile:${userId}`,
    /**
     * GET /artists/me - the owner's own artist row plus followersCount. Kept
     * separate from the public `catalog:artist:*` keys: this one is only ever
     * read by the profile owner.
     */
    selfArtist: (userId: string) => `groovy:profile:${userId}:artist`,
  },
  subscriptions: {
    plansAll: () => `groovy:sub:plans:all`,
    plan: (planId: string) => `groovy:sub:plan:${planId}`,
    featuresAll: () => `groovy:sub:features:all`,
    feature: (key: string) => `groovy:sub:feature:${key}`,
    userMeta: (userId: string) => `groovy:sub:user:${userId}:meta`,
    userEntitlements: (userId: string) =>
      `groovy:sub:user:${userId}:entitlements`,
    userEntitlementsSet: (userId: string) =>
      `groovy:sub:user:${userId}:entitlements:set`,
  },
  catalog: {
    album: (id: string) => `groovy:catalog:album:${id}`,
    albumSlug: (slug: string) => `groovy:catalog:album:slug:${slug}`,
    song: (songId: string) => `groovy:catalog:song:${songId}`,
    artist: (id: string) => `groovy:catalog:artist:${id}`,
    artistSlug: (slug: string) => `groovy:catalog:artist:slug:${slug}`,
    artistOverview: (id: string) => `groovy:catalog:artist:overview:${id}`,
    artistOverviewSlug: (slug: string) => `groovy:catalog:artist:overview:slug:${slug}`,
    artistAlbumsTag: (artistId: string) =>
      `groovy:catalog:tag:artist:${artistId}:albums`,
  },
  social: {
    userLikedSongs: (userId: string) =>
      `groovy:social:user:${userId}:liked_songs`,
    userLikedAlbums: (userId: string) =>
      `groovy:social:user:${userId}:liked_albums`,
    userFollowingArtists: (userId: string) =>
      `groovy:social:user:${userId}:following_artists`,
    userPreSavedAlbums: (userId: string) =>
      `groovy:social:user:${userId}:presaved_albums`,
    userSavedPlaylists: (userId: string) =>
      `groovy:social:user:${userId}:saved_playlists`,
    userCommentVotes: (userId: string) =>
      `groovy:social:user:${userId}:comment_votes`,
    playlist: (id: string) => `groovy:social:playlist:${id}`,
    userFollowers: (userId: string) => `groovy:social:user:${userId}:followers`,
    userFollowing: (userId: string) => `groovy:social:user:${userId}:following`,
    incomingRequests: (userId: string) =>
      `groovy:social:user:${userId}:requests:incoming`,
    feed: (userId: string, tag: string) =>
      `groovy:social:feed:${userId}:${tag}`,
    /**
     * Bumped whenever the accounts a user follows change, so cached feed
     * pages become unreachable immediately instead of waiting out their TTL.
     */
    feedVersion: (userId: string) => `groovy:social:feed:version:${userId}`,
  },
  player: {
    /**
     * LEGACY cross-device snapshot. Still written by clients that predate the
     * session split and read as a hydration fallback. See
     * docs/CROSS_DEVICE_PLAYBACK_DESIGN.md §8.
     */
    state: (userId: string) => `groovy:player:state:${userId}`,
    /** LEGACY pre-Groovy-Connect active device lease. */
    activeDevice: (userId: string) => `groovy:player:active_device:${userId}`,
    /**
     * Groovy Connect: the account's single Listen Session — who is the Speaker
     * and where the needle is. Deliberately excludes the queue (see `queue`) so
     * the 10s position tick stays a tiny write.
     */
    session: (userId: string) => `groovy:player:session:${userId}`,
    /** Groovy Connect: the heavy, slow-changing queue/context payload. */
    queue: (userId: string) => `groovy:player:queue:${userId}`,
    /**
     * Groovy Connect: private device liveness (sorted set of
     * "deviceId|instanceId" -> lastSeenAtMs). Distinct from `presence`, which
     * is the privacy-gated friends-activity key that dies on pause.
     */
    online: (userId: string) => `groovy:player:online:${userId}`,
    /** Groovy Connect: durable device registry (hash deviceId -> metadata). */
    devices: (userId: string) => `groovy:player:devices:${userId}`,
    /** Groovy Connect: the in-flight transfer ticket (short TTL). */
    transfer: (userId: string) => `groovy:player:transfer:${userId}`,
    /**
     * Groovy Connect: which tabs have already started audio at least once
     * (hash "deviceId|instanceId" -> "1"). Gates push transfers, because
     * browsers block autoplay without a user gesture.
     */
    unlocked: (userId: string) => `groovy:player:unlocked:${userId}`,
    /** Groovy Connect: Redis Pub/Sub fan-out channel for the SSE stream. */
    events: (userId: string) => `groovy:player:events:${userId}`,
    /**
     * Groovy Connect: idempotency key for a Remote command. A retried command
     * (or a double tap) applies once and is then a no-op (rule A8 / B4).
     */
    command: (userId: string, commandId: string) =>
      `groovy:player:command:${userId}:${commandId}`,
    presence: (userId: string) => `groovy:presence:user:${userId}`,
  },
  telemetry: {
    songPlaysBuffer: () => `groovy:telemetry:song_plays`,
  },
  recommendations: {
    tasteProfile: (userId: string) => `groovy:rec:taste:${userId}`,
    heavyRotation: (userId: string, mode = "global") => `groovy:rec:heavy_rot:${userId}:${mode}`,
    forYou: (userId: string, mode = "global") => `groovy:rec:for_you:${userId}:${mode}`,
    radar: (userId: string, mode = "global") => `groovy:rec:radar:${userId}:${mode}`,
    radio: (songId: string, userId?: string | null, mode = "global") =>
      userId ? `groovy:rec:radio:${songId}:${userId}:${mode}` : `groovy:rec:visitor:radio:${songId}`,
    playlistAssisted: (userId: string) => `groovy:rec:pl_assist:${userId}`,
    playlistEnhance: (playlistId: string) => `groovy:rec:pl_enhance:${playlistId}`,
    homeFeed: (userId?: string | null, mode = "global") =>
      userId ? `groovy:rec:home:${userId}:${mode}` : `groovy:rec:visitor:home`,
    newReleases: (userId?: string | null, mode = "global") =>
      userId ? `groovy:rec:new_rel:${userId}:${mode}` : `groovy:rec:visitor:new_rel`,
    globalHits: (userId?: string | null, mode = "global") =>
      userId ? `groovy:rec:hits:${userId}:${mode}` : `groovy:rec:visitor:hits`,
    similarArtists: (userId?: string | null, mode = "global") =>
      userId ? `groovy:rec:sim_art:${userId}:${mode}` : `groovy:rec:visitor:sim_art`,
    moreLikeArtist: (userId?: string | null, mode = "global") =>
      userId ? `groovy:rec:more_art:${userId}:${mode}` : `groovy:rec:visitor:more_art`,
    moreLikeSong: (userId?: string | null, mode = "global") =>
      userId ? `groovy:rec:more_song:${userId}:${mode}` : `groovy:rec:visitor:more_song`,
    radioMixes: (userId?: string | null, mode = "global") =>
      userId ? `groovy:rec:mixes:${userId}:${mode}` : `groovy:rec:visitor:mixes`,
    userPlaylists: (userId: string) => `groovy:rec:playlists:${userId}`,
    artistSimilar: (artistId: string) => `groovy:rec:art_sim:${artistId}`,
  },
  users: {
    lockerSearchPref: (userId: string) =>
      `groovy:user:${userId}:locker_search_pref`,
  },
} as const;

