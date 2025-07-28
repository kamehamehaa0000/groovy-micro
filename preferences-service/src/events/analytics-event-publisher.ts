import { PubSubManager } from '../config/PubSub'
import {
  BaseEvent,
  EventTypes,
  TOPICS,
  SongStreamedEventData,
} from '@groovy-streaming/common'

export class AnalyticsEventPublisher {
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
      await PubSubManager.publishEvent(
        TOPICS.PREFERENCES_AND_ANALYTICS_EVENTS,
        event
      )
    } catch (error) {
      console.error('Error publishing song streamed event:', error)
    }
  }
}
