import { requireSyncAuth } from '@groovy-streaming/common'
import { Request, Router, Response, NextFunction } from 'express'
import { Song } from '../../models/Song.model'
import { Comment } from '../../models/Comment.model'

const router = Router()

router.get(
  '/songs',
  requireSyncAuth, // Middleware to ensure the request is authenticated with the sync API key
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 100
      const since = req.query.since ? new Date(req.query.since as string) : null
      const getAllIds = req.query.getAllIds === 'true'

      if (getAllIds) {
        const allCommentsIds = await Comment.find({}).select('_id')
        res.status(200).json({
          message: 'All song IDs retrieved',
          data: {
            songIds: allCommentsIds.map((s) => s._id),
            timestamp: new Date().toISOString(),
          },
        })
        return
      }

      const skip = (page - 1) * limit
      let userQuery = {}

      if (since) {
        userQuery = { updatedAt: { $gte: since } }
      }

      const [comments, totalComments] = await Promise.all([
        Comment.find(userQuery).sort({ updatedAt: 1 }).skip(skip).limit(limit),
        Comment.countDocuments(userQuery),
      ])

      const totalPages = Math.ceil(totalComments / limit)

      res.status(200).json({
        message: 'Comments retrieved successfully',
        data: {
          comments,
          pagination: {
            currentPage: page,
            totalPages,
            totalComments,
            limit,
            hasNextPage: page < totalPages,
          },
          syncInfo: {
            since: since?.toISOString() ?? null,
            timestamp: new Date().toISOString(),
            activeCommentsCount: comments.length,
          },
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

export { router as syncRouter }
