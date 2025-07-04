import { Router, Request, Response, NextFunction } from 'express'
import { requireSyncAuth } from '@groovy-streaming/common'
import User from '../models/User.model'

const router = Router()

// Get all users with optional timestamp filtering
router.get(
  '/users',
  requireSyncAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 100
      const since = req.query.since ? new Date(req.query.since as string) : null
      const getAllIds = req.query.getAllIds === 'true' // New parameter for getting all user IDs

      if (getAllIds) {
        // Return all user IDs for deletion comparison
        const allUserIds = await User.find({}).select('_id')
        res.status(200).json({
          message: 'All user IDs retrieved',
          data: {
            userIds: allUserIds.map((u) => u._id),
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

      const [users, totalActiveUsers] = await Promise.all([
        User.find(userQuery)
          .select('_id displayName email googleId createdAt updatedAt')
          .sort({ updatedAt: 1 })
          .skip(skip)
          .limit(limit),

        User.countDocuments(userQuery),
      ])

      const totalPages = Math.ceil(totalActiveUsers / limit)

      res.status(200).json({
        message: 'Users retrieved successfully',
        data: {
          users,
          pagination: {
            currentPage: page,
            totalPages,
            totalUsers: totalActiveUsers,
            limit,
            hasNextPage: page < totalPages,
          },
          syncInfo: {
            since: since?.toISOString() || null,
            timestamp: new Date().toISOString(),
            activeUsersCount: users.length,
          },
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

export { router as syncRouter }
