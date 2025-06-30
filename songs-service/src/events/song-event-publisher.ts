import { StatusEnum } from '../models/Song.model'
import { EventTypes, TOPICS } from './events'
import { BaseEvent, pubSubManager } from './pub-sub-manager'

export class SongEventPublisher {
  static async SongCreatedEvent(
    songId: string,
    originalUrl: string,
    coverArtUrl: string,
    status: StatusEnum,
    metadata: {
      title: string
      artist: string
      collaborators: string[]
      album: string
      genre: string
      tags: string[]
    },
    visibility: 'public' | 'private'
  ): Promise<void> {
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
      await pubSubManager.publishEvent(TOPICS.SONG_EVENTS, event)
    } catch (error) {
      console.error('Error publishing song created event:', error)
    }
  }

  static async SongUpdatedEvent(
    userId: string,
    displayName?: string,
    updatedFields: string[] = []
  ): Promise<void> {
    const event: BaseEvent = {
      eventType: EventTypes.USER_UPDATED,
      eventId: `${EventTypes.USER_UPDATED}-${userId}-${Date.now()}`,
      data: {
        userId,
        displayName,
        updatedFields,
      },
      metadata: {
        correlationId: `${userId}-${Date.now()}`,
        source: 'auth-service',
      },
    }
    try {
      await pubSubManager.publishEvent(TOPICS.USER_EVENTS, event)
    } catch (error) {
      console.error('Error publishing user updated event:', error)
    }
  }
}

