import mongoose from 'mongoose'

export enum CommentEntityEnum {
  SONG = 'song',
  ALBUM = 'album',
  PLAYLIST = 'playlist',
}

interface CommentDoc extends mongoose.Document {
  _id: string
  content: string
  authorId: string
  entityType: CommentEntityEnum
  entityId: string
  parentId: string | null
  rootId: string | null // Points to the top-level comment
  depth: number // How deep the nesting is (0 = top-level)
  path: string // Materialized path for efficient querying
  upvotes: string[]
  downvotes: string[]
  replyCount: number
  directReplyCount: number // Direct children only
  isDeleted: boolean
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
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Comment',
      default: null,
    },
    rootId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Comment',
      default: null,
    },
    depth: { type: Number, default: 0, max: 10 }, // Limit depth
    path: { type: String, default: '' }, // e.g., "rootId.parentId.commentId"
    upvotes: [{ type: String, ref: 'User' }],
    downvotes: [{ type: String, ref: 'User' }],
    replyCount: { type: Number, default: 0 }, // Total descendants
    directReplyCount: { type: Number, default: 0 }, // Direct children only
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
)

// Pre-save middleware to handle path generation
commentSchema.pre('save', async function(next) {
  if (this.isNew && !this.path) {
    if (this.parentId) {
      // This is a reply, we'll update the path after the parent is found
      const parent = await Comment.findById(this.parentId)
      if (parent) {
        this.path = `${parent.path}.${this._id}`
      } else {
        this.path = this._id.toString()
      }
    } else {
      // This is a top-level comment
      this.path = this._id.toString()
    }
  }
  next()
})

// Optimized indexes for performance
commentSchema.index({ entityType: 1, entityId: 1, parentId: 1 })
commentSchema.index({ path: 1 }) // For nested queries
commentSchema.index({ rootId: 1, depth: 1 }) // For threading
commentSchema.index({ parentId: 1, createdAt: -1 }) // For replies
commentSchema.index({ authorId: 1 })
commentSchema.index({ isDeleted: 1, createdAt: -1 })

// Virtual for vote score
commentSchema.virtual('score').get(function () {
  return this.upvotes.length - this.downvotes.length
})

const Comment = mongoose.model<CommentDoc, mongoose.Model<CommentDoc>>(
  'Comment',
  commentSchema
)

export { Comment }
