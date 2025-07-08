import mongoose, { Schema } from 'mongoose'

interface ILibrary extends Document {
  _id: mongoose.Types.ObjectId
  likedPlaylists: string[]
  likedAlbums: string[]
  likedSongs: string[]
  recentlyPlayed: string[]
  listenLater: string[]
  userId: string
}

const LibrarySchema = new Schema<ILibrary>({
  likedPlaylists: { type: [String], default: [] },
  likedAlbums: { type: [String], default: [] },
  likedSongs: { type: [String], default: [] },
  recentlyPlayed: { type: [String], default: [] },
  listenLater: { type: [String], default: [] },
  userId: { type: String, required: true },
})

LibrarySchema.index({ userId: 1 }, { unique: true })
LibrarySchema.index({ likedPlaylists: 1 })
LibrarySchema.index({ likedAlbums: 1 })
LibrarySchema.index({ likedSongs: 1 })
LibrarySchema.index({ recentlyPlayed: 1 })
LibrarySchema.index({ listenLater: 1 })

export const Library = mongoose.model<ILibrary>('Library', LibrarySchema)
export default Library
