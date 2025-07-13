import { Router, Response, NextFunction } from 'express'
import { Playlist } from '../../models/Playlist.model'
import { v4 as uuid } from 'uuid'
import {
  AuthenticatedRequest,
  CustomError,
  requireAuth,
  validateRequest,
} from '@groovy-streaming/common'
import { body } from 'express-validator'
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import { r2Client } from '../../config/cloudflareR2'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { User } from '../../models/User.model'
import { Song } from '../../models/Song.model'
import { SongServiceEventPublisher } from '../../events/song-event-publisher'
import { extractKeyFromR2Url } from '../../utils/extractKeyFromUrl'

const router = Router()

const PlaylistCreateBodyValidator = [
  body('coverUploadKey')
    .isString()
    .withMessage('Cover upload key must be a string')
    .notEmpty()
    .withMessage('Cover upload key cannot be empty'),
  body('playlistId')
    .isString()
    .withMessage('Playlist ID must be a string')
    .notEmpty()
    .withMessage('Playlist ID cannot be empty'),
  body('title')
    .isString()
    .withMessage('Title must be a string')
    .notEmpty()
    .withMessage('Title cannot be empty'),
  body('description')
    .isString()
    .withMessage('Description must be a string')
    .optional()
    .trim(),
  body('collaborators')
    .optional()
    .isArray()
    .withMessage('Collaborators must be an array of emails')
    .custom((value) => {
      if (
        !value.every(
          (item: any) =>
            typeof item === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)
        )
      ) {
        throw new Error('Each collaborator must be a valid email address')
      }
      return true
    }),
  body('visibility')
    .notEmpty()
    .isIn(['public', 'private'])
    .withMessage('Visibility must be either "public" or "private"'),
]

// quick create playlist without cover and colaborators
router.post(
  '/create/quick',
  requireAuth,
  body('title')
    .isString()
    .withMessage('Title must be a string')
    .notEmpty()
    .withMessage('Title cannot be empty'),
  body('visibility')
    .notEmpty()
    .isIn(['public', 'private'])
    .withMessage('Visibility must be either "public" or "private"'),
  validateRequest,

  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }
      const { title, visibility } = req.body
      console.log(
        'Creating playlist with title:',
        title,
        'visibility:',
        visibility
      )
      const playlist = new Playlist({
        _id: uuid(),
        title,
        creator: user.id,
        collaborators: [],
        visibility: visibility,
        coverUrl: '',
        songs: [],
      })

      await playlist.save()

      res
        .status(201)
        .json({ message: 'Playlist created successfully', playlist })
    } catch (error) {
      next(error)
    }
  }
)
// playlist update cover art upload presign
router.put(
  '/update/cover/playlist/:playlistId',
  requireAuth,
  body('coverFileName')
    .isString()
    .withMessage('Cover file name must be a string')
    .notEmpty()
    .withMessage('Cover file name cannot be empty')
    .matches(/\.(jpg|png)$/i)
    .withMessage('Cover file name must end with .jpg or .png'),
  validateRequest,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }
      const { playlistId } = req.params
      const { coverArtFileName } = req.body

      const playlist = await Playlist.findById(playlistId)
      if (!playlist) {
        return res.status(404).json({ message: 'Playlist not found' })
      }

      const coverKey = `playlists/${playlistId}/${coverArtFileName}`
      const command = new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: coverKey,
        ContentType: coverArtFileName.endsWith('.jpg')
          ? 'image/jpeg'
          : 'image/png',
      })

      const presignedUrl = await getSignedUrl(r2Client, command, {
        expiresIn: 3600,
      })

      res.json({ presignedUrl, coverKey })
    } catch (error: any) {
      next(error)
    }
  }
)
// Confirm playlist cover art update upload
router.put(
  '/update/cover/confirm/playlist/:playlistId',
  requireAuth,
  body('coverKey')
    .isString()
    .withMessage('Cover key must be a string')
    .notEmpty()
    .withMessage('Cover key cannot be empty'),
  validateRequest,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }
      const { playlistId } = req.params
      const { coverKey } = req.body

      const playlist = await Playlist.findById(playlistId)
      if (!playlist) {
        return res.status(404).json({ message: 'Playlist not found' })
      }

      // Check if file exists in R2
      const headCommand = new HeadObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: coverKey,
      })

      try {
        // File exists, update playlist with cover key
        await r2Client.send(headCommand)
        // Delete the previous cover file if it exists
        if (playlist.coverUrl) {
          const previousCoverKey = extractKeyFromR2Url(
            playlist.coverUrl,
            process.env.R2_CUSTOM_DOMAIN!
          )
          const deleteCommand = new DeleteObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: previousCoverKey,
          })
          try {
            await r2Client.send(deleteCommand)
          } catch (error) {
            console.error('Error deleting previous cover art:', error)
          }
        }
        playlist.coverUrl = `https://${process.env.R2_CUSTOM_DOMAIN}/${coverKey}`
        await playlist.save()
      } catch (error: any) {
        if (error.name === 'NotFound') {
          throw new CustomError('Cover art file not found in storage', 404)
        }
        throw error
      }
      await SongServiceEventPublisher.PlaylistUpdatedEvent({
        playlistId: playlist._id,
        title: playlist.title,
        description: playlist.description,
        coverUrl: playlist.coverUrl,
        creator: playlist.creator,
        collaborators: playlist.collaborators,
        visibility: playlist.visibility,
        songs: playlist.songs,
        likedBy: playlist.likedBy,
      })
      res.json({
        message: 'Cover art updated successfully',
        coverUrl: playlist.coverUrl,
      })
    } catch (error) {
      next(error)
    }
  }
)
// delete a playlist
router.delete(
  '/:playlistId',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { user } = req
    if (!user) {
      throw new CustomError('User not authenticated', 401)
    }

    const { playlistId } = req.params
    if (!playlistId) {
      throw new CustomError('Playlist ID is required', 400)
    }

    const playlist = await Playlist.findById(playlistId)
    if (!playlist) {
      throw new CustomError('Playlist not found', 404)
    }
    if (playlist.creator.toString() !== user._id.toString()) {
      throw new CustomError(
        'You are not authorized to delete this playlist',
        403
      )
    }
    await Playlist.deleteOne({ _id: playlistId })
    await SongServiceEventPublisher.PlaylistDeletedEvent({
      playlistId,
    })
    res.status(200).json({ message: 'Playlist deleted successfully' })
  }
)

// add a song to a playlist
router.patch(
  '/add/song/:songId',
  requireAuth,
  [
    body('playlistId')
      .isString()
      .withMessage('Playlist ID must be a string')
      .notEmpty()
      .withMessage('Playlist ID cannot be empty'),
    validateRequest,
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }

      const { songId } = req.params
      const { playlistId } = req.body

      // Validate song exists and is available in one query
      const song = await Song.findOne({
        _id: songId,
      }).select('_id')

      if (!song) {
        throw new CustomError('Song not found or not available', 404)
      }

      // Get the playlist first to check authorization and calculate order
      const playlist = await Playlist.findOne({
        _id: playlistId,
        $or: [{ creator: user.id }, { collaborators: user.id }],
      }).select('songs creator collaborators')

      if (!playlist) {
        // Check specific failure reason
        const playlistCheck = await Playlist.findById(playlistId).select(
          'creator collaborators'
        )

        if (!playlistCheck) {
          throw new CustomError('Playlist not found', 404)
        }

        throw new CustomError(
          'You are not authorized to add songs to this playlist',
          403
        )
      }

      // Check if song already exists in playlist
      const songExists = playlist.songs.some(
        (s: { songId: string }) => s.songId.toString() === songId
      )

      if (songExists) {
        res.status(200).json({
          message: 'Song already exists in the playlist',
        })
        return
      }

      // Calculate the next order number
      const nextOrder = playlist.songs.length + 1

      // Update the playlist with the new song
      const updatedPlaylist = await Playlist.findByIdAndUpdate(
        playlistId,
        {
          $push: {
            songs: {
              songId,
              addedBy: user._id,
              order: nextOrder,
            },
          },
        },
        { new: true }
      )

      if (!updatedPlaylist) {
        throw new CustomError('Failed to add song to playlist', 500)
      }

      const addedSong = updatedPlaylist.songs[updatedPlaylist.songs.length - 1]

      await SongServiceEventPublisher.PlaylistUpdatedEvent({
        playlistId: updatedPlaylist._id,
        title: updatedPlaylist.title,
        description: updatedPlaylist.description,
        creator: updatedPlaylist.creator,
        collaborators: updatedPlaylist.collaborators,
        visibility: updatedPlaylist.visibility,
        coverUrl: updatedPlaylist.coverUrl,
        songs: updatedPlaylist.songs,
        likedBy: updatedPlaylist.likedBy,
      })

      res.status(200).json({
        message: 'Song added to playlist successfully',
        data: {
          playlistId,
          songId,
          order: addedSong.order,
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

// remove a song from a playlist (including reordering)
router.patch(
  '/remove/song/:songId',
  requireAuth,
  [
    body('playlistId')
      .isString()
      .withMessage('Playlist ID must be a string')
      .notEmpty()
      .withMessage('Playlist ID cannot be empty'),
    validateRequest,
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }

      const { songId } = req.params
      const { playlistId } = req.body

      // Use findOneAndUpdate with conditions to handle all validations atomically
      const updatedPlaylist = await Playlist.findOneAndUpdate(
        {
          _id: playlistId,
          $or: [{ creator: user.id }, { collaborators: user.id }],
          'songs.songId': songId, // Ensure song exists in playlist
        },
        {
          $pull: {
            songs: { songId },
          },
        },
        {
          new: true,
        }
      )

      if (!updatedPlaylist) {
        // Check specific failure reason
        const playlist = await Playlist.findById(playlistId).select(
          'creator collaborators songs'
        )

        if (!playlist) {
          throw new CustomError('Playlist not found', 404)
        }

        const isAuthorized =
          playlist.creator.toString() === user.id.toString() ||
          playlist.collaborators?.some(
            (c: string) => c.toString() === user.id.toString()
          )

        if (!isAuthorized) {
          throw new CustomError(
            'You are not authorized to remove songs from this playlist',
            403
          )
        }

        throw new CustomError('Song not found in the playlist', 404)
      }

      // Reorder remaining songs to maintain sequence
      const reorderUpdates = updatedPlaylist.songs.map(
        (song: { songId: string }, index: number) => ({
          updateOne: {
            filter: {
              _id: playlistId,
              'songs.songId': song.songId,
            },
            update: {
              $set: { 'songs.$.order': index + 1 },
            },
          },
        })
      )

      if (reorderUpdates.length > 0) {
        await Playlist.bulkWrite(reorderUpdates)
      }
      await SongServiceEventPublisher.PlaylistUpdatedEvent({
        playlistId: updatedPlaylist._id,
        title: updatedPlaylist.title,
        description: updatedPlaylist.description,
        creator: updatedPlaylist.creator,
        collaborators: updatedPlaylist.collaborators,
        visibility: updatedPlaylist.visibility,
        coverUrl: updatedPlaylist.coverUrl,
        songs: updatedPlaylist.songs,
        likedBy: updatedPlaylist.likedBy,
      })

      res.status(200).json({
        message: 'Song removed from playlist successfully',
        data: {
          playlistId,
          songId,
          remainingSongs: updatedPlaylist.songs.length,
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

// reorder all songs in a playlist
router.put(
  '/reorder/complete',
  requireAuth,
  [
    body('playlistId')
      .isString()
      .withMessage('Playlist ID must be a string')
      .notEmpty()
      .withMessage('Playlist ID cannot be empty'),
    body('orderedSongIds')
      .isArray()
      .withMessage('Ordered song IDs must be an array')
      .custom((value) => {
        if (value.length === 0) {
          throw new Error('Ordered song IDs cannot be empty')
        }
        // Check for duplicates
        const uniqueIds = new Set(value)
        if (uniqueIds.size !== value.length) {
          throw new Error('Duplicate song IDs are not allowed')
        }
        return true
      }),
    validateRequest,
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }

      const { playlistId, orderedSongIds } = req.body

      // Get playlist and verify authorization
      const playlist = await Playlist.findOne({
        _id: playlistId,
        $or: [{ creator: user._id }, { collaborators: user._id }],
      }).select('songs')

      if (!playlist) {
        // Check specific failure reason
        const playlistCheck = await Playlist.findById(playlistId).select(
          'creator collaborators'
        )

        if (!playlistCheck) {
          throw new CustomError('Playlist not found', 404)
        }

        throw new CustomError(
          'You are not authorized to reorder songs in this playlist',
          403
        )
      }

      // Validate that all songs exist and count matches
      const playlistSongIds = playlist.songs
        .map((s: { songId: string }) => s.songId.toString())
        .sort()
      const providedSongIds = orderedSongIds.slice().sort() //using slice to avoid mutating original array

      if (
        playlistSongIds.length !== providedSongIds.length ||
        !playlistSongIds.every(
          (id: string, index: number) => id === providedSongIds[index]
        )
      ) {
        throw new CustomError(
          'Provided song IDs must exactly match all songs in the playlist',
          400
        )
      }

      // Create reordered songs array
      const reorderedSongs = orderedSongIds.map(
        (songId: string, index: number) => {
          const originalSong = playlist.songs.find(
            (s: { songId: string }) => s.songId.toString() === songId
          )
          return {
            ...originalSong,
            order: index + 1,
          }
        }
      )

      // Update playlist with new order
      const updateResult = await Playlist.updateOne(
        { _id: playlistId },
        { $set: { songs: reorderedSongs } }
      )

      if (updateResult.modifiedCount === 0) {
        throw new CustomError('Failed to reorder playlist', 500)
      }
      const updatedPlaylist = await Playlist.findById(playlistId)
      if (!updatedPlaylist) {
        throw new CustomError('Playlist not found', 404)
      }
      await SongServiceEventPublisher.PlaylistUpdatedEvent({
        playlistId: updatedPlaylist._id,
        title: updatedPlaylist.title,
        description: updatedPlaylist.description,
        creator: updatedPlaylist.creator,
        collaborators: updatedPlaylist.collaborators,
        visibility: updatedPlaylist.visibility,
        coverUrl: updatedPlaylist.coverUrl,
        songs: updatedPlaylist.songs,
        likedBy: updatedPlaylist.likedBy,
      })

      res.status(200).json({
        message: 'Playlist reordered successfully',
        data: {
          playlistId,
          totalSongs: reorderedSongs.length,
          newOrder: orderedSongIds,
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

// reorder all songs in a playlist - simplified version
router.put(
  '/reorder/complete',
  requireAuth,
  [
    body('playlistId')
      .isString()
      .withMessage('Playlist ID must be a string')
      .notEmpty()
      .withMessage('Playlist ID cannot be empty'),
    body('songs')
      .isArray()
      .withMessage('Songs must be an array')
      .custom((value) => {
        if (value.length === 0) {
          throw new Error('Songs array cannot be empty')
        }
        return true
      }),
    validateRequest,
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }

      const { playlistId, songs } = req.body

      // Validate authorization and playlist existence
      const playlist = await Playlist.findOne({
        _id: playlistId,
        $or: [{ creator: user._id }, { collaborators: user._id }],
      }).select('_id')

      if (!playlist) {
        const playlistCheck = await Playlist.findById(playlistId).select(
          'creator collaborators'
        )
        if (!playlistCheck) {
          throw new CustomError('Playlist not found', 404)
        }
        throw new CustomError(
          'You are not authorized to reorder songs in this playlist',
          403
        )
      }

      // Simply replace the entire songs array
      const updateResult = await Playlist.updateOne(
        { _id: playlistId },
        { $set: { songs } }
      )

      if (updateResult.modifiedCount === 0) {
        throw new CustomError('Failed to reorder playlist', 500)
      }
      const updatedPlaylist = await Playlist.findById(playlistId)
      if (!updatedPlaylist) {
        throw new CustomError('Playlist not found', 404)
      }
      await SongServiceEventPublisher.PlaylistUpdatedEvent({
        playlistId: updatedPlaylist._id,
        title: updatedPlaylist.title,
        description: updatedPlaylist.description,
        creator: updatedPlaylist.creator,
        collaborators: updatedPlaylist.collaborators,
        visibility: updatedPlaylist.visibility,
        coverUrl: updatedPlaylist.coverUrl,
        songs: updatedPlaylist.songs,
        likedBy: updatedPlaylist.likedBy,
      })

      res.status(200).json({
        message: 'Playlist reordered successfully',
        data: {
          playlistId,
          totalSongs: songs.length,
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

// remove collaborator from a playlist
router.delete(
  '/remove/collaborator/:collaboratorEmail',
  requireAuth,
  [
    body('playlistId')
      .isString()
      .withMessage('Playlist ID must be a string')
      .notEmpty()
      .withMessage('Playlist ID is required'),
    validateRequest,
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }

      const { collaboratorEmail } = req.params
      if (!collaboratorEmail) {
        throw new CustomError('Valid collaborator email is required', 400)
      }
      const collaborator = await User.findOne({
        email: collaboratorEmail,
      })
      if (!collaborator) {
        throw new CustomError('Collaborator not found', 404)
      }
      // Find the playlist the user is trying to modify and whether they are authorized
      const playlist = await Playlist.findOneAndUpdate(
        {
          _id: req.body.playlistId,
          $and: [
            { creator: user._id },
            {
              collaborators: {
                $in: [collaboratorEmail],
              },
            },
          ],
        },
        {
          $pull: { collaborators: collaborator._id },
        },
        {
          new: true,
        }
      )

      if (!playlist) {
        const existingPlaylist = await Playlist.findById(req.body.playlistId)
        if (!existingPlaylist) {
          throw new CustomError('Playlist not found', 404)
        }
        // Check if the user is authorized to remove collaborators
        const isAuthorized =
          existingPlaylist.creator.toString() === user._id.toString() ||
          existingPlaylist.collaborators?.some(
            (c: string) => c.toString() === user._id.toString()
          )
        if (!isAuthorized) {
          throw new CustomError(
            'You are not authorized to remove collaborators from this playlist',
            403
          )
        }
      }
      if (!playlist) {
        throw new CustomError(
          'Not able to remove collaborator from playlist, Try again later',
          403
        )
      }
      await SongServiceEventPublisher.PlaylistUpdatedEvent({
        playlistId: playlist._id,
        title: playlist.title,
        description: playlist.description,
        creator: playlist.creator,
        collaborators: playlist.collaborators,
        visibility: playlist.visibility,
        songs: playlist.songs,
        coverUrl: playlist.coverUrl,
        likedBy: playlist.likedBy,
      })

      res.status(200).json({
        message: 'Collaborator removed successfully',
        data: playlist,
      })
    } catch (error) {
      next(error)
    }
  }
)

// get all public playlists
router.get(
  '/get/all/public?page=:page&limit=:limit&sort=:sort',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }
      const sort = (req.query.sort as string) ?? 'Ascending'
      const page = parseInt(req.query.page as string) ?? 1
      const limit = parseInt(req.query.limit as string) ?? 10
      const skip = (page - 1) * limit

      const playlists = await Playlist.find({ visibility: 'public' })
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
        .sort({ createdAt: sort === 'Ascending' ? 1 : -1 })
        .skip(skip)
        .limit(limit)

      const playlistData = playlists.map((playlist) => {
        return {
          likedBy: playlist.likedBy.length,
          likedByCurrentUser: playlist.likedBy.includes(user.id),
          ...playlist,
        }
      })

      res.status(200).json({ playlists: playlistData })
    } catch (error) {
      next(error)
    }
  }
)

// get all playlists by current user
router.get(
  '/me?page=:page&limit=:limit&sort=:sort',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }
      const sort = (req.query.sort as string) ?? 'Ascending'
      const page = parseInt(req.query.page as string) ?? 1
      const limit = parseInt(req.query.limit as string) ?? 10
      const skip = (page - 1) * limit

      const playlists = await Playlist.find({ creator: user.id })
        .populate('creator', 'displayName')
        .populate('collaborators', 'displayName')
        .populate({
          path: 'songs.songId',
          select: 'metadata hlsUrl coverArtUrl status',
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
        .sort({ createdAt: sort === 'Ascending' ? 1 : -1 })
        .skip(skip)
        .limit(limit)
      const playlistData = playlists.map((playlist) => {
        return {
          likedBy: playlist.likedBy.length,
          likedByCurrentUser: playlist.likedBy.includes(user.id),
          ...playlist,
        }
      })
      res.status(200).json({ playlists: playlistData })
    } catch (error) {
      next(error)
    }
  }
)

// get playlist by id
router.get(
  '/playlist/id/:playlistId',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }

      const { playlistId } = req.params
      if (!playlistId) {
        throw new CustomError('Playlist ID is required', 400)
      }

      const playlist = await Playlist.findById(playlistId)
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

      res.status(200).json({
        likedBy: playlist.likedBy.length,
        likedByCurrentUser: playlist.likedBy.includes(user.id),
        ...playlist,
      })
    } catch (error) {
      next(error)
    }
  }
)

// get public playlists where user is either creator or collaborator
router.get(
  '/user/:userId/public?page=:page&limit=:limit&sort=:sort',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }
      const sort = (req.query.sort as string) ?? 'Ascending'
      const page = parseInt(req.query.page as string) ?? 1
      const limit = parseInt(req.query.limit as string) ?? 10
      const skip = (page - 1) * limit

      const { userId } = req.params
      if (!userId) {
        throw new CustomError('User ID is required', 400)
      }

      // Validate that the user exists
      const targetUser = await User.findById(userId).select('_id displayName')
      if (!targetUser) {
        throw new CustomError('User not found', 404)
      }

      // Find playlists where user is creator OR collaborator AND visibility is public
      const playlists = await Playlist.find({
        $and: [
          { visibility: 'public' },
          {
            $or: [{ creator: userId }, { collaborators: userId }],
          },
        ],
      })
        .populate('creator', 'displayName email')
        .populate('collaborators', 'displayName email')
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
        .sort({ createdAt: sort === 'Ascending' ? 1 : -1 })
        .skip(skip)
        .limit(limit)

      // Add role information to each playlist
      const playlistsWithRoles = playlists.map((playlist) => {
        const isCreator = playlist.creator === userId
        const isCollaborator = playlist.collaborators?.some(
          (collaborator: any) => collaborator._id.toString() === userId
        )

        return {
          ...playlist.toObject(),
          userRole: isCreator
            ? 'creator'
            : isCollaborator
            ? 'collaborator'
            : null,
        }
      })

      res.status(200).json({
        message: 'Public playlists retrieved successfully',
        data: {
          user: {
            id: targetUser._id,
            displayName: targetUser.displayName,
          },
          playlists: playlistsWithRoles,
          totalCount: playlistsWithRoles.length,
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

// get public playlists where user is creator
router.get(
  '/user/:userId/created/public?page=:page&limit=:limit&sort=:sort',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }

      const { userId } = req.params
      if (!userId) {
        throw new CustomError('User ID is required', 400)
      }
      const sort = (req.query.sort as string) ?? 'Ascending'
      const page = parseInt(req.query.page as string) ?? 1
      const limit = parseInt(req.query.limit as string) ?? 20
      const skip = (page - 1) * limit

      // Validate that the user exists
      const targetUser = await User.findById(userId).select('_id displayName')
      if (!targetUser) {
        throw new CustomError('User not found', 404)
      }

      // Find playlists created by the user that are public
      const playlists = await Playlist.find({
        creator: userId,
        visibility: 'public',
      })
        .populate('creator', 'displayName email')
        .populate('collaborators', 'displayName email')
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
        .sort({ createdAt: sort === 'Ascending' ? 1 : -1 })
        .skip(skip)
        .limit(limit)

      res.status(200).json({
        message: 'Public playlists created by user retrieved successfully',
        data: {
          user: {
            id: targetUser._id,
            displayName: targetUser.displayName,
          },
          playlists,
          totalCount: playlists.length,
          role: 'creator',
        },
      })
    } catch (error) {
      next(error)
    }
  }
)
// get public playlists where user is a collaborator
router.get(
  '/user/:userId/collaborated/public?page=:page&limit=:limit&sort=:sort',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }

      const { userId } = req.params
      if (!userId) {
        throw new CustomError('User ID is required', 400)
      }
      const sort = (req.query.sort as string) ?? 'Ascending'
      const page = parseInt(req.query.page as string) ?? 1
      const limit = parseInt(req.query.limit as string) ?? 10
      const skip = (page - 1) * limit

      // Validate that the user exists
      const targetUser = await User.findById(userId).select('_id displayName')
      if (!targetUser) {
        throw new CustomError('User not found', 404)
      }

      // Find playlists where user is a collaborator and visibility is public
      const playlists = await Playlist.find({
        collaborators: userId,
        visibility: 'public',
      })
        .populate('creator', 'displayName email')
        .populate('collaborators', 'displayName email')
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
        .sort({ createdAt: sort === 'Ascending' ? 1 : -1 })
        .skip(skip)
        .limit(limit)

      res.status(200).json({
        message: 'Public playlists collaborated by user retrieved successfully',
        data: {
          user: {
            id: targetUser._id,
            displayName: targetUser.displayName,
          },
          playlists,
          totalCount: playlists.length,
          role: 'collaborator',
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

// search playlists by title or description or creator/collaborators name
router.get(
  '/search?q=:q&page=:page&limit=:limit&sort=:sort',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }

      const query = req.query.q as string
      const sort = (req.query.sort as string) ?? 'Descending'
      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 10
      const skip = (page - 1) * limit

      if (!query || query.trim().length === 0) {
        throw new CustomError('Search query is required', 400)
      }

      if (limit > 50) {
        throw new CustomError('Limit cannot exceed 50', 400)
      }

      const searchQuery = query.trim()

      // First, find users that match the search query
      const matchingUsers = await User.find({
        displayName: { $regex: searchQuery, $options: 'i' },
      })
        .select('_id')
        .limit(100) // Limit to prevent too many user IDs

      const matchingUserIds = matchingUsers.map((user) => user._id)

      // Build comprehensive search filter
      const searchFilter = {
        $and: [
          // Search criteria - title, description, tags, or creator/collaborator names
          {
            $or: [
              { title: { $regex: searchQuery, $options: 'i' } },
              { description: { $regex: searchQuery, $options: 'i' } },
              { tags: { $regex: searchQuery, $options: 'i' } },
              ...(matchingUserIds.length > 0
                ? [
                    { creator: { $in: matchingUserIds } },
                    { collaborators: { $in: matchingUserIds } },
                  ]
                : []),
            ],
          },
          // Smart visibility logic
          {
            $or: [
              { visibility: 'public' },
              {
                $and: [
                  { visibility: 'private' },
                  {
                    $or: [{ creator: user._id }, { collaborators: user._id }],
                  },
                ],
              },
            ],
          },
        ],
      }

      // Get results with parallel queries
      const [playlists, totalPlaylists] = await Promise.all([
        Playlist.find(searchFilter)
          .populate('creator', 'displayName email')
          .populate('collaborators', 'displayName email')
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
          .sort({ createdAt: sort === 'Ascending' ? 1 : -1 })
          .skip(skip)
          .limit(limit),
        Playlist.countDocuments(searchFilter),
      ])

      const totalPages = Math.ceil(totalPlaylists / limit)

      res.status(200).json({
        message: 'playlist search completed successfully',
        data: {
          playlists: playlists,
          pagination: {
            currentPage: page,
            totalPages,
            totalPlaylists,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
            limit,
          },
          searchQuery,
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

// like or unlike a playlist
router.put(
  '/like/:playlistId',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }
      const { playlistId } = req.params
      if (!playlistId) {
        throw new CustomError('Playlist ID is required', 400)
      }

      // Check if user already liked the playlist
      const playlist = await Playlist.findById(playlistId)
      if (!playlist) {
        throw new CustomError('Playlist not found', 404)
      }

      const userLikedPlaylist = playlist.likedBy.includes(user.id)

      const updateOperation = userLikedPlaylist
        ? { $pull: { likedBy: user.id } }
        : { $addToSet: { likedBy: user.id } }

      const updatedPlaylist = await Playlist.findByIdAndUpdate(
        playlistId,
        updateOperation,
        { new: true }
      )

      if (!updatedPlaylist) {
        throw new CustomError('Playlist not found', 404)
      }

      // Publish playlist updated event
      await SongServiceEventPublisher.PlaylistUpdatedEvent({
        playlistId: updatedPlaylist._id,
        title: updatedPlaylist.title,
        creator: updatedPlaylist.creator,
        collaborators: updatedPlaylist.collaborators,
        songs: updatedPlaylist.songs,
        visibility: updatedPlaylist.visibility,
        likedBy: updatedPlaylist.likedBy,
        coverUrl: updatedPlaylist.coverUrl,
        description: updatedPlaylist.description,
      })

      res.json({
        message: userLikedPlaylist
          ? 'Playlist unliked successfully'
          : 'Playlist liked successfully',
        playlistId,
        isLikedByCurrentUser: !userLikedPlaylist,
        likeCount: updatedPlaylist.likedBy.length,
      })
    } catch (error) {
      next(error)
    }
  }
)
export { router as playlistRouter }
