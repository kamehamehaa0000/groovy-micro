import {
  BaseEvent,
  EventTypes,
  SongStreamedEventData,
} from '@groovy-streaming/common'
import { SongAnalytics } from '../models/SongAnalytics.model'

export class AnalyticsEventHandlers {
  // Handle any user event
  static async handleAnalyticsEvents(event: BaseEvent): Promise<void> {
    if (event.eventType) {
      if (event.eventType === EventTypes.SONG_STREAMED) {
        await AnalyticsEventHandlers.handleSongStreamed(
          event.data as SongStreamedEventData
        )
      } else {
        console.error(`Received an unsupported event type: ${event.eventType}`)
      }
    } else {
      console.error(
        `Received an event with no eventType: ${JSON.stringify(event)}`
      )
    }
  }

  static readonly handleSongStreamed = async (
    eventData: SongStreamedEventData
  ): Promise<void> => {
    try {
      const analytics = await SongAnalytics.findOneAndUpdate(
        { songId: eventData.songId },
        { $inc: { streamCount: 1 } },
        { new: true, upsert: true }
      )
      if (!analytics) {
        console.error(
          `Failed to update analytics for songId: ${eventData.songId}`
        )
        return
      }
      console.log(
        `Updated stream count for songId: ${eventData.songId}, new count: ${analytics.streamCount}`
      )
    } catch (error: any) {
      console.error('SONG STREAMED EVENT HANDLER ERROR - ' + error.message)
    }
  }
}
