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
  filename: string
  coverArtUrl?: string
  originalUrl?: string
  hlsUrl?: string
  status: StatusEnum
  errorMessage?: string
  duration?: number
  fileSize?: number
  metadata?: {
    title: string
    artist: string
    collaborators: string[]
    album: string
    genre: string
    tags: string[]
    description: string
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
    filename: {
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
    errorMessage: {
      type: String,
    },
    duration: {
      type: Number,
    },
    fileSize: {
      type: Number,
    },
    metadata: {
      title: String,
      artist: String,
      album: { type: String, ref: 'Album' },
      genre: String,
      description: String,
      collaborators: [String],
      tags: [String],
      trackNumber: {
        type: Number,
        default: 1,
      },
    },
    visibility: {
      type: String,
      enum: ['public', 'private'],
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

export const Song = mongoose.model<ISong>('Song', SongSchema)
