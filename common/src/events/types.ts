export const EventTypes = {
  // auth-service events
  USER_CREATED: 'user-created',
  USER_UPDATED: 'user-updated',
  USER_DELETED: 'user-deleted',
  USER_BLOCKED: 'user-blocked',
  // song-service events
  SONG_CREATED: 'song-created',
  SONG_UPDATED: 'song-updated',
  SONG_DELETED: 'song-deleted',
  ALBUM_CREATED: 'album-created',
  ALBUM_UPDATED: 'album-updated',
  ALBUM_DELETED: 'album-deleted',
  PLAYLIST_CREATED: 'playlist-created',
  PLAYLIST_UPDATED: 'playlist-updated',
  PLAYLIST_DELETED: 'playlist-deleted',

  //comments-service events
  COMMENT_CREATED: 'comment-created',
  COMMENT_UPDATED: 'comment-updated',
  COMMENT_DELETED: 'comment-deleted',
} as const

export const TOPICS = {
  USER_EVENTS: 'user-events',
  SONG_EVENTS: 'song-events',
  PLAYLIST_EVENTS: 'playlist-events',
  COMMENT_EVENTS: 'comment-events',
  STATS_EVENTS: 'stats-events',
} as const

export const SUBSCRIPTIONS = {
  AUTH_SERVICE_USER_EVENTS: 'auth-service-user-events',
  SONGS_SERVICE_USER_EVENTS: 'songs-service-user-events',
  STATS_SERVICE_USER_EVENTS: 'stats-service-user-events',
  PLAYLISTS_SERVICE_USER_EVENTS: 'playlists-service-user-events',
  COMMENTS_SERVICE_USER_EVENTS: 'comments-service-user-events',
  AUTH_SERVICE_SONG_EVENTS: 'auth-service-song-events',
  SONGS_SERVICE_SONG_EVENTS: 'songs-service-song-events',
  STATS_SERVICE_SONG_EVENTS: 'stats-service-song-events',
  PLAYLISTS_SERVICE_SONG_EVENTS: 'playlists-service-song-events',
  COMMENTS_SERVICE_SONG_EVENTS: 'comments-service-song-events',
} as const
