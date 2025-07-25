import { Schema, model, Document, Types } from 'mongoose'

// Interface for the Jam Session document
export interface IJamSession extends Document {
  _id: Types.ObjectId
  creator: string
  participants: string[]
  queue: string[]
  currentSong: {
    songId: string | null
    startedAt: Date
    playbackPosition: number // in seconds
  }
  playbackState: 'playing' | 'paused'
  shuffle: boolean
  repeat: 'off' | 'one' | 'all'
  hasControlPermissions: string[]
  joinCode: string
  createdAt: Date
}

const JamSessionSchema = new Schema<IJamSession>({
  creator: { type: String, ref: 'User', required: true },
  participants: [{ type: String, ref: 'User' }],
  queue: [{ type: String, ref: 'Song' }],
  currentSong: {
    songId: { type: String, ref: 'Song', default: null },
    startedAt: { type: Date, default: Date.now },
    playbackPosition: { type: Number, default: 0 },
  },
  playbackState: {
    type: String,
    enum: ['playing', 'paused'],
    default: 'playing',
  },
  shuffle: { type: Boolean, default: false },
  hasControlPermissions: [{ type: String, ref: 'User', default: [] }],
  repeat: { type: String, enum: ['off', 'one', 'all'], default: 'off' },
  joinCode: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now, expires: '12h' }, // Automatically clean up sessions after 12 hours
})

// Add creator to participants list automatically
JamSessionSchema.pre('save', function (next) {
  if (this.isNew) {
    this.participants.push(this.creator)
    this.participants = [...new Set(this.participants)] // Deduplicate
  }
  next()
})

export const JamSession = model<IJamSession>('JamSession', JamSessionSchema)
