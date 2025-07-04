import { Router, Response, NextFunction } from 'express'
import { Album } from '../../models/Album.model'
import {
  AuthenticatedRequest,
  CustomError,
  requireAuth,
} from '@groovy-streaming/common'
import { User } from '../../models/User.model'

const router = Router()

// fetch album by genre, tags, or collaborators
router.get(
  '/filter',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { genre, tags, collaborators } = req.query
      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 20
      const skip = (page - 1) * limit

      const filter: any = { visibility: 'public' }

      if (genre) {
        filter.genre = genre as string
      }
      if (tags) {
        filter.tags = { $in: (tags as string).split(',') }
      }
      if (collaborators) {
        filter.collaborators = {
          $in: (collaborators as string).split(','),
        }
      }

      const albums = await Album.find(filter)
        .populate('artist', 'displayName')
        .populate('collaborators', 'displayName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)

      const total = await Album.countDocuments(filter)

      res.json({
        albums,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalAlbums: total,
      })
    } catch (error) {
      next(error)
    }
  }
)

// search albums by title, artist, or collaborators
router.get(
  '/search',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }
      const { q } = req.query
      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 20
      const skip = (page - 1) * limit

      if (!q || typeof q !== 'string') {
        throw new CustomError('Search query "q" is required', 400)
      }

      // 1. Search for artists/collaborators by name
      const users = await User.find(
        { displayName: { $regex: q, $options: 'i' } },
        '_id'
      )
      const userIds = users.map((user) => user._id)

      // 2. Build the main query
      const query = {
        $and: [
          {
            $or: [
              { title: { $regex: q, $options: 'i' } },
              { artist: { $in: userIds } },
              { collaborators: { $in: userIds } },
            ],
          },
          {
            $or: [
              { visibility: 'public' },
              { visibility: 'private', artist: user.id },
            ],
          },
        ],
      }

      const albums = await Album.find(query)
        .populate('artist', 'displayName')
        .populate('collaborators', 'displayName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)

      const total = await Album.countDocuments(query)

      res.json({
        albums,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalAlbums: total,
      })
    } catch (error) {
      next(error)
    }
  }
)

// get all public albums
router.get(
  '/all/public',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 20
      const skip = (page - 1) * limit
      console.log(await Album.find())
      const albums = await Album.find({ visibility: 'public' })
        .populate('artist', 'displayName')
        .populate('collaborators', 'displayName')
        .populate('songs')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)

      const total = await Album.countDocuments({ visibility: 'public' })

      res.json({
        albums,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalAlbums: total,
      })
    } catch (error) {
      next(error)
    }
  }
)
// get all private albums for the logged-in user
router.get(
  '/all/private',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }
      const { id: userId } = user

      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 20
      const skip = (page - 1) * limit

      const filter = {
        artist: userId,
        visibility: 'private',
      }

      const albums = await Album.find(filter)
        .populate('artist', 'displayName')
        .populate('collaborators', 'displayName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)

      const total = await Album.countDocuments(filter)

      res.json({
        albums,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalAlbums: total,
      })
    } catch (error) {
      next(error)
    }
  }
)

// get album by artist id
router.get(
  '/artist/:artistId',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }
      const { artistId } = req.params
      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 20
      const skip = (page - 1) * limit

      const filter: any = { artist: artistId }

      if (user.id.toString() !== artistId) {
        filter.visibility = 'public'
      }

      const albums = await Album.find(filter)
        .populate('artist', 'displayName')
        .populate('collaborators', 'displayName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)

      const total = await Album.countDocuments(filter)

      res.json({
        albums,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalAlbums: total,
      })
    } catch (error) {
      next(error)
    }
  }
)
// get album by current user id
router.get(
  '/me',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }
      const { id: userId } = user
      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 20
      const skip = (page - 1) * limit

      const albums = await Album.find({ artist: userId })
        .populate('artist', 'displayName')
        .populate('collaborators', 'displayName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)

      const total = await Album.countDocuments({ artist: userId })

      res.json({
        albums,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalAlbums: total,
      })
    } catch (error) {
      next(error)
    }
  }
)
// get album by id
router.get(
  '/:albumId',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }
      const { albumId } = req.params

      const album = await Album.findById(albumId)
        .populate('artist', 'displayName')
        .populate('collaborators', 'displayName')
        .populate({
          path: 'songs',
          populate: {
            path: 'metadata.artist',
            select: 'displayName',
          },
        })

      if (!album) {
        throw new CustomError('Album not found', 404)
      }

      if (
        album.visibility === 'private' &&
        album.artist.toString() !== user.id
      ) {
        throw new CustomError(
          'You do not have permission to view this album',
          403
        )
      }

      res.json(album)
    } catch (error) {
      next(error)
    }
  }
)

export { router as queryAlbumRouter }
