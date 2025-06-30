import {
  AuthenticatedRequest,
  CustomError,
  requireAuth,
  validateRequest,
} from '@groovy-streaming/common'
import { NextFunction, Router, Response } from 'express'
import {
  singleSongUploadConfirmationBodyValidator,
  singleSongUploadValidator,
} from './validators/single-upload-validator'
import { createSong } from '../controllers/songsController'
import { Song, StatusEnum } from '../models/Song.model'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import r2Client from '../config/cloudflareR2'
import { channel } from '../config/cloudAMQP'
import { SongEventPublisher } from '../events/song-event-publisher'

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

      await Song.create({
        _id: songId,
        originalUrl: originalUrl,
        coverArtUrl: coverArtUrl,
        status: StatusEnum.UPLOADED,
        metadata: {
          title: songName,
          artist: userId,
          collaborators: collaborators ?? [],
          album: '',
          genre: genre ?? '',
          tags: tags ?? [],
        },
        visibility: visibility ?? 'public',
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
      await SongEventPublisher.SongCreatedEvent(
        songId,
        originalUrl,
        coverArtUrl,
        StatusEnum.UPLOADED,
        {
          title: songName,
          artist: userId,
          collaborators: collaborators ?? [],
          album: '',
          genre: genre ?? '',
          tags: tags ?? [],
        },
        visibility ?? 'public'
      )

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

export { router as singleRouter }
