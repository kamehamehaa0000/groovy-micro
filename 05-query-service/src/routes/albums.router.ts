import { Router, Response, NextFunction } from 'express'
import { Album } from '../models/Album.model'
import {
  AuthenticatedRequest,
  CustomError,
  optionalAuth,
  requireAuth,
} from '@groovy-streaming/common'
import User from '../models/User.model'
import { SongAnalytics } from '../models/SongAnalytics.model'

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

// get all public albums
router.get(
  '/all/public',
  optionalAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 20
      const skip = (page - 1) * limit
      const sort = (req.query.sort as string) ?? 'Ascending'
      const albums = await Album.find({ visibility: 'public' })
        .populate('artist', 'displayName')
        .populate('collaborators', 'displayName')
        .populate({
          path: 'songs',
          populate: [
            {
              path: 'metadata.artist',
              select: 'displayName',
            },
            {
              path: 'metadata.album',
              select: 'title',
            },
          ],
        })
        .sort({ createdAt: sort === 'Ascending' ? 1 : -1 })
        .skip(skip)
        .limit(limit)

      const total = await Album.countDocuments({ visibility: 'public' })

      const albumsData = albums.map((album) => {
        return {
          likedBy: album.likedBy.length,
          isLikedByCurrentUser: req.user?.id
            ? album.likedBy.includes(req.user.id)
            : false,
          ...album.toObject(),
        }
      })

      res.json({
        albums: albumsData,
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
      const sort = (req.query.sort as string) ?? 'Ascending'
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
        .sort({ createdAt: sort === 'Ascending' ? 1 : -1 })
        .skip(skip)
        .limit(limit)

      const total = await Album.countDocuments(filter)
      const albumsData = albums.map((album) => {
        return {
          likedBy: album.likedBy.length,
          isLikedByCurrentUser: album.likedBy.includes(userId),
          ...album,
        }
      })
      res.json({
        albums: albumsData,
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
      const sort = (req.query.sort as string) ?? 'Ascending'
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
        .sort({ createdAt: sort === 'Ascending' ? 1 : -1 })
        .skip(skip)
        .limit(limit)

      const total = await Album.countDocuments(filter)
      const albumsData = albums.map((album) => {
        return {
          likedBy: album.likedBy.length,
          isLikedByCurrentUser: album.likedBy.includes(user.id),
          ...album,
        }
      })
      res.json({
        albums: albumsData,
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
      const sort = (req.query.sort as string) ?? 'Ascending'
      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 20
      const skip = (page - 1) * limit

      const albums = await Album.find({ artist: userId })
        .populate('artist', 'displayName')
        .populate('collaborators', 'displayName')
        .populate({
          path: 'songs',
          populate: [
            {
              path: 'metadata.artist',
              select: 'displayName',
            },
            {
              path: 'metadata.album',
              select: 'title',
            },
          ],
        })
        .sort({ createdAt: sort === 'Ascending' ? 1 : -1 })
        .skip(skip)
        .limit(limit)

      const total = await Album.countDocuments({ artist: userId })
      const albumsData = albums.map((album) => {
        return {
          likedBy: album.likedBy.length,
          isLikedByCurrentUser: album.likedBy.includes(userId),
          ...album.toObject(),
        }
      })
      res.json({
        albums: albumsData,
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
  '/album/:albumId',
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
          populate: [
            {
              path: 'metadata.artist',
              select: 'displayName',
            },
            {
              path: 'metadata.album',
              select: 'title',
            },
          ],
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
      let albumStreamCount = 0
      const songs = await Promise.all(
        album.songs.map(async (song: any) => {
          albumStreamCount += song.metadata.streamCount
          return {
            ...song.toObject(),
            isLikedByCurrentUser: song.metadata.likedBy.includes(user.id),
            likedBy: song.metadata.likedBy.length,
            streamCount: song.metadata.streamCount,
          }
        })
      )

      await album.updateOne({
        $set: {
          streamCount: albumStreamCount,
        },
      })

      const isLikedByCurrentUser = album.likedBy.includes(user.id)
      res.json({
        album: {
          ...album.toObject(),
          songs,
          likedBy: album.likedBy.length,
          isLikedByCurrentUser,
          streamCount: albumStreamCount,
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

export { router as albumRouter }
