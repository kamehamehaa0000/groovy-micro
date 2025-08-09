import { Server, Socket } from 'socket.io'
import { Song } from '../models/Song.model'
import { AnalyticsEventPublisher } from './analytics-event-publisher'

export const initializeStreamHandler = (io: Server) => {
  io.on('connection', (socket: Socket) => {
    socket.on('songStreamed', async (data: { songId: string }) => {
      try {
        const { songId } = data
        if (!songId) {
          return
        }
        await Song.findOneAndUpdate(
          { _id: songId },
          { $inc: { 'metadata.streamCount': 1 } },
          { new: true }
        )
        await AnalyticsEventPublisher.SongStreamedEvent({ songId })
      } catch (error) {
        console.error('Error handling songStreamed event:', error)
      }
    })
  })
}
