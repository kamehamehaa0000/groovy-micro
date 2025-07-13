import { PubSubManager } from '../config/PubSub'
import {
  BaseEvent,
  EventTypes,
  TOPICS,
  SongCreatedEventData,
  SongUpdatedEventData,
  SongDeletedEventData,
  AlbumCreatedEventData,
  AlbumUpdatedEventData,
  AlbumDeletedEventData,
  PlaylistCreatedEventData,
  PlaylistUpdatedEventData,
  PlaylistDeletedEventData,
} from '@groovy-streaming/common'

export class SongServiceEventPublisher {
  static async SongCreatedEvent({
    songId,
    coverArtUrl,
    originalUrl,
    hlsUrl,
    status,
    metadata,
    visibility,
  }: SongCreatedEventData): Promise<void> {
    const event: BaseEvent = {
      eventType: EventTypes.SONG_CREATED,
      eventId: `${EventTypes.SONG_CREATED}-${songId}-${Date.now()}`,
      data: {
        songId,
        originalUrl,
        coverArtUrl,
        hlsUrl,
        status,
        metadata,
        visibility,
      },
      metadata: {
        correlationId: `${songId}-${Date.now()}`,
        source: 'songs-service',
      },
    }
    try {
      await PubSubManager.publishEvent(TOPICS.SONG_EVENTS, event)
    } catch (error) {
      console.error('Error publishing song created event:', error)
    }
  }

  static async SongUpdatedEvent({
    songId,
    coverArtUrl,
    originalUrl,
    hlsUrl,
    status,
    metadata,
    visibility,
  }: SongUpdatedEventData): Promise<void> {
    const event: BaseEvent = {
      eventType: EventTypes.SONG_UPDATED,
      eventId: `${EventTypes.SONG_UPDATED}-${songId}-${Date.now()}`,
      data: {
        songId,
        originalUrl,
        coverArtUrl,
        hlsUrl,
        status,
        metadata,
        visibility,
      },
      metadata: {
        correlationId: `${songId}-${Date.now()}`,
        source: 'song-service',
      },
    }
    try {
      await PubSubManager.publishEvent(TOPICS.SONG_EVENTS, event)
    } catch (error) {
      console.error('Error publishing song updated event:', error)
    }
  }

  static async SongDeletedEvent({
    songId,
  }: SongDeletedEventData): Promise<void> {
    const event: BaseEvent = {
      eventType: EventTypes.SONG_DELETED,
      eventId: `${EventTypes.SONG_DELETED}-${songId}-${Date.now()}`,
      data: { songId },
      metadata: {
        correlationId: `${songId}-${Date.now()}`,
        source: 'song-service',
      },
    }
    try {
      await PubSubManager.publishEvent(TOPICS.SONG_EVENTS, event)
    } catch (error) {
      console.error('Error publishing song deleted event:', error)
    }
  }

  static async AlbumCreatedEvent({
    albumId,
    title,
    artist,
    coverUrl,
    genre,
    tags,
    collaborators,
    songs,
    visibility,
    likedBy,
  }: AlbumCreatedEventData): Promise<void> {
    const event: BaseEvent = {
      eventType: EventTypes.ALBUM_CREATED,
      eventId: `${EventTypes.ALBUM_CREATED}-${albumId}-${Date.now()}`,
      data: {
        albumId,
        title,
        artist,
        coverUrl,
        genre,
        tags,
        collaborators,
        visibility,
        songs,
        likedBy,
      },
      metadata: {
        correlationId: `${albumId}-${Date.now()}`,
        source: 'songs-service',
      },
    }
    try {
      await PubSubManager.publishEvent(TOPICS.SONG_EVENTS, event)
    } catch (error) {
      console.error('Error publishing album created event:', error)
    }
  }

  static async AlbumUpdatedEvent({
    albumId,
    title,
    artist,
    coverUrl,
    genre,
    tags,
    collaborators,
    songs,
    likedBy,
    visibility,
  }: AlbumUpdatedEventData): Promise<void> {
    const event: BaseEvent = {
      eventType: EventTypes.ALBUM_UPDATED,
      eventId: `${EventTypes.ALBUM_UPDATED}-${albumId}-${Date.now()}`,
      data: {
        albumId,
        title,
        artist,
        coverUrl,
        genre,
        tags,
        likedBy,
        collaborators,
        songs,
        visibility,
      },
      metadata: {
        correlationId: `${albumId}-${Date.now()}`,
        source: 'songs-service',
      },
    }
    try {
      await PubSubManager.publishEvent(TOPICS.SONG_EVENTS, event)
    } catch (error) {
      console.error('Error publishing album updated event:', error)
    }
  }

  static async AlbumDeletedEvent({
    albumId,
  }: AlbumDeletedEventData): Promise<void> {
    const event: BaseEvent = {
      eventType: EventTypes.ALBUM_DELETED,
      eventId: `${EventTypes.ALBUM_DELETED}-${albumId}-${Date.now()}`,
      data: { albumId },
      metadata: {
        correlationId: `${albumId}-${Date.now()}`,
        source: 'songs-service',
      },
    }
    try {
      await PubSubManager.publishEvent(TOPICS.SONG_EVENTS, event)
    } catch (error) {
      console.error('Error publishing album deleted event:', error)
    }
  }

  static async PlaylistCreatedEvent({
    playlistId,
    title,
    description,
    creator,
    collaborators,
    visibility,
    songs,
    likedBy,
    coverUrl,
  }: PlaylistCreatedEventData): Promise<void> {
    const event: BaseEvent = {
      eventType: EventTypes.PLAYLIST_CREATED,
      eventId: `${EventTypes.PLAYLIST_CREATED}-${playlistId}-${Date.now()}`,
      data: {
        playlistId,
        title,
        description,
        creator,
        collaborators,
        visibility,
        songs,
        coverUrl,
        likedBy,
      },
      metadata: {
        correlationId: `${playlistId}-${Date.now()}`,
        source: 'songs-service',
      },
    }
    try {
      await PubSubManager.publishEvent(TOPICS.SONG_EVENTS, event)
    } catch (error) {
      console.error('Error publishing playlist created event:', error)
    }
  }

  static async PlaylistUpdatedEvent({
    playlistId,
    title,
    description,
    creator,
    collaborators,
    visibility,
    songs,
    coverUrl,
    likedBy,
  }: PlaylistUpdatedEventData) {
    const event: BaseEvent = {
      eventType: EventTypes.PLAYLIST_UPDATED,
      eventId: `${EventTypes.PLAYLIST_UPDATED}-${playlistId}-${Date.now()}`,
      data: {
        playlistId,
        title,
        description,
        creator,
        collaborators,
        visibility,
        songs,
        likedBy,
        coverUrl,
      },
      metadata: {
        correlationId: `${playlistId}-${Date.now()}`,
        source: 'songs-service',
      },
    }
    try {
      await PubSubManager.publishEvent(TOPICS.SONG_EVENTS, event)
    } catch (error) {
      console.error('Error publishing playlist updated event:', error)
    }
  }

  static async PlaylistDeletedEvent({
    playlistId,
  }: PlaylistDeletedEventData): Promise<void> {
    const event: BaseEvent = {
      eventType: EventTypes.PLAYLIST_DELETED,
      eventId: `${EventTypes.PLAYLIST_DELETED}-${playlistId}-${Date.now()}`,
      data: { playlistId },
      metadata: {
        correlationId: `${playlistId}-${Date.now()}`,
        source: 'songs-service',
      },
    }
    try {
      await PubSubManager.publishEvent(TOPICS.SONG_EVENTS, event)
    } catch (error) {
      console.error('Error publishing playlist deleted event:', error)
    }
  }
}
