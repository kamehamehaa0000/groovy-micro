import mongoose from 'mongoose'

export enum CommentEntityEnum {
  SONG = 'song',
  ALBUM = 'album',
  PLAYLIST = 'playlist',
}
interface CommentAttrs {
  content: string
  authorId: string
  entityType: CommentEntityEnum
  entityId: string
  parentId?: string
}

interface CommentDoc extends mongoose.Document {
  content: string
  authorId: string
  entityType: CommentEntityEnum
  entityId: string
  parentId?: string
  upvotes: string[]
  downvotes: string[]
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
    parentId: { type: String, ref: 'Comment' },
    upvotes: [{ type: String, ref: 'User' }],
    downvotes: [{ type: String, ref: 'User' }],
  },
  {
    timestamps: true,
  }
)

const Comment = mongoose.model<CommentDoc, mongoose.Model<CommentDoc>>(
  'Comment',
  commentSchema
)

export { Comment }
