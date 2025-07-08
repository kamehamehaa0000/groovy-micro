import mongoose, { Schema } from 'mongoose'

interface IPlayer extends Document {
  userId: string
  currentSong: {
    songId: string
    playbackPosition: number
  }
  queue: string[]
  shuffle: boolean
  repeat: 'none' | 'one' | 'all'
}

const PlayerSchema = new Schema<IPlayer>({
  userId: { type: String, ref: 'User', required: true },
  currentSong: {
    songId: { type: String, ref: 'Song', default: null },
    playbackPosition: { type: Number, default: 0 },
  },
  queue: { type: [String], default: [] },
})

export const Player = mongoose.model<IPlayer>('Player', PlayerSchema)
export default Player
