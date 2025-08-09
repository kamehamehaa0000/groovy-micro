import mongoose, { Schema, Document } from 'mongoose'

interface ISyncMetadata extends Document {
  type: string
  lastSyncAt: Date
  createdAt: Date
  updatedAt: Date
}

const SyncMetadataSchema = new Schema<ISyncMetadata>(
  {
    type: {
      type: String,
      required: true,
      unique: true,
    },
    lastSyncAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
)

export const SyncMetadata =
  mongoose.models.SyncMetadata ||
  mongoose.model<ISyncMetadata>('SyncMetadata', SyncMetadataSchema)
