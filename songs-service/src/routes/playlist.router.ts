import { Router, Response, NextFunction } from 'express'
import { Playlist } from '../models/Playlist.model'
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
import { r2Client } from '../config/cloudflareR2'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { User } from '../models/User.model'
import { Song } from '../models/Song.model'
import { SongServiceEventPublisher } from '../events/song-event-publisher'
import { extractKeyFromR2Url } from '../utils/extractKeyFromUrl'
import { Album } from '../models/Album.model'

const router = Router()

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
  body('coverArtFileName')
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

      if (!playlistId) {
        throw new CustomError('Playlist ID is required', 400)
      }

      const playlist = await Playlist.findOne({
        _id: playlistId,
        $or: [{ creator: user.id }, { collaborators: { $in: [user.id] } }],
      })
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
      if (!playlistId) {
        throw new CustomError('Playlist ID is required', 400)
      }
      const playlist = await Playlist.findOne({
        _id: playlistId,
        $or: [{ creator: user.id }, { collaborators: { $in: [user.id] } }],
      })
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
        playlist.coverUrl = `${process.env.R2_CUSTOM_DOMAIN}/${coverKey}`
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

// update playlist details
router.put(
  '/update/details/:playlistId',
  [
    body('title').isString().withMessage('Title must be a string').optional(),
    body('description')
      .isString()
      .withMessage('Description must be a string')
      .optional(),
    body('visibility')
      .isString()
      .withMessage('Visibility must be a string')
      .isIn(['public', 'private'])
      .withMessage('Visibility must be either public or private')
      .optional(),
    validateRequest,
  ],
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

      const { title, description, visibility } = req.body

      const playlist = await Playlist.findOne({
        _id: playlistId,
        $or: [{ creator: user.id }, { collaborators: { $in: [user.id] } }],
      })

      if (!playlist) {
        throw new CustomError('Playlist not found', 404)
      }

      if (playlist.creator.toString() !== user.id.toString()) {
        throw new CustomError(
          'You are not authorized to update this playlist',
          403
        )
      }
      if (title) {
        playlist.title = title
      }
      if (description) {
        playlist.description = description
      }

      if (visibility && ['public', 'private'].includes(visibility)) {
        playlist.visibility = visibility
      }
      await playlist.save()

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
        message: 'Playlist details updated successfully',
        playlist,
      })
    } catch (error) {
      next(error)
    }
  }
)

// add a collaborator to a playlist
router.post(
  '/playlist/:playlistId/add/collaborator',
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
      const { collaboratorEmail } = req.body
      if (!collaboratorEmail) {
        throw new CustomError('Collaborator email is required', 400)
      }
      const playlist = await Playlist.findOne({
        _id: playlistId,
        creator: user.id,
      })
      if (!playlist) {
        throw new CustomError(
          'Playlist not found or you are not authorized',
          404
        )
      }
      const collaborator = await User.findOne({
        email: collaboratorEmail,
      })
      if (!collaborator) {
        throw new CustomError('Collaborator not found', 404)
      }
      if (playlist.collaborators.includes(collaborator._id)) {
        return res.status(200).json({
          message: 'Collaborator already exists in the playlist',
        })
      }
      playlist.collaborators.push(collaborator._id)
      await playlist.save()
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
    } catch (error) {
      next(error)
    }
  }
)

//remove a collaborator from a playlist
router.delete(
  '/playlist/:playlistId/remove/collaborator',
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
      const { collaboratorEmail } = req.body
      if (!collaboratorEmail) {
        throw new CustomError('Collaborator email is required', 400)
      }
      const playlist = await Playlist.findOne({
        _id: playlistId,
        creator: user.id,
      })
      if (!playlist) {
        throw new CustomError(
          'Playlist not found or you are not authorized',
          404
        )
      }
      const collaborator = await User.findOne({
        email: collaboratorEmail,
      })
      if (!collaborator) {
        throw new CustomError('Collaborator not found', 404)
      }
      if (!playlist.collaborators.includes(collaborator._id)) {
        return res.status(200).json({
          message: 'Collaborator does not exist in the playlist',
        })
      }
      playlist.collaborators = playlist.collaborators.filter(
        (c: any) => c.toString() !== collaborator._id.toString()
      )
      await playlist.save()
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
router.post(
  '/add/song/:songId/playlist/:playlistId',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }

      const { songId } = req.params
      const { playlistId } = req.params
      if (!songId || !playlistId) {
        throw new CustomError('Song ID and Playlist ID are required', 400)
      }
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
              addedBy: user.id,
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
router.delete(
  '/remove/song/:songId/playlist/:playlistId',
  requireAuth,

  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }

      const { songId } = req.params
      const { playlistId } = req.params

      if (!songId || !playlistId) {
        throw new CustomError('Song ID and Playlist ID are required', 400)
      }
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
  '/reorder/complete/simplified',
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

router.post(
  '/add/album/:albumId/playlist/:playlistId',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError(
          'User not authenticated',
          401,
          'User must be logged in to like a song'
        )
      }
      const { albumId } = req.params
      const { playlistId } = req.params
      if (!albumId) {
        throw new CustomError(
          'Album ID is required',
          400,
          'Please provide a valid album ID'
        )
      }
      const album = await Album.findById(albumId)
      if (!album) {
        throw new CustomError(
          'Album not found',
          404,
          'The specified album does not exist'
        )
      }
      const playlist = await Playlist.findOne({
        _id: playlistId,
        $or: [{ creator: user.id }, { collaborators: user.id }],
      })

      if (!playlist) {
        throw new CustomError(
          'Playlist not found',
          404,
          'The specified playlist does not exist or you are not authorized to add songs to it'
        )
      }

      let songsAdded = 0
      const songsToAdd: {
        songId: string
        addedBy: string
        order: number
      }[] = []

      album.songs.forEach((songId: string) => {
        const songExists = playlist.songs.some(
          (playlistSong: any) =>
            playlistSong.songId.toString() === songId.toString()
        )
        if (!songExists) {
          songsToAdd.push({
            songId,
            addedBy: user.id,
            order: playlist.songs.length + songsToAdd.length + 1,
          })
          songsAdded++
        }
      })

      if (songsToAdd.length > 0) {
        playlist.songs.push(...songsToAdd)
        await playlist.save()

        // Publish playlist updated event
        await SongServiceEventPublisher.PlaylistUpdatedEvent({
          playlistId: playlist._id,
          coverUrl: playlist.coverUrl,
          title: playlist.title,
          description: playlist.description,
          creator: playlist.creator,
          collaborators: playlist.collaborators,
          visibility: playlist.visibility,
          songs: playlist.songs,
          likedBy: playlist.likedBy,
        })
      }

      res.status(200).json({
        message:
          songsAdded > 0
            ? `${songsAdded} songs from album added to playlist successfully`
            : 'All songs from this album are already in the playlist',
        songsAdded,
        totalAlbumSongs: album.songs.length,
      })
    } catch (error) {
      next(error)
    }
  }
)
export { router as playlistRouter }
