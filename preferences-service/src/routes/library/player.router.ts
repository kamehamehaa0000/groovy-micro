import { Router, Response, NextFunction } from 'express'
import {
  AuthenticatedRequest,
  CustomError,
  requireAuth,
  validateRequest,
} from '@groovy-streaming/common'
import Player from '../../models/Player.model'
import { body } from 'express-validator'

const router = Router()

router.get(
  '/',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }
      const playerState = await Player.findOne({ userId: user._id })
      if (!playerState) {
        throw new CustomError('Player state not found', 404)
      }

      res.status(200).json({
        playerState,
      })
    } catch (error) {
      next(error)
    }
  }
)

router.post(
  '/',
  requireAuth,
  [
    body('currentSong')
      .isObject()
      .withMessage('Current song must be an object'),
    body('currentSong.songId')
      .isString()
      .withMessage('Song ID must be a string')
      .notEmpty(),
    body('currentSong.playbackPosition')
      .isNumeric()
      .withMessage('Playback position must be a number'),
    body('queue').isArray().withMessage('Queue must be an array'),
    body('shuffle').isBoolean().withMessage('Shuffle must be a boolean'),
    body('repeat')
      .isIn(['none', 'one', 'all'])
      .withMessage('Repeat must be one of: none, one, all'),
    validateRequest,
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }

      const { currentSong, queue, shuffle, repeat } = req.body

      const playerState = await Player.findOneAndUpdate(
        { userId: user._id },
        {
          $set: {
            currentSong,
            queue,
            shuffle,
            repeat,
          },
        },
        { new: true }
      )
      if (!playerState) {
        throw new CustomError('Player state not found', 404)
      }

      res.status(200).json({
        playerState,
      })
    } catch (error) {
      next(error)
    }
  }
)

export { router as playerRouter }
