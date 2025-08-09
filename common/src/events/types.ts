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
  SONG_STREAMED: 'song-streamed',
  ALBUM_CREATED: 'album-created',
  ALBUM_UPDATED: 'album-updated',
  ALBUM_DELETED: 'album-deleted',
  PLAYLIST_CREATED: 'playlist-created',
  PLAYLIST_UPDATED: 'playlist-updated',
  PLAYLIST_DELETED: 'playlist-deleted',
  LIBRARY_UPDATED: 'library-updated',
  LIBRARY_CREATED: 'library-created',

  //comments-service events
  COMMENT_CREATED: 'comment-created',
  COMMENT_UPDATED: 'comment-updated',
  COMMENT_DELETED: 'comment-deleted',

  // preferences-and-analytics-service events
} as const

export const TOPICS = {
  USER_EVENTS: 'user-events',
  SONG_EVENTS: 'song-events',
  PLAYLIST_EVENTS: 'playlist-events',
  COMMENT_EVENTS: 'comment-events',
} as const

export const SUBSCRIPTIONS = {
  AUTH_SERVICE_USER_EVENTS: 'auth-service-user-events',

  SONGS_SERVICE_USER_EVENTS: 'songs-service-user-events',
  SONGS_SERVICE_PREFERENCES_AND_ANALYTICS_EVENTS:
    'songs-service-preferences-and-analytics-events',

  COMMENTS_SERVICE_USER_EVENTS: 'comments-service-user-events',
  COMMENTS_SERVICE_SONG_EVENTS: 'comments-service-song-events',

  PREFERENCES_SERVICE_USER_EVENTS: 'preferences-service-user-events',
  PREFERENCES_SERVICE_SONG_EVENTS: 'preferences-service-song-events',

  QUERY_SERVICE_USER_EVENTS: 'query-service-user-events',
  QUERY_SERVICE_SONG_EVENTS: 'query-service-song-events',
  QUERY_SERVICE_PREFERENCES_AND_ANALYTICS_EVENTS:
    'query-service-preferences-and-analytics-events',
} as const
