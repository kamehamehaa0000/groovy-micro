import { SongStreamedEventData } from '@groovy-streaming/common/dist/events/song-service-events'
import { PubSubManager } from '../config/PubSub'
import { BaseEvent, EventTypes, TOPICS } from '@groovy-streaming/common'

export class SongEventPublisher {
  static async SongStreamedEvent({
    songId,
  }: SongStreamedEventData): Promise<void> {
    const event: BaseEvent = {
      eventType: EventTypes.SONG_STREAMED,
      eventId: `${EventTypes.SONG_STREAMED}-${songId}-${Date.now()}`,
      data: {
        songId,
      },
      metadata: {
        correlationId: `${songId}-${Date.now()}`,
        source: 'preferences-and-analytics-service',
      },
    }
    try {
      await PubSubManager.publishEvent(TOPICS.SONG_EVENTS, event)
    } catch (error) {
      console.error('Error publishing song streamed event:', error)
    }
  }
}
