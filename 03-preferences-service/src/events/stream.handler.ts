import { Server, Socket } from 'socket.io'
import { SongEventPublisher } from './song-event-publisher'

export const initializeStreamHandler = (io: Server) => {
  io.on('connection', (socket: Socket) => {
    socket.on('songStreamed', async (data: { songId: string }) => {
      try {
        const { songId } = data
        if (!songId) {
          return
        }
        await SongEventPublisher.SongStreamedEvent({ songId })
      } catch (error) {
        console.error('Error handling songStreamed event:', error)
      }
    })
  })
}
