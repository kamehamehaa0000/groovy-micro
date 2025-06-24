import mongoose, { Document, Schema } from 'mongoose'
import { ISong } from './Song' // adjust import path if necessary

export interface IAlbum extends Document {
  _id: string
  title: string
  artist?: string
  coverUrl?: string
  releaseDate?: Date
  genre?: string
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
    },
    coverUrl: {
      type: String,
    },
    releaseDate: {
      type: Date,
    },
    genre: {
      type: String,
    },
    songs: [
      {
        type: String, // Referencing Song._id
        ref: 'Song',
      },
    ],
  },
  {
    timestamps: true,
    _id: true,
  }
)

// Index for efficient querying by artist and release date
AlbumSchema.index({ artist: 1, releaseDate: -1 })

export const Album = mongoose.model<IAlbum>('Album', AlbumSchema)
