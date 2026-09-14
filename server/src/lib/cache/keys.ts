/**
 * Centralized, Type-Safe Redis Key Registry for Groovy Streaming.
 * Conforms to docs/CACHING_AND_INVALIDATION_STRATEGY.md
 */
export const cacheKeys = {
  auth: {
    tokenVersion: (userId: string) => `groovy:auth:token_version:${userId}`,
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
  jam: {
    playback: (roomId: string) => `groovy:jam:room:${roomId}:playback`,
    members: (roomId: string) => `groovy:jam:room:${roomId}:members`,
    queue: (roomId: string) => `groovy:jam:room:${roomId}:queue`,
  },
} as const
