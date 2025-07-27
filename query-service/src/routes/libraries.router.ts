import { AuthenticatedRequest, optionalAuth } from '@groovy-streaming/common'
import { NextFunction, Router, Response, Request } from 'express'
import Library from '../models/Library.model'

const router = Router()

router.get(
  '/recently-played',
  optionalAuth,
  async (
    req: AuthenticatedRequest | Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const user = (req as AuthenticatedRequest).user
      if (!user) {
        res.status(200).json({
          message:
            'No recently played songs found, Log in to see your history.',
          songs: [],
        })
      } else {
        const userLibrary = await Library.findOne({
          userId: user.id,
        }).populate({
          path: 'recentlyPlayed',
          populate: [
            {
              path: 'metadata.artist',
              select: 'displayName',
            },
          ],
        })

        if (!userLibrary) {
          res.status(200).json({
            message: 'No recently played songs found.',
            songs: [],
          })
        } else {
          const songs = userLibrary.recentlyPlayed.map((song: any) => {
            const songObject = song.toObject()
            const isLiked = song.metadata.likedBy.some(
              (liker: any) => liker === user.id
            )
            return {
              ...songObject,
              isLikedByCurrentUser: isLiked,
            }
          })
          res.status(200).json({
            message: 'Recently played songs retrieved successfully.',
            songs,
          })
        }
      }
    } catch (error) {
      next(error)
    }
  }
)

export { router as libraryRouter }
