/**
 * Centralized, Type-Safe Redis Key Registry for Groovy Streaming.
 * Conforms to docs/CACHING_AND_INVALIDATION_STRATEGY.md
 */
export const cacheKeys = {
  auth: {
    tokenVersion: (userId: string) => `groovy:auth:token_version:${userId}`,
    session: (familyId: string, jti: string) => `groovy:auth:session:${familyId}:${jti}`,
    emailVerify: (tokenHash: string) => `groovy:auth:email_verify:${tokenHash}`,
    emailVerifyCooldown: (userId: string) => `groovy:auth:email_verify_cooldown:${userId}`,
  },
  subscriptions: {
    plansAll: () => `groovy:sub:plans:all`,
    plan: (planId: string) => `groovy:sub:plan:${planId}`,
    featuresAll: () => `groovy:sub:features:all`,
    feature: (key: string) => `groovy:sub:feature:${key}`,
    userMeta: (userId: string) => `groovy:sub:user:${userId}:meta`,
    userEntitlements: (userId: string) => `groovy:sub:user:${userId}:entitlements`,
    userEntitlementsSet: (userId: string) => `groovy:sub:user:${userId}:entitlements:set`,
  },
  catalog: {
    album: (id: string) => `groovy:catalog:album:${id}`,
    albumSlug: (slug: string) => `groovy:catalog:album:slug:${slug}`,
    song: (songId: string) => `groovy:catalog:song:${songId}`,
    artist: (id: string) => `groovy:catalog:artist:${id}`,
    artistSlug: (slug: string) => `groovy:catalog:artist:slug:${slug}`,
    artistAlbumsTag: (artistId: string) => `groovy:catalog:tag:artist:${artistId}:albums`,
  },
  social: {
    userLikedSongs: (userId: string) => `groovy:social:user:${userId}:liked_songs`,
    userLikedAlbums: (userId: string) => `groovy:social:user:${userId}:liked_albums`,
    userFollowingArtists: (userId: string) => `groovy:social:user:${userId}:following_artists`,
    userPreSavedAlbums: (userId: string) => `groovy:social:user:${userId}:presaved_albums`,
    userSavedPlaylists: (userId: string) => `groovy:social:user:${userId}:saved_playlists`,
    userCommentVotes: (userId: string) => `groovy:social:user:${userId}:comment_votes`,
    playlist: (id: string) => `groovy:social:playlist:${id}`,
    playlistSavesCount: (playlistId: string) => `groovy:social:playlist:${playlistId}:saves_count`,
    songLikesCount: (songId: string) => `groovy:social:song:${songId}:likes_count`,
    albumLikesCount: (albumId: string) => `groovy:social:album:${albumId}:likes_count`,
    likesBuffer: () => `groovy:social:buffer:likes`,
  },
  player: {
    state: (userId: string) => `groovy:player:state:${userId}`,
  },
  jam: {
    playback: (roomId: string) => `groovy:jam:room:${roomId}:playback`,
    members: (roomId: string) => `groovy:jam:room:${roomId}:members`,
    queue: (roomId: string) => `groovy:jam:room:${roomId}:queue`,
  },
} as const;
