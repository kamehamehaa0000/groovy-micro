import mongoose, { Document, Schema } from 'mongoose'
export enum StatusEnum {
  UPLOADING = 'uploading',
  UPLOADED = 'uploaded',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}
export interface ISong extends Document {
  _id: string
  coverArtUrl: string
  originalUrl: string
  hlsUrl?: string
  status: StatusEnum
  // duration?: number
  visibility: 'public' | 'private'
  metadata: {
    title: string
    artist: string
    collaborators: string[]
    album: string
    genre: string
    tags: string[]
    trackNumber?: number
  }
  createdAt: Date
  updatedAt: Date
}

const SongSchema: Schema = new Schema(
  {
    _id: {
      type: String,
      required: true,
    },
    originalUrl: {
      type: String,
    },
    hlsUrl: {
      type: String,
    },
    coverArtUrl: {
      type: String,
    },
    status: {
      type: String,
      enum: ['uploading', 'uploaded', 'processing', 'completed', 'failed'],
      default: 'uploading',
    },
    visibility: {
      type: String,
      enum: ['public', 'private'],
      default: 'public',
    },
    metadata: {
      title: String,
      artist: { type: String, ref: 'User' },
      album: { type: String, ref: 'Album' },
      genre: String,
      collaborators: [{ type: String, ref: 'User' }],
      tags: [String],
      trackNumber: {
        type: Number,
        default: 1,
      },
    },
  },
  {
    timestamps: true,
    _id: false,
  }
)

// Index for efficient queries
SongSchema.index({ status: 1, createdAt: -1 })
SongSchema.index({ createdAt: -1 })
SongSchema.index({ 'metadata.artist': 1 })
SongSchema.index({ 'metadata.genre': 1 })
SongSchema.index({ 'metadata.tags': 1 })
SongSchema.index({ 'metadata.collaborators': 1 })
SongSchema.index(
  { 'metadata.title': 'text', 'metadata.genre': 'text' },
  { name: 'SongTextIndex' }
)

export const Song = mongoose.model<ISong>('Song', SongSchema)
