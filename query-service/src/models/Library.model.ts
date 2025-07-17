import mongoose, { Schema } from 'mongoose'

interface ILibrary extends Document {
  _id: string
  recentlyPlayed: string[]
  listenLater: string[]
  userId: string
}

const LibrarySchema = new Schema<ILibrary>({
  _id: {
    type: String,
    required: true,
  },
  recentlyPlayed: {
    type: [{ type: String, ref: 'Song' }],
    default: [],
  },
  listenLater: { type: [{ type: String, ref: 'Song' }], default: [] },
  userId: { type: String, required: true },
})

// Ensure that the recentlyPlayed array does not exceed 12 items, pops the oldest added song if it does
LibrarySchema.pre('save', function (next) {
  if (this.recentlyPlayed.length > 12) {
    this.recentlyPlayed = this.recentlyPlayed.slice(-12)
  }
  next()
})

LibrarySchema.index({ userId: 1 }, { unique: true })
LibrarySchema.index({ recentlyPlayed: 1 })
LibrarySchema.index({ listenLater: 1 })

export const Library = mongoose.model<ILibrary>('Library', LibrarySchema)
export default Library
