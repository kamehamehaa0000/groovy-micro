import { PubSubManager } from '../config/PubSub'
import { StatusEnum } from '../models/Song.model'
import { BaseEvent, EventTypes, TOPICS } from '@groovy-streaming/common'

export class SongEventPublisher {
  static async SongCreatedEvent({
    songId,
    originalUrl,
    coverArtUrl,
    status,
    metadata,
    visibility,
  }: {
    songId: string
    originalUrl: string
    coverArtUrl: string
    status: StatusEnum
    metadata: {
      title: string
      artist: string
      collaborators: string[]
      album: string
      genre: string
      tags: string[]
    }
    visibility: 'public' | 'private'
  }): Promise<void> {
    const event: BaseEvent = {
      eventType: EventTypes.SONG_CREATED,
      eventId: `${EventTypes.SONG_CREATED}-${songId}-${Date.now()}`,
      data: {
        songId,
        originalUrl,
        coverArtUrl,
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
    newOriginalUrl,
    newCoverUrl,
    newHlsUrl,
    newStatus,
    metadata,
    newVisibility,
    updatedFields,
  }: {
    songId: string
    newOriginalUrl?: string
    newCoverUrl?: string
    newStatus?: StatusEnum
    newHlsUrl?: string
    newVisibility?: 'public' | 'private'
    metadata?: {
      title?: string
      artist?: string
      collaborators?: string[]
      album?: string
      genre?: string
      tags?: string[]
    }
    updatedFields?: string[]
  }): Promise<void> {
    const event: BaseEvent = {
      eventType: EventTypes.SONG_UPDATED,
      eventId: `${EventTypes.SONG_UPDATED}-${songId}-${Date.now()}`,
      data: {
        songId,
        newOriginalUrl,
        newCoverUrl,
        newHlsUrl,
        newStatus,
        metadata,
        updatedFields,
        newVisibility,
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

  static async SongDeletedEvent(songId: string): Promise<void> {
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
  }: {
    albumId: string
    title: string
    artist: string
    coverUrl: string
    genre: string
    tags: string[]
    collaborators: string[]
    songs: string[]
    visibility?: 'public' | 'private'
  }) {
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
        songs,
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
    updatedFields,
    visibility,
  }: {
    albumId: string
    title?: string
    artist?: string
    coverUrl?: string
    genre?: string
    tags?: string[]
    collaborators?: string[]
    songs?: string[]
    visibility?: 'public' | 'private'
    updatedFields?: string[]
  }): Promise<void> {
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
        collaborators,
        songs,
        updatedFields,
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

  static async AlbumDeletedEvent(albumId: string): Promise<void> {
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
    coverUrl,
  }: {
    playlistId: string
    title: string
    description: string
    creator: string // User._id
    collaborators?: string[] // User._id[]
    visibility: 'public' | 'private'
    songs: {
      songId: string // Song._id
      addedBy: string // User._id
      order: number
    }[]
    coverUrl: string
  }) {
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
  }: {
    playlistId: string
    title?: string
    description?: string
    creator?: string // User._id
    collaborators?: string[] // User._id[]
    visibility?: 'public' | 'private'
    songs?: {
      songId: string // Song._id
      addedBy: string // User._id
      order: number
    }[]
    coverUrl?: string
  }) {
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

  static async PlaylistDeletedEvent({ playlistId }: { playlistId: string }) {
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
