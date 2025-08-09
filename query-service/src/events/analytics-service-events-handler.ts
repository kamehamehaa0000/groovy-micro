import {
  BaseEvent,
  EventTypes,
  SongStreamedEventData,
} from '@groovy-streaming/common'
import { Song } from '../models/Song.model'

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
      const song = await Song.findOneAndUpdate(
        { _id: eventData.songId },
        { $inc: { 'metadata.streamCount': 1 } },
        { new: true }
      )
      if (!song) {
        console.error(
          `Failed to update analytics for songId: ${eventData.songId}`
        )
        return
      }
      console.log(
        `Updated stream count for songId: ${eventData.songId}, new count: ${song.metadata.streamCount}`
      )
    } catch (error: any) {
      console.error('SONG STREAMED EVENT HANDLER ERROR - ' + error.message)
    }
  }
}
