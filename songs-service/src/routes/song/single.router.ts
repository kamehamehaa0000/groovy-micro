import {
  AuthenticatedRequest,
  CustomError,
  requireAuth,
  validateRequest,
  channel,
  authenticate,
} from '@groovy-streaming/common'
import { NextFunction, Router, Response } from 'express'
import {
  singleSongUploadConfirmationBodyValidator,
  singleSongUploadValidator,
} from '../validators/single-upload-validator'
import { createSong } from '../../controllers/songsController'
import { Song, StatusEnum } from '../../models/Song.model'
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import { r2Client } from '../../config/cloudflareR2'
import { SongServiceEventPublisher } from '../../events/song-event-publisher'
import { Album } from '../../models/Album.model'
import User from '../../models/User.model'
import { body } from 'express-validator'
import { extractKeyFromR2Url } from '../../utils/extractKeyFromUrl'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const router = Router()
const retrySendingConversionJobs = []

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

router.get('/', (req: AuthenticatedRequest, res: Response) => {
  res.json({ message: 'Single song routes' })
})

// "/upload/presigned" endpoint to get presigned URLs for single song upload
router.post(
  '/upload/presign',
  requireAuth,
  singleSongUploadValidator,
  validateRequest,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id
      if (!userId) {
        throw new CustomError('User not authenticated', 401)
      }
      const { filename, coverArtFileName } = req.body

      const {
        presignedSongUrl,
        presignedCoverUrl,
        songUploadKey,
        coverUploadKey,
        songId,
      } = await createSong(filename, coverArtFileName)

      res.json({
        songId,
        presignedSongUrl,
        presignedCoverUrl,
        songUploadKey,
        coverUploadKey,
        message: 'Presigned URL generated successfully',
      })
    } catch (error) {
      next(error)
    }
  }
)

// "/upload/confirm/single" endpoint to confirm single song upload
router.post(
  '/upload/confirm',
  requireAuth,
  singleSongUploadConfirmationBodyValidator,
  validateRequest,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id
      if (!userId) {
        throw new CustomError('User not authenticated', 401)
      }
      const {
        songId,
        songUploadKey,
        coverUploadKey,
        collaborators,
        genre,
        tags,
        visibility,
        songName,
      } = req.body

      const songFileExists = await r2Client.send(
        new GetObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: songUploadKey,
        })
      )
      const coverFileExists = await r2Client.send(
        new GetObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: coverUploadKey,
        })
      )
      if (!songFileExists || !coverFileExists) {
        throw new CustomError('Uploaded files not found..retry the upload', 404)
      }
      const originalUrl = `https://${process.env.R2_BUCKET_NAME}.r2.cloudflarestorage.com/${songUploadKey}`
      const coverArtUrl = `https://${process.env.R2_BUCKET_NAME}.r2.cloudflarestorage.com/${coverUploadKey}`

      let collaboratorIds: string[] = []
      if (collaborators && collaborators.length > 0) {
        const collaboratorUsers = await User.find({
          email: { $in: collaborators },
        }).select('_id')
        if (collaboratorUsers.length !== collaborators.length) {
          throw new CustomError(
            'Some collaborators not found. Please check the emails.',
            404
          )
        }
        collaboratorIds = collaboratorUsers.map((user) => user._id)
      }

      const song = await Song.create({
        _id: songId,
        originalUrl: originalUrl,
        coverArtUrl: coverArtUrl,
        status: StatusEnum.UPLOADED,
        metadata: {
          title: songName,
          artist: userId,
          collaborators: collaboratorIds,
          album: '',
          genre: genre ?? '',
          tags: tags ?? [],
          likedBy: [],
        },
        visibility: visibility,
      })

      //send job for hls conversion
      const job = {
        songId,
        inputUrl: originalUrl,
        inputKey: songUploadKey,
        outputKey: `songs/${songId}/hls/`,
        timestamp: new Date().toISOString(),
      }

      const sent = channel.sendToQueue(
        'audio-conversion',
        Buffer.from(JSON.stringify(job)),
        {
          persistent: true,
        }
      )
      if (!sent) {
        retrySendingConversionJobs.push(job)
        //TODO: Implement retry logic for failed jobs
      }

      await SongServiceEventPublisher.SongCreatedEvent({
        songId: song._id,
        originalUrl: song.originalUrl,
        coverArtUrl: song.coverArtUrl,
        status: song.status,
        metadata: song.metadata,
        visibility: song.visibility,
      })

      res.json({
        message: 'Upload confirmed and conversion job queued',
        songId,
        status: StatusEnum.UPLOADED,
      })
    } catch (error) {
      next(error)
    }
  }
)

// DELETE "/delete/:songId" endpoint to delete a single song upload
router.delete(
  '/delete/:songId',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { songId } = req.params
      if (!songId) {
        throw new CustomError('Song ID is required', 400)
      }

      // Check if the song exists
      const song = await Song.findById(songId)
      if (!song) {
        throw new CustomError('Song not found', 404, 'Song does not exist.')
      }

      // delete song from cloudflare R2
      const songFolderPrefix = `songs/${songId}/`
      const listObjectsResponse = await r2Client.send(
        new ListObjectsV2Command({
          Bucket: process.env.R2_BUCKET_NAME,
          Prefix: songFolderPrefix,
        })
      )
      if (listObjectsResponse.Contents?.length) {
        await r2Client.send(
          new DeleteObjectsCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Delete: {
              Objects: listObjectsResponse.Contents.map((obj) => ({
                Key: obj.Key,
              })),
            },
          })
        )
      }

      //remove song from album's songs array
      if (song.metadata?.album) {
        await Album.updateOne(
          { _id: song.metadata?.album },
          { $pull: { songs: songId } }
        )
      }
      // Delete the song
      await Song.deleteOne({ _id: songId })

      // Publish song deleted event
      try {
        await SongServiceEventPublisher.SongDeletedEvent({ songId })
      } catch (error) {
        console.error('Error publishing song deleted event:', error)
        // TODO:RETRY LOGIC
      }
      res.json({
        message: 'Song deleted successfully',
        songId,
      })
    } catch (error) {
      next(error)
    }
  }
)

// single song metadata update
router.put(
  '/update/metadata/song/:songId',
  requireAuth,
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

      await SongServiceEventPublisher.SongUpdatedEvent({
        songId: song._id,
        coverArtUrl: song.coverArtUrl,
        originalUrl: song.originalUrl,
        hlsUrl: song.hlsUrl,
        status: song.status,
        metadata: song.metadata,
        visibility: song.visibility,
      })
      res.json(song)
    } catch (error: any) {
      next(error)
    }
  }
)
// single song audio upload presign
router.put(
  '/update/audio/presign/song/:songId',
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
// Confirm single song audio upload
router.put(
  '/update/audio/confirm/song/:songId',
  requireAuth,
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
      await SongServiceEventPublisher.SongUpdatedEvent({
        songId: song._id,
        coverArtUrl: song.coverArtUrl,
        originalUrl: song.originalUrl,
        hlsUrl: song.hlsUrl,
        status: song.status,
        metadata: song.metadata,
        visibility: song.visibility,
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
// single song cover art upload presign
router.put(
  '/update/cover/presign/song/:songId',
  requireAuth,
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

      res.json({ presignedUrl, coverKey })
    } catch (error: any) {
      next(error)
    }
  }
)
// Confirm single song cover art upload
router.put(
  '/update/cover/confirm/song/:songId',
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
      await SongServiceEventPublisher.SongUpdatedEvent({
        songId: song._id,
        coverArtUrl: song.coverArtUrl,
        originalUrl: song.originalUrl,
        hlsUrl: song.hlsUrl,
        status: song.status,
        metadata: song.metadata,
        visibility: song.visibility,
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

// toggle like on a song
router.post(
  '/like/:songId',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }
      const { songId } = req.params
      const song = await Song.findById(songId)
      if (!song) {
        throw new CustomError('Song not found', 404)
      }
      const isLiked = song.likedBy.includes(user._id)
      const updateOperation = isLiked
        ? { $pull: { likedBy: user.id } }
        : { $addToSet: { likedBy: user.id } }

      const updatedSong = await Song.findByIdAndUpdate(
        songId,
        updateOperation,
        {
          new: true,
        }
      )
      if (!updatedSong) {
        throw new CustomError('Failed to update song likes', 500)
      }
      await SongServiceEventPublisher.SongUpdatedEvent({
        songId: updatedSong._id,
        coverArtUrl: updatedSong.coverArtUrl,
        originalUrl: updatedSong.originalUrl,
        hlsUrl: updatedSong.hlsUrl,
        status: updatedSong.status,
        metadata: updatedSong.metadata,
        visibility: updatedSong.visibility,
      })

      res.json({
        message: isLiked ? 'Song unliked' : 'Song liked',
        isLikedByCurrentUser: !isLiked,
        likeCount: updatedSong.likedBy.length,
      })
    } catch (error) {
      next(error)
    }
  }
)
export { router as singleRouter }
