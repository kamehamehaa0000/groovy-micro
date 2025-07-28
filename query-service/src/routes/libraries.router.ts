import {
  AuthenticatedRequest,
  CustomError,
  optionalAuth,
  requireAuth,
} from '@groovy-streaming/common'
import { NextFunction, Router, Response, Request } from 'express'
import Library from '../models/Library.model'
import { Song } from '../models/Song.model'
import { Album } from '../models/Album.model'
import { Playlist } from '../models/Playlist.model'

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
            {
              path: 'metadata.album',
              select: 'title coverUrl',
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

router.get(
  '/liked-songs',
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
      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 20
      const skip = (page - 1) * limit

      const likedSongs = await Song.find({
        'metadata.likedBy': user.id,
      })
        .populate('metadata.artist', 'displayName')
        .populate('metadata.album', 'title coverUrl')
        .populate('metadata.collaborators', 'displayName')
        .limit(limit)
        .skip(skip)

      const total = await Song.countDocuments({
        'metadata.likedBy': user.id,
      })

      if (!likedSongs) {
        throw new CustomError('No liked songs found', 404)
      }
      const songsRes = likedSongs.map((song) => {
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

router.get(
  '/liked-albums',
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

      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 20
      const skip = (page - 1) * limit

      const likedAlbums = await Album.find({
        likedBy: user.id,
      })
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
        .limit(limit)
        .skip(skip)
      const total = await Album.countDocuments({
        likedBy: user.id,
      })

      if (!likedAlbums) {
        throw new CustomError('No liked albums found', 404)
      }
      const albumsRes = likedAlbums.map((album) => {
        return {
          ...album.toObject(),
          isLikedByCurrentUser: true,
          likedBy: album.likedBy.length,
        }
      })
      res.status(200).json({
        message: 'Liked albums retrieved successfully',
        albums: albumsRes,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalAlbums: total,
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

router.get(
  '/liked-playlists',
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
      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 20
      const skip = (page - 1) * limit
      const likedPlaylists = await Playlist.find({
        likedBy: user.id,
      })
        .populate('creator', 'displayName')
        .populate('collaborators', 'displayName')
        .populate({
          path: 'songs.songId',
          select: 'metadata hlsUrl coverArtUrl duration status',
          populate: [
            {
              path: 'metadata.artist',
              select: 'displayName',
            },
            {
              path: 'metadata.collaborators',
              select: 'displayName',
            },
          ],
        })
        .populate('songs.addedBy', 'displayName')
        .limit(limit)
        .skip(skip)

      const total = await Album.countDocuments({
        likedBy: user.id,
      })

      if (!likedPlaylists) {
        throw new CustomError('No liked playlists found', 404)
      }
      const playlistRes = likedPlaylists.map((playlist) => {
        return {
          ...playlist.toObject(),
          isLikedByCurrentUser: true,
          likedBy: playlist.likedBy.length,
        }
      })
      res.status(200).json({
        message: 'Liked playlists retrieved successfully',
        playlists: playlistRes,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalPlaylists: total,
        },
      })
    } catch (error) {
      next(error)
    }
  }
)
export { router as libraryRouter }
