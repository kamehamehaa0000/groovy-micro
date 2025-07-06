import {
  AuthenticatedRequest,
  CustomError,
  requireAuth,
  validateRequest,
} from '@groovy-streaming/common'
import { NextFunction, Response, Router } from 'express'
import { body } from 'express-validator'
import { Comment, CommentEntityEnum } from '../../models/Comment.model'
import { Song } from '../../models/Song.model'
import { Album } from '../../models/Album.model'
import { Playlist } from '../../models/Playlist.model'

import mongoose from 'mongoose'
const router = Router()

//create a comment
router.post(
  '/create',
  requireAuth,
  [
    body('content').isString().withMessage('Content must be a string'),
    body('authorId').isString().withMessage('Author ID must be a string'),
    body('entityType').isString().withMessage('Entity type must be a string'),
    body('entityId').isString().withMessage('Entity ID must be a string'),
    body('parentId')
      .isString()
      .withMessage('Parent ID must be a string')
      .optional(),
    validateRequest,
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }
      const { content, authorId, entityType, entityId, parentId } = req.body
      if (entityType == CommentEntityEnum.SONG) {
        const song = await Song.findById(entityId)
        if (!song) {
          throw new CustomError('Song not found', 404)
        }
      } else if (entityType == CommentEntityEnum.ALBUM) {
        const album = await Album.findById(entityId)
        if (!album) {
          throw new CustomError('Album not found', 404)
        }
      } else if (entityType == CommentEntityEnum.PLAYLIST) {
        const playlist = await Playlist.findById(entityId)
        if (!playlist) {
          throw new CustomError('Playlist not found', 404)
        }
      }

      const comment = await Comment.create({
        content,
        authorId,
        entityType,
        entityId,
        parentId,
      })
      if (!comment) {
        throw new CustomError('Comment creation failed', 400)
      }
      res.status(201).json(comment)
    } catch (error) {
      next(error)
    }
  }
)
// downvote a comment
router.post(
  '/downvote/comment/:commentId',
  requireAuth,
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
      // Remove upvote if it exists
      const upvoteIndex = comment.upvotes.indexOf(user.id)
      if (upvoteIndex > -1) {
        comment.upvotes.splice(upvoteIndex, 1) // User has upvoted, remove the upvote
      }
      // Toggle downvote
      const downvoteIndex = comment.downvotes.indexOf(user.id)
      if (downvoteIndex > -1) {
        comment.downvotes.splice(downvoteIndex, 1) // User has downvoted, remove the downvote
      } else {
        comment.downvotes.push(user.id) // User has not downvoted, add the downvote
      }
      await comment.save()
      res.status(200).json(comment)
    } catch (error) {
      next(error)
    }
  }
)
// upvote a comment
router.post(
  '/upvote/comment/:commentId',
  requireAuth,
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
      // Remove downvote if it exists
      const downvoteIndex = comment.downvotes.indexOf(user.id)
      if (downvoteIndex > -1) {
        comment.downvotes.splice(downvoteIndex, 1) // User has downvoted, remove the downvote
      }
      // Toggle upvote
      const upvoteIndex = comment.upvotes.indexOf(user.id)
      if (upvoteIndex > -1) {
        comment.upvotes.splice(upvoteIndex, 1) // User has upvoted, remove the upvote
      } else {
        comment.upvotes.push(user.id) // User has not upvoted, add the upvote
      }
      await comment.save()
      res.status(200).json(comment)
    } catch (error) {
      next(error)
    }
  }
)
// update a comment (only content)
router.put(
  '/update/:commentId',
  [
    body('content')
      .isString()
      .withMessage('Content must be a string')
      .optional(),
    validateRequest,
  ],
  requireAuth,
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
        },
        {
          content,
        },
        {
          new: true, // return the updated document
          runValidators: true, // run validation on the update
        }
      )
      if (!comment) {
        throw new CustomError('Comment not found', 404)
      }

      res.status(200).json(comment)
    } catch (error) {
      next(error)
    }
  }
)
// delete a comment
router.delete(
  '/delete/:commentId',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }
      const { commentId } = req.params
      const deletedComment = await Comment.findOneAndDelete({
        _id: commentId,
        authorId: user.id,
      })

      if (!deletedComment) {
        throw new CustomError('Comment not found or unauthorized', 404)
      }
      res.status(200).json({ message: 'Comment deleted successfully' })
    } catch (error) {
      next(error)
    }
  }
)

// get comments by entity type and ID
router.get(
  '/get/comments/:entityType/:entityId',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }
      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 20
      const skip = (page - 1) * limit

      const { entityType, entityId } = req.params
      if (!entityType || !entityId) {
        throw new CustomError('Entity type and ID are required', 400)
      }
      // Validate entityType and entityId
      if (!CommentEntityEnum[entityType as keyof typeof CommentEntityEnum]) {
        throw new CustomError('Invalid entity type', 400)
      }
      if (!mongoose.Types.ObjectId.isValid(entityId)) {
        throw new CustomError('Invalid entity ID format', 400)
      }
      const query = {
        entityType,
        entityId,
        parentId: null,
      }
      const comments = await Comment.find(query)
        .populate('authorId', 'displayName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
      const totalComments = await Comment.countDocuments(query)

      res.status(200).json({
        comments,
        currentPage: page,
        totalPages: Math.ceil(totalComments / limit),
        totalComments,
      })
    } catch (error) {
      next(error)
    }
  }
)

router.get(
  '/get/replies/comment/:commentId',
  requireAuth,
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
      if (!commentId) {
        throw new CustomError('Invalid comment ID ', 400)
      }
      const query = {
        parentId: commentId,
      }
      const replies = await Comment.find(query)
        .populate('authorId', 'displayName')
        .skip(skip)
        .limit(limit)
      const totalReplies = await Comment.countDocuments(query)
      res.status(200).json({
        replies,
        currentPage: page,
        totalPages: Math.ceil(totalReplies / limit),
        totalReplies,
      })
    } catch (error) {
      next(error)
    }
  }
)

export { router as commentsRouter }
