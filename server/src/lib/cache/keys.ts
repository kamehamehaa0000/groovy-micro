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
  },
  player: {
    state: (userId: string) => `groovy:player:state:${userId}`,
    activeDevice: (userId: string) => `groovy:player:active_device:${userId}`,
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
} as const;

