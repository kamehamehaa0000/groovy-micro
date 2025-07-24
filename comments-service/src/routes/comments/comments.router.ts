import {
  AuthenticatedRequest,
  CustomError,
  requireAuth,
  validateRequest,
} from '@groovy-streaming/common'
import { NextFunction, Response, Router } from 'express'
import { body, param, query } from 'express-validator'
import { Comment, CommentEntityEnum } from '../../models/Comment.model'
import { Song } from '../../models/Song.model'
import { Album } from '../../models/Album.model'
import { Playlist } from '../../models/Playlist.model'
import { CommentsServiceEventPublisher } from '../../events/comments-event-publisher'
const router = Router()
const MAX_DEPTH = 10

//create a comment
router.post(
  '/create',
  requireAuth,
  [
    body('content')
      .isString()
      .isLength({ min: 1, max: 1000 })
      .withMessage('Content must be 1-1000 characters'),
    body('entityType')
      .isIn(['song', 'album', 'playlist'])
      .withMessage('Invalid entity type'),
    body('entityId').isUUID().withMessage('Invalid entity ID'),
    body('parentId').optional().isMongoId().withMessage('Invalid parent ID'),
    validateRequest,
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }

      const { content, entityType, entityId, parentId } = req.body

      // Validate entity exists
      const entityValidation = await validateEntity(entityType, entityId)
      if (!entityValidation.isValid) {
        throw new CustomError(entityValidation.message, 404)
      }

      let depth = 0
      let rootId = null

      let parentComment = null

      // if replying to a comment
      if (parentId) {
        parentComment = await Comment.findById(parentId)
        if (!parentComment) {
          throw new CustomError('Parent comment not found', 404)
        }

        // Check depth limit
        if (parentComment.depth >= MAX_DEPTH) {
          throw new CustomError('Maximum nesting depth reached', 400)
        }

        depth = parentComment.depth + 1
        rootId = parentComment.rootId || parentComment._id
      }

      const comment = await Comment.create({
        content,
        authorId: user.id,
        entityType,
        entityId,
        parentId: parentId || null,
        rootId,
        depth,
        // Path will be set in pre-save middleware
      })

      // Update path after creation
      if (parentId && parentComment) {
        comment.path = `${parentComment.path}.${comment._id}`
      } else {
        comment.path = comment._id.toString()
      }
      await comment.save()

      // Update parent reply counts
      if (parentId) {
        await Comment.findByIdAndUpdate(parentId, {
          $inc: { directReplyCount: 1 },
        })

        // Update all ancestors' reply counts
        await Comment.updateMany(
          { _id: { $in: comment.path.split('.').slice(0, -1) } },
          { $inc: { replyCount: 1 } }
        )
      }
      const populatedComment = await Comment.findById(comment._id).populate(
        'authorId',
        'displayName'
      )
      // await CommentsServiceEventPublisher.CommentCreatedEvent({
      //   commentId: comment.id,
      //   content: comment.content,
      //   authorId: comment.authorId,
      //   entityType: comment.entityType,
      //   entityId: comment.entityId,
      //   parentId: comment.parentId ?? '',
      //   rootId: comment.rootId ?? '',
      //   depth: comment.depth ?? 0,
      //   upvotes: comment.upvotes,
      //   downvotes: comment.downvotes,
      // })
      res.status(201).json(populatedComment)
    } catch (error) {
      next(error)
    }
  }
)

// Get comments with nested structure (Reddit-style)
router.get(
  '/get/:entityType/:entityId',
  requireAuth,
  [
    param('entityType').isIn(['song', 'album', 'playlist']),
    param('entityId').isUUID(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 50 }),
    query('sort')
      .optional()
      .isIn(['newest', 'oldest', 'best', 'controversial']),
    query('loadReplies').optional().isBoolean(),
    validateRequest,
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }

      const { entityType, entityId } = req.params
      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 20
      const sort = (req.query.sort as string) || 'best'
      const loadReplies = req.query.loadReplies === 'true'
      const skip = (page - 1) * limit

      // Get top-level comments
      const query = {
        entityType,
        entityId,
        parentId: null,
        isDeleted: false,
      }

      let sortQuery: any = { createdAt: -1 }
      switch (sort) {
        case 'newest':
          sortQuery = { createdAt: -1 }
          break
        case 'oldest':
          sortQuery = { createdAt: 1 }
          break
        case 'best':
          // Sort by score, then by date
          sortQuery = [
            {
              $addFields: {
                score: {
                  $subtract: [{ $size: '$upvotes' }, { $size: '$downvotes' }],
                },
              },
            },
            { $sort: { score: -1, createdAt: -1 } },
          ]
          break
        case 'controversial':
          // Sort by total votes (engagement), then by date
          sortQuery = [
            {
              $addFields: {
                totalVotes: {
                  $add: [{ $size: '$upvotes' }, { $size: '$downvotes' }],
                },
              },
            },
            { $sort: { totalVotes: -1, createdAt: -1 } },
          ]
          break
      }

      let comments
      if (Array.isArray(sortQuery)) {
        // Use aggregation for complex sorting
        comments = await Comment.aggregate([
          { $match: query },
          ...sortQuery,
          { $skip: skip },
          { $limit: limit },
          {
            $lookup: {
              from: 'users',
              localField: 'authorId',
              foreignField: '_id',
              as: 'authorId',
              pipeline: [{ $project: { displayName: 1 } }],
            },
          },
          { $unwind: '$authorId' },
        ])
      } else {
        comments = await Comment.find(query)
          .populate('authorId', 'displayName')
          .sort(sortQuery)
          .skip(skip)
          .limit(limit)
          .lean()
      }

      // Load immediate replies if requested
      if (loadReplies && comments.length > 0) {
        const commentIds = comments.map((c) => c._id)
        const replies = await Comment.find({
          parentId: { $in: commentIds },
          isDeleted: false,
        })
          .populate('authorId', 'displayName')
          .sort({ createdAt: 1 })
          .limit(100) // Limit immediate replies
          .lean()

        // Group replies by parent
        const repliesMap = replies.reduce(
          (acc: { [key: string]: any[] }, reply) => {
            if (reply.parentId) {
              const parentIdStr = reply.parentId.toString()
              if (!acc[parentIdStr]) {
                acc[parentIdStr] = []
              }
              acc[parentIdStr].push(reply)
            }
            return acc
          },
          {}
        )

        // Attach replies to comments
        comments.forEach((comment) => {
          comment.replies = repliesMap[comment._id.toString()] || []
        })
      }

      const totalComments = await Comment.countDocuments(query)

      res.status(200).json({
        comments,
        currentPage: page,
        totalPages: Math.ceil(totalComments / limit),
        totalComments,
        hasMore: page < Math.ceil(totalComments / limit),
      })
    } catch (error) {
      next(error)
    }
  }
)

// Enhanced delete with proper cleanup
router.delete(
  '/delete/:commentId',
  requireAuth,
  [param('commentId').isMongoId(), validateRequest],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }

      const { commentId } = req.params
      const comment = await Comment.findOne({
        _id: commentId,
        authorId: user.id,
        isDeleted: false,
      })

      if (!comment) {
        throw new CustomError('Comment not found or unauthorized', 404)
      }

      // Soft delete
      comment.isDeleted = true
      comment.content = '[deleted]'
      await comment.save()

      // Update parent reply counts
      if (comment.parentId) {
        await Comment.findByIdAndUpdate(comment.parentId, {
          $inc: { directReplyCount: -1 },
        })

        // Update all ancestors
        const ancestorIds = comment.path.split('.').slice(0, -1)
        await Comment.updateMany(
          { _id: { $in: ancestorIds } },
          { $inc: { replyCount: -1 } }
        )
      }

      await CommentsServiceEventPublisher.CommentDeletedEvent({
        commentId: comment.id,
      })

      res.status(200).json({ message: 'Comment deleted successfully' })
    } catch (error) {
      next(error)
    }
  }
)

// upvote a comment
router.post(
  '/upvote/comment/:commentId',
  requireAuth,
  [param('commentId').isMongoId(), validateRequest],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }
      const { commentId } = req.params
      const comment = await Comment.findById(commentId)
      if (!comment) {
        throw new CustomError('Comment not found', 404)
      }

      const userId = user.id.toString() // Ensuring userId is a string (not necessary since user.id is already a string)

      // Remove downvote if it exists
      const downvoteIndex = comment.downvotes.findIndex(
        (id) => id.toString() === userId
      )
      if (downvoteIndex > -1) {
        comment.downvotes.splice(downvoteIndex, 1)
      }

      // Toggle upvote
      const upvoteIndex = comment.upvotes.findIndex(
        (id) => id.toString() === userId
      )
      if (upvoteIndex > -1) {
        comment.upvotes.splice(upvoteIndex, 1) // Remove upvote
      } else {
        comment.upvotes.push(user.id) // Add upvote
      }

      await comment.save()
      // await CommentsServiceEventPublisher.CommentUpdatedEvent({
      //   commentId: comment.id,
      //   content: comment.content,
      //   authorId: comment.authorId,
      //   entityType: comment.entityType,
      //   entityId: comment.entityId,
      //   parentId: comment.parentId,
      //   upvotes: comment.upvotes,
      //   downvotes: comment.downvotes,
      // })
      const populatedComment = await Comment.findById(comment._id).populate(
        'authorId',
        'displayName'
      )
      res.status(200).json(populatedComment)
    } catch (error) {
      next(error)
    }
  }
)

// downvote a comment
router.post(
  '/downvote/comment/:commentId',
  requireAuth,
  [param('commentId').isMongoId(), validateRequest],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }
      const { commentId } = req.params
      const comment = await Comment.findById(commentId)
      if (!comment) {
        throw new CustomError('Comment not found', 404)
      }
      const userId = user.id.toString()

      // Remove upvote if it exists
      const upvoteIndex = comment.upvotes.findIndex(
        (id) => id.toString() === userId
      )
      if (upvoteIndex > -1) {
        comment.upvotes.splice(upvoteIndex, 1)
      }
      // Toggle downvote
      const downvoteIndex = comment.downvotes.findIndex(
        (id) => id.toString() === userId
      )
      if (downvoteIndex > -1) {
        comment.downvotes.splice(downvoteIndex, 1) // Remove downvote
      } else {
        comment.downvotes.push(user.id) // Add downvote
      }
      await comment.save()
      // await CommentsServiceEventPublisher.CommentUpdatedEvent({
      //   commentId: comment.id,
      //   content: comment.content,
      //   authorId: comment.authorId,
      //   entityType: comment.entityType,
      //   entityId: comment.entityId,
      //   parentId: comment.parentId,
      //   upvotes: comment.upvotes,
      //   downvotes: comment.downvotes,
      // })
      const populatedComment = await Comment.findById(comment._id).populate(
        'authorId',
        'displayName'
      )

      res.status(200).json(populatedComment)
    } catch (error) {
      next(error)
    }
  }
)

// update a comment (only content)
router.put(
  '/update/:commentId',
  requireAuth,
  [
    param('commentId').isMongoId().withMessage('Invalid comment ID'),
    body('content')
      .isString()
      .isLength({ min: 1, max: 1000 })
      .withMessage('Content must be 1-1000 characters'),
    validateRequest,
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }
      const { commentId } = req.params
      const { content } = req.body

      const comment = await Comment.findByIdAndUpdate(
        {
          _id: commentId,
          authorId: user.id,
          isDeleted: false,
        },
        {
          content,
        },
        {
          new: true,
          runValidators: true,
        }
      ).populate('authorId', 'displayName')

      if (!comment) {
        throw new CustomError('Comment not found or unauthorized', 404)
      }

      // await CommentsServiceEventPublisher.CommentUpdatedEvent({
      //   commentId: comment.id,
      //   content: comment.content,
      //   authorId: comment.authorId,
      //   entityType: comment.entityType,
      //   entityId: comment.entityId,
      //   parentId: comment.parentId,
      //   upvotes: comment.upvotes,
      //   downvotes: comment.downvotes,
      // })
      res.status(200).json(comment)
    } catch (error) {
      next(error)
    }
  }
)

router.get(
  '/get/replies/comment/:commentId',
  requireAuth,
  [
    param('commentId').isMongoId().withMessage('Invalid comment ID'),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 50 }),
    validateRequest,
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }
      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 20
      const skip = (page - 1) * limit

      const { commentId } = req.params

      // Verify parent comment exists
      const parentComment = await Comment.findById(commentId)
      if (!parentComment) {
        throw new CustomError('Parent comment not found', 404)
      }

      const query = {
        parentId: commentId,
        isDeleted: false,
      }

      const replies = await Comment.find(query)
        .populate('authorId', 'displayName')
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limit)

      const totalReplies = await Comment.countDocuments(query)

      res.status(200).json({
        replies,
        currentPage: page,
        totalPages: Math.ceil(totalReplies / limit),
        totalReplies,
        hasMore: page < Math.ceil(totalReplies / limit),
      })
    } catch (error) {
      next(error)
    }
  }
)

function buildCommentTree(comments: any[]): any[] {
  const commentMap = new Map<string, any>()
  const rootComments: any[] = []

  // Create map of all comments
  comments.forEach((comment) => {
    comment.replies = []
    commentMap.set(comment._id.toString(), comment)
  })

  // Build tree structure
  comments.forEach((comment) => {
    if (comment.parentId) {
      const parent = commentMap.get(comment.parentId.toString())
      if (parent) {
        parent.replies.push(comment)
      }
    } else {
      rootComments.push(comment)
    }
  })

  return rootComments
}

async function validateEntity(entityType: string, entityId: string) {
  try {
    let entity
    switch (entityType) {
      case CommentEntityEnum.SONG:
        entity = await Song.findById(entityId)
        break
      case CommentEntityEnum.ALBUM:
        entity = await Album.findById(entityId)
        break
      case CommentEntityEnum.PLAYLIST:
        entity = await Playlist.findById(entityId)
        break
      default:
        return { isValid: false, message: 'Invalid entity type' }
    }

    return {
      isValid: !!entity,
      message: entity ? 'Valid' : `${entityType} not found`,
    }
  } catch (error) {
    return { isValid: false, message: 'Entity validation failed' }
  }
}

export { router as commentsRouter }
