import mongoose, { Document, Schema } from 'mongoose'

export interface ISongAnalytics extends Document {
  songId: string
  streamCount: number
}

const SongAnalyticsSchema: Schema = new Schema(
  {
    songId: {
      type: String,
      required: true,
      unique: true,
      ref: 'Song', 
    },
    streamCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
)

export const SongAnalytics = mongoose.model<ISongAnalytics>(
  'SongAnalytics',
  SongAnalyticsSchema
)
