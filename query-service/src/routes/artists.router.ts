import {
  AuthenticatedRequest,
  CustomError,
  requireAuth,
} from '@groovy-streaming/common'
import { NextFunction, Router, Response, Request } from 'express'
import { Song } from '../models/Song.model'
import { Album } from '../models/Album.model'

import User from '../models/User.model'

const router = Router()

//fetch all artists
router.get(
  '/artists',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user
      if (!user) {
        throw new CustomError(
          'User not authenticated',
          401,
          'Please login/register or try again later.'
        )
      }
      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 20
      const skip = (page - 1) * limit

      const artist = await User.find()
        .select('displayName')
        .skip(skip)
        .limit(limit)

      const total = await User.countDocuments()

      res.status(200).json({
        message: 'All artists retrieved successfully',
        artists: artist,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalArtists: total,
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

//fetch artist by id
router.get(
  '/artist/:artistId',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user
      if (!user) {
        throw new CustomError(
          'User not authenticated',
          401,
          'Please login/register or try again later.'
        )
      }
      const { artistId } = req.params
      const artist = await User.findById(artistId).select('displayName')
      if (!artist) {
        throw new CustomError('Artist not found', 404)
      }
      res.status(200).json({
        message: 'Artist retrieved successfully',
        artist,
      })
    } catch (error) {
      next(error)
    }
  }
)

//fetch songs by artist id
router.get(
  '/songs/artist/:artistId',
  requireAuth,
  async (
    req: AuthenticatedRequest | Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const user = (req as AuthenticatedRequest).user
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }
      const { artistId } = req.params
      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 20
      const skip = (page - 1) * limit
      const filter: any = { 'metadata.artist': artistId }

      if (user.id.toString() !== artistId) {
        filter.visibility = 'public'
      }
      const artistSongs = await Song.find(filter)
        .populate('metadata.artist', 'displayName')
        .populate('metadata.album', 'title coverUrl')
        .populate('metadata.collaborators', 'displayName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)

      const total = await Song.countDocuments(filter)

      if (!artistSongs) {
        throw new CustomError('No liked songs found', 404)
      }
      const songsRes = artistSongs.map((song) => {
        return {
          ...song.toObject(),
          isLikedByCurrentUser: true,
          likedBy: song.metadata.likedBy.length,
        }
      })
      res.status(200).json({
        message: 'Liked songs retrieved successfully',
        songs: songsRes,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalSongs: total,
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

//fetch albums by artist id
router.get(
  '/albums/artist/:artistId',
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
        .skip(skip)
        .limit(limit)

      const total = await Album.countDocuments(filter)
      const albumsData = albums.map((album) => {
        return {
          likedBy: album.likedBy.length,
          isLikedByCurrentUser: album.likedBy.includes(user.id),
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

export { router as artistsRouter }
