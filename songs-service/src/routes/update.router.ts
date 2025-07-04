import { NextFunction, Request, Response, Router } from 'express'
import {
  authenticate,
  AuthenticatedRequest,
  channel,
  CustomError,
  validateRequest,
} from '@groovy-streaming/common'
import { body } from 'express-validator'
import { Album } from '../models/Album.model'
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { r2Client } from '../config/cloudflareR2'
import { extractKeyFromR2Url } from '../utils/extractKeyFromUrl'
import { Song, StatusEnum } from '../models/Song.model'
import { SongEventPublisher } from '../events/song-event-publisher'
import User from '../models/User.model'

const router = Router()

const albumMetadataValidators = [
  body('name').optional().isString(),
  body('tags').optional().isArray(),
  body('genre').optional().isString(),
  body('collaborators').optional().isArray(),
  body('visibility').optional().isIn(['public', 'private']),
]

const singleMetadataValidators = [
  body('name').optional().isString(),
  body('tags').optional().isArray(),
  body('genre').optional().isString(),
  body('collaborators').optional().isArray(),
  body('visibility').optional().isIn(['public', 'private']),
]
const coverArtValidators = [
  body('coverArtFileName')
    .isString()
    .withMessage('Cover art file name must be a string')
    .notEmpty()
    .withMessage('Cover art file name cannot be empty')
    .matches(/\.(jpg|png)$/i)
    .withMessage('Cover art file name must end with .jpg or .png'),
]

// Album routes -  to update non-file fields
router.put(
  '/album/:albumId/metadata',
  authenticate,
  albumMetadataValidators,
  validateRequest,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }
      const { albumId } = req.params
      const { name, tags, genre, collaborators, visibility } = req.body

      const updatedFields: string[] = []
      const album = await Album.findById(albumId)
      if (!album) {
        throw new CustomError('Album not found', 404)
      }
      if (name) {
        album.title = name
        updatedFields.push('title')
      }
      if (tags) {
        album.tags = tags
        updatedFields.push('tags')
      }
      if (genre) {
        album.genre = genre
        updatedFields.push('genre')
      }
      if (collaborators) {
        const collaboratorUsers = await User.find({
          email: { $in: collaborators },
        }).select('_id')
        album.collaborators = collaboratorUsers.map((user) => user._id)
        updatedFields.push('collaborators')
      }
      if (visibility) {
        album.visibility = visibility
        updatedFields.push('visibility')
      }
      if (updatedFields.length === 0) {
        throw new CustomError('No fields to update', 400)
      }

      await album.save()

      await SongEventPublisher.AlbumUpdatedEvent({
        albumId,
        title: album.title,
        artist: album.artist,
        collaborators: album.collaborators,
        genre: album.genre,
        tags: album.tags,
        visibility: album.visibility,
        updatedFields: updatedFields,
      })
      res.json(album)
    } catch (error) {
      next(error)
    }
  }
)
// presign covert art update
router.post(
  '/album/:albumId/cover/presign',
  authenticate,
  coverArtValidators,
  validateRequest,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { user } = req
    if (!user) {
      throw new CustomError('User not authenticated', 401)
    }
    const { albumId } = req.params
    const { coverArtFileName } = req.body
    try {
      const album = await Album.findById(albumId)
      if (!album) {
        throw new CustomError('Album not found', 404)
      }

      const coverKey = `albums/${albumId}/${coverArtFileName}`
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
    } catch (error) {
      next(error)
    }
  }
)
// Confirm cover art update upload
router.put(
  '/album/:albumId/cover/confirm',
  authenticate,
  body('coverKey')
    .isString()
    .withMessage('Cover key must be a string')
    .notEmpty()
    .withMessage('Cover key cannot be empty'),
  validateRequest,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { albumId } = req.params
    const { coverKey } = req.body
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }
      const album = await Album.findById(albumId)
      if (!album) {
        throw new CustomError('Album not found', 404)
      }

      // Check if file exists in R2
      const headCommand = new HeadObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: coverKey,
      })

      try {
        // File exists, update album with cover key
        await r2Client.send(headCommand)
        // Delete the previous cover file if it exists
        if (album.coverUrl) {
          const previousCoverKey = extractKeyFromR2Url(
            album.coverUrl,
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
        album.coverUrl = `https://${process.env.R2_CUSTOM_DOMAIN}/${coverKey}`
        await album.save()
      } catch (error: any) {
        if (error.name === 'NotFound') {
          throw new CustomError('Cover art file not found in storage', 404)
        }
        throw error
      }

      await SongEventPublisher.AlbumUpdatedEvent({
        albumId,
        coverUrl: album.coverUrl,
        updatedFields: ['coverUrl'],
      })

      res.json({
        message: 'Cover art updated successfully',
        coverUrl: album.coverUrl,
      })
    } catch (error) {
      next(error)
    }
  }
)

// Single Song routes
router.put(
  '/single/:songId/metadata',
  authenticate,
  singleMetadataValidators,
  validateRequest,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }
      const { songId } = req.params
      const { name, tags, genre, collaborators, visibility } = req.body
      const song = await Song.findById(songId)
      if (!song) {
        throw new CustomError('Song not found', 404)
      }

      if (name) song.metadata.title = name
      if (tags) song.metadata.tags = tags
      if (genre) song.metadata.genre = genre
      if (collaborators) {
        const collaboratorUsers = await User.find({
          email: { $in: collaborators },
        }).select('_id')
        song.metadata.collaborators = collaboratorUsers.map((user) => user._id)
      }
      if (visibility) song.visibility = visibility
      await song.save()

      await SongEventPublisher.SongUpdatedEvent({
        songId,
        metadata: {
          title: song.metadata.title,
          artist: song.metadata.artist,
          collaborators: song.metadata.collaborators,
          album: song.metadata.album,
          genre: song.metadata.genre,
          tags: song.metadata.tags,
        },
        updatedFields: ['metadata'],
      })
      res.json(song)
    } catch (error: any) {
      next(error)
    }
  }
)

router.put(
  '/single/:songId/audio/presign',
  authenticate,
  body('audioFileName')
    .notEmpty()
    .isString()
    .withMessage('Audio file name is required'),
  validateRequest,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }
      const { songId } = req.params
      const { audioFileName } = req.body

      const song = await Song.findById(songId)
      if (!song) {
        throw new CustomError('Song not found', 404)
      }

      const songKey = `songs/${songId}/${audioFileName}`
      const command = new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: songKey,
        ContentType: 'audio/mpeg',
      })
      const presignedUrl = await getSignedUrl(r2Client, command, {
        expiresIn: 3600,
      })
      res.json({ presignedUrl, songKey })
    } catch (error: any) {
      next(error)
    }
  }
)

router.put(
  '/single/:songId/audio/confirm',
  authenticate,
  body('songKey').notEmpty().isString().withMessage('songKey is required'),
  validateRequest,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }
      const { songId } = req.params
      const { songKey } = req.body

      const song = await Song.findById(songId)
      if (!song) {
        throw new CustomError('Song not found', 404)
      }
      try {
        // Check if file exists in R2
        await r2Client.send(
          new HeadObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: songKey,
          })
        )
        //delete the previous audio file and corresponding hls files if it exists
        if (song.originalUrl) {
          const previousSongKey = extractKeyFromR2Url(
            song.originalUrl,
            process.env.R2_CUSTOM_DOMAIN!
          )
          try {
            await r2Client.send(
              new DeleteObjectCommand({
                Bucket: process.env.R2_BUCKET_NAME,
                Key: previousSongKey,
              })
            )
            await r2Client.send(
              new DeleteObjectCommand({
                Bucket: process.env.R2_BUCKET_NAME,
                Key: `songs/${songId}/hls/`,
              })
            )
          } catch (error) {
            console.error('Error deleting previous song audio:', error)
          }
        }
        const newOriginalUrl = `https://${process.env.R2_CUSTOM_DOMAIN}/${songKey}`
        song.originalUrl = newOriginalUrl
        song.status = StatusEnum.UPLOADED
        await song.save()

        const job = {
          songId,
          inputUrl: newOriginalUrl,
          inputKey: songKey,
          outputKey: `songs/${songId}/hls/`,
          timestamp: new Date().toISOString(),
        }

        channel.sendToQueue(
          'audio-conversion',
          Buffer.from(JSON.stringify(job)),
          {
            persistent: true,
          }
        )
      } catch (error: any) {
        if (error.name === 'NotFound') {
          throw new CustomError('Audio file not found in storage', 404)
        }
        throw error
      }
      // Publish song updated event
      await SongEventPublisher.SongUpdatedEvent({
        songId,
        newOriginalUrl: song.originalUrl,
        newStatus: StatusEnum.UPLOADED,
        updatedFields: ['originalUrl', 'status'],
      })
      res.json({
        message: 'Audio updated successfully',
        originalUrl: song.originalUrl,
      })
    } catch (error: any) {
      next(error)
    }
  }
)

router.put(
  '/single/:songId/cover/presign',
  authenticate,
  coverArtValidators,
  validateRequest,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }
      const { songId } = req.params
      const { coverArtFileName } = req.body

      const song = await Song.findById(songId)
      if (!song) {
        return res.status(404).json({ message: 'Song not found' })
      }

      if (song.metadata.album) {
        return res.status(400).json({
          message: 'Cannot change cover art of a song that belongs to an album',
        })
      }

      const coverKey = `songs/${songId}/${coverArtFileName}`
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

      song.coverArtUrl = coverKey
      await song.save()

      res.json({ presignedUrl, coverKey })
    } catch (error: any) {
      next(error)
    }
  }
)

router.put(
  '/single/:songId/cover/confirm',
  authenticate,
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
      const { songId } = req.params
      const { coverKey } = req.body

      const song = await Song.findById(songId)
      if (!song) {
        return res.status(404).json({ message: 'Song not found' })
      }

      // Check if file exists in R2
      const headCommand = new HeadObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: coverKey,
      })

      try {
        // File exists, update song with cover key
        await r2Client.send(headCommand)
        // Delete the previous cover file if it exists
        if (song.coverArtUrl) {
          const previousCoverKey = extractKeyFromR2Url(
            song.coverArtUrl,
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
        song.coverArtUrl = `https://${process.env.R2_CUSTOM_DOMAIN}/${coverKey}`
        await song.save()
      } catch (error: any) {
        if (error.name === 'NotFound') {
          throw new CustomError('Cover art file not found in storage', 404)
        }
        throw error
      }
      await SongEventPublisher.SongUpdatedEvent({
        songId,
        newCoverUrl: song.coverArtUrl,
        updatedFields: ['coverArtUrl'],
      })
      res.json({
        message: 'Cover art updated successfully',
        coverArtUrl: song.coverArtUrl,
      })
    } catch (error) {
      next(error)
    }
  }
)

export { router as updateRouter }
