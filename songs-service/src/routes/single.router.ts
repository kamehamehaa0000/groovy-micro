import {
  AuthenticatedRequest,
  CustomError,
  requireAuth,
  validateRequest,
  channel,
} from '@groovy-streaming/common'
import { NextFunction, Router, Response } from 'express'
import {
  singleSongUploadConfirmationBodyValidator,
  singleSongUploadValidator,
} from './validators/single-upload-validator'
import { createSong } from '../controllers/songsController'
import { Song, StatusEnum } from '../models/Song.model'
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3'
import { r2Client } from '../config/cloudflareR2'
import { SongEventPublisher } from '../events/song-event-publisher'
import { Album } from '../models/Album.model'
import User from '../models/User.model'

const router = Router()
const retrySendingConversionJobs = []

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

      await Song.create({
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

      // Publish song created event
      await SongEventPublisher.SongCreatedEvent({
        songId: songId,
        originalUrl: originalUrl,
        coverArtUrl: coverArtUrl,
        status: StatusEnum.UPLOADED,
        metadata: {
          title: songName,
          artist: userId,
          collaborators: collaboratorIds ?? [],
          album: '',
          genre: genre ?? '',
          tags: tags ?? [],
        },
        visibility: visibility ?? 'public',
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
      await SongEventPublisher.SongDeletedEvent(songId)
      res.json({
        message: 'Song deleted successfully',
        songId,
      })
    } catch (error) {
      next(error)
    }
  }
)

export { router as singleRouter }
