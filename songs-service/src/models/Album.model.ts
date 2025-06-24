import mongoose, { Document, Schema } from 'mongoose'

export interface IAlbum extends Document {
  _id: string
  title: string
  artist: string
  coverUrl?: string
  genre?: string
  tags?: string[]
  colloborators?: string[]
  songs: string[] // array of Song._id values
  createdAt: Date
  updatedAt: Date
}

const AlbumSchema: Schema = new Schema(
  {
    _id: {
      type: String,
      required: true,
    },
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
  },
  {
    timestamps: true,
    _id: false,
  }
)

// Index for efficient querying by artist and release date
AlbumSchema.index({ artist: 1, releaseDate: -1 })

export const Album = mongoose.model<IAlbum>('Album', AlbumSchema)
