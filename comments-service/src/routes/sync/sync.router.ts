import { requireSyncAuth } from '@groovy-streaming/common'
import { Request, Router, Response, NextFunction } from 'express'
import { Song } from '../../models/Song.model'
import { Album } from '../../models/Album.model'
import { Playlist } from '../../models/Playlist.model'

const router = Router()

router.get(
  '/songs',
  requireSyncAuth, // Middleware to ensure the request is authenticated with the sync API key
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 100
      const since = req.query.since ? new Date(req.query.since as string) : null
      const getAllIds = req.query.getAllIds === 'true' // New parameter for getting all song IDs

      if (getAllIds) {
        // Return all song IDs for deletion comparison
        const allSongIds = await Song.find({}).select('_id')
        res.status(200).json({
          message: 'All song IDs retrieved',
          data: {
            songIds: allSongIds.map((s) => s._id),
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

      const [songs, totalSongs] = await Promise.all([
        Song.find(userQuery).sort({ updatedAt: 1 }).skip(skip).limit(limit),

        Song.countDocuments(userQuery),
      ])

      const totalPages = Math.ceil(totalSongs / limit)

      res.status(200).json({
        message: 'Songs retrieved successfully',
        data: {
          songs,
          pagination: {
            currentPage: page,
            totalPages,
            totalSongs,
            limit,
            hasNextPage: page < totalPages,
          },
          syncInfo: {
            since: since?.toISOString() ?? null,
            timestamp: new Date().toISOString(),
            activeSongsCount: songs.length,
          },
        },
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
      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 100
      const since = req.query.since ? new Date(req.query.since as string) : null
      const getAllIds = req.query.getAllIds === 'true' // New parameter for getting all song IDs

      if (getAllIds) {
        // Return all album IDs for deletion comparison
        const allAlbumIds = await Album.find({}).select('_id')
        res.status(200).json({
          message: 'All album IDs retrieved',
          data: {
            albumIds: allAlbumIds.map((a) => a._id),
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

      const [albums, totalAlbums] = await Promise.all([
        Album.find(userQuery).sort({ updatedAt: 1 }).skip(skip).limit(limit),

        Song.countDocuments(userQuery),
      ])

      const totalPages = Math.ceil(totalAlbums / limit)

      res.status(200).json({
        message: 'Albums retrieved successfully',
        data: {
          albums,
          pagination: {
            currentPage: page,
            totalPages,
            totalAlbums,
            limit,
            hasNextPage: page < totalPages,
          },
          syncInfo: {
            since: since?.toISOString() ?? null,
            timestamp: new Date().toISOString(),
            activeAlbumsCount: albums.length,
          },
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

router.get(
  '/playlists',
  requireSyncAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 100
      const since = req.query.since ? new Date(req.query.since as string) : null
      const getAllIds = req.query.getAllIds === 'true' // New parameter for getting all song IDs

      if (getAllIds) {
        // Return all playlist IDs for deletion comparison
        const allPlaylistIds = await Playlist.find({}).select('_id')
        res.status(200).json({
          message: 'All playlist IDs retrieved',
          data: {
            playlistIds: allPlaylistIds.map((p) => p._id),
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

      const [playlists, totalPlaylists] = await Promise.all([
        Playlist.find(userQuery).sort({ updatedAt: 1 }).skip(skip).limit(limit),
        Playlist.countDocuments(userQuery),
      ])

      const totalPages = Math.ceil(totalPlaylists / limit)

      res.status(200).json({
        message: 'Playlists retrieved successfully',
        data: {
          playlists,
          pagination: {
            currentPage: page,
            totalPages,
            totalPlaylists,
            limit,
            hasNextPage: page < totalPages,
          },
          syncInfo: {
            since: since?.toISOString() ?? null,
            timestamp: new Date().toISOString(),
            activePlaylistsCount: playlists.length,
          },
        },
      })
    } catch (error) {
      next(error)
    }
  }
)
export { router as syncRouter }
