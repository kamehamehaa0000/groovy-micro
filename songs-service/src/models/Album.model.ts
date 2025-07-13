import mongoose, { Document, Schema } from 'mongoose'

export interface IAlbum extends Document {
  _id: string
  title: string
  artist: string
  coverUrl: string
  genre?: string
  tags?: string[]
  collaborators?: string[]
  likedBy: string[]
  songs: string[] // array of Song._id values
  visibility?: 'public' | 'private'
  createdAt: Date
  updatedAt: Date
}

const AlbumSchema: Schema = new Schema(
  {
    _id: {
      type: String,
      required: true,
    },
    likedBy: { type: [{ type: String, ref: 'User' }], default: [] },
    title: {
      type: String,
      required: true,
    },
    artist: {
      type: String,
      ref: 'User',
    },
    coverUrl: {
      type: String,
    },
    genre: {
      type: String,
    },
    collaborators: [
      {
        type: String,
        ref: 'User',
        required: true,
      },
    ],
    tags: [
      {
        type: String,
      },
    ],
    songs: [
      {
        type: String, // Referencing Song._id
        ref: 'Song',
      },
    ],
    visibility: {
      type: String,
      enum: ['public', 'private'],
      default: 'public',
    },
  },
  {
    timestamps: true,
  }
)

// Index for efficient querying by artist and release date
AlbumSchema.index({ artist: 1, createdAt: -1 })
AlbumSchema.index({ title: 'text', genre: 'text' }, { name: 'AlbumTextIndex' })

export const Album =
  mongoose.models.Album || mongoose.model<IAlbum>('Album', AlbumSchema)
