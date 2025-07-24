import mongoose from 'mongoose'

export enum CommentEntityEnum {
  SONG = 'song',
  ALBUM = 'album',
  PLAYLIST = 'playlist',
}

interface CommentDoc extends mongoose.Document {
  content: string
  authorId: string
  entityType: CommentEntityEnum
  entityId: string
  parentId: string
  upvotes: string[]
  downvotes: string[]
  replyCount: number // Add this
  isDeleted: boolean // Add this for soft deletes
  createdAt: Date
  updatedAt: Date
}

const commentSchema = new mongoose.Schema(
  {
    content: { type: String, required: true },
    authorId: {
      type: String,
      ref: 'User',
      required: true,
    },
    entityType: {
      type: String,
      enum: ['song', 'album', 'playlist'],
      required: true,
    },
    entityId: { type: String, required: true },
    parentId: { type: String, ref: 'Comment', default: null },
    upvotes: [{ type: String, ref: 'User' }],
    downvotes: [{ type: String, ref: 'User' }],
    replyCount: { type: Number, default: 0 }, // Track reply count
    isDeleted: { type: Boolean, default: false }, // Soft delete
  },
  {
    timestamps: true,
  }
)

commentSchema.index({ entityType: 1, entityId: 1, parentId: 1 })
commentSchema.index({ parentId: 1 })
commentSchema.index({ authorId: 1 })

const Comment = mongoose.model<CommentDoc, mongoose.Model<CommentDoc>>(
  'Comment',
  commentSchema
)

export { Comment }
