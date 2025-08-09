import { Server, Socket } from 'socket.io'
import { SongAnalytics } from '../models/SongAnalytics.model'
import { AnalyticsEventPublisher } from './analytics-event-publisher'

export const initializeStreamHandler = (io: Server) => {
  io.on('connection', (socket: Socket) => {
    socket.on('songStreamed', async (data: { songId: string }) => {
      try {
        const { songId } = data

        if (!songId) {
          console.error('songId is missing from songStreamed event')
          return
        }

        await SongAnalytics.findOneAndUpdate(
          { songId },
          { $inc: { streamCount: 1 } },
          { new: true, upsert: true, setDefaultsOnInsert: true }
        )
        await AnalyticsEventPublisher.SongStreamedEvent({ songId })
      } catch (error) {
        console.error('Error handling songStreamed event:', error)
      }
    })
  })
}
