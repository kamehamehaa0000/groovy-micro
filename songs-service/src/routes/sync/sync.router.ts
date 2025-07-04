import { requireSyncAuth } from '@groovy-streaming/common'
import { Request, Router, Response, NextFunction } from 'express'
import { Song } from '../../models/Song.model'
import { Album } from '../../models/Album.model'

const router = Router()

router.get(
  '/songs',
  requireSyncAuth, // Middleware to ensure the request is authenticated with the sync API key
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) ?? 1
      const limit = parseInt(req.query.limit as string) ?? 100
      const skip = (page - 1) * limit

      const songs = await Song.find().skip(skip).limit(limit).lean()
      const totalSongs = await Song.countDocuments()

      res.json({
        songs,
        totalPages: Math.ceil(totalSongs / limit),
        currentPage: page,
      })
    } catch (error) {
      next(error)
    }
  }
)

router.get(
  '/albums',
  requireSyncAuth, // Middleware to ensure the request is authenticated with the sync API key
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) ?? 1
      const limit = parseInt(req.query.limit as string) ?? 100
      const skip = (page - 1) * limit

      const albums = await Album.find().skip(skip).limit(limit).lean()
      const totalAlbums = await Album.countDocuments()

      res.json({
        albums,
        totalPages: Math.ceil(totalAlbums / limit),
        currentPage: page,
      })
    } catch (error) {
      next(error)
    }
  }
)

export { router as syncRouter }
