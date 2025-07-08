import mongoose, { Document, Schema } from 'mongoose'

export interface IPlaylist extends Document {
  _id: string
  title: string
  description: string
  creator: string // User._id
  collaborators?: string[]
  visibility: 'public' | 'private'
  songs: {
    songId: string // Song._id
    addedBy: string // User._id
    order: number
  }[]
  coverUrl: string
  createdAt: Date
  updatedAt: Date
}

const PlaylistSchema: Schema<IPlaylist> = new Schema(
  {
    _id: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      trim: true,
      required: true,
    },
    description: {
      type: String,
      trim: true,
      required: true,
      default: '',
    },
    creator: {
      type: String,
      required: true,
      ref: 'User',
    },
    collaborators: {
      type: [
        {
          type: String,
          ref: 'User',
        },
      ],
      default: [],
    },
    visibility: {
      type: String,
      enum: ['public', 'private'],
      default: 'public',
    },
    songs: {
      type: [
        {
          songId: {
            type: String,
            required: true,
            ref: 'Song',
          },
          addedBy: {
            type: String,
            ref: 'User',
            required: true,
          },
          order: {
            type: Number,
            required: true,
          },
        },
      ],
      default: [],
    },
    coverUrl: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
  }
)
// Indexes for efficient querying
PlaylistSchema.index({ creator: 1, createdAt: -1 })
PlaylistSchema.index({ visibility: 1, createdAt: -1 })
PlaylistSchema.index({ collaborators: 1 })
PlaylistSchema.index({ title: 'text', description: 'text', tags: 'text' })
PlaylistSchema.index({ collaborators: 1, visibility: 1 })
// Compound index for visibility and creator
PlaylistSchema.index({ creator: 1, visibility: 1 })
export const Playlist = mongoose.model<IPlaylist>('Playlist', PlaylistSchema)
