import {
  CustomError,
  validateRequest,
  AuthenticatedRequest,
  requireAuth,
  channel,
} from '@groovy-streaming/common'
import { NextFunction, Response, Router } from 'express'
import { Song, StatusEnum } from '../models/Song.model'
import {
  albumConfirmationValidator,
  albumPresignedUrlValidator,
} from './validators/album-upload-validators'
import { v4 as uuidv4 } from 'uuid'
import { Album } from '../models/Album.model'
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { r2Client } from '../config/cloudflareR2'
import { SongEventPublisher } from '../events/song-event-publisher'

const router = Router()
router.get('/', (req: AuthenticatedRequest, res: Response) => {
  res.json({ message: 'Album routes' })
})

// POST: upload/presign
router.post(
  '/upload/presign',
  requireAuth,
  albumPresignedUrlValidator,
  validateRequest,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id
      if (!userId) {
        throw new CustomError('User not authenticated', 401)
      }

      const { coverFilename, tracks } = req.body

      const albumId = uuidv4()

      // Generate cover art presigned URL (stored in albums/{albumId}/ folder)
      const coverKey = `albums/${albumId}/${coverFilename}`
      const coverCommand = new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: coverKey,
        ContentType: coverFilename.endsWith('.jpg')
          ? 'image/jpeg'
          : 'image/png',
      })

      const presignedCoverUrl = await getSignedUrl(r2Client, coverCommand, {
        expiresIn: 3600,
      })

      // Generate presigned URLs for each track (stored in songs/{songId}/ folder)
      const trackPresignedUrls = await Promise.all(
        tracks.map(async (track: any) => {
          const songId = uuidv4()
          const songKey = `songs/${songId}/${track.filename}`

          const songCommand = new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: songKey,
            ContentType: 'audio/mpeg',
          })

          const presignedSongUrl = await getSignedUrl(r2Client, songCommand, {
            expiresIn: 3600,
          })

          return {
            songId,
            presignedSongUrl,
            songUploadKey: songKey,
            trackNumber: track.trackNumber,
            songName: track.songName,
          }
        })
      )

      res.json({
        albumId,
        presignedCoverUrl,
        coverUploadKey: coverKey,
        trackPresignedUrls,
        message: 'Presigned URLs generated successfully',
      })
    } catch (error) {
      next(error)
    }
  }
)

// POST: upload/confirm
router.post(
  '/upload/confirm',
  requireAuth,
  albumConfirmationValidator,
  validateRequest,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id
      if (!userId) {
        throw new CustomError('User not authenticated', 401)
      }

      const {
        albumId,
        albumName,
        genre,
        tags,
        visibility,
        collaborators,
        tracksData,
        coverUploadKey,
      } = req.body

      // Verify cover art file exists
      try {
        await r2Client.send(
          new GetObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: coverUploadKey,
          })
        )
      } catch (error) {
        console.error('Error verifying cover art file:', error)
        throw new CustomError(
          'Cover art file not found. Please retry the upload',
          404
        )
      }

      // Verify all track files exist
      for (const track of tracksData) {
        try {
          await r2Client.send(
            new GetObjectCommand({
              Bucket: process.env.R2_BUCKET_NAME,
              Key: track.songUploadKey,
            })
          )
        } catch (error) {
          console.error(
            `Error verifying track file for song ${track.songId}:`,
            error
          )
          throw new CustomError(
            `Track file not found for song ${track.songId}. Please retry the upload`,
            404
          )
        }
      }

      const coverArtUrl = `https://${process.env.R2_BUCKET_NAME}.r2.cloudflarestorage.com/${coverUploadKey}`
      const songIds: string[] = []

      // Create song entries for each track
      const songCreationPromises = tracksData.map(
        async (track: any, index: number) => {
          const originalUrl = `https://${process.env.R2_BUCKET_NAME}.r2.cloudflarestorage.com/${track.songUploadKey}`

          const song = new Song({
            _id: track.songId,
            originalUrl,
            coverArtUrl,
            status: StatusEnum.UPLOADED,
            metadata: {
              title: track.songName ?? `Track ${index + 1}`,
              artist: userId,
              collaborators: track.collaborators ?? [],
              album: albumId,
              genre: track.genre ?? genre,
              trackNumber: track.trackNumber ?? index + 1,
              tags: track.tags ?? tags,
            },
            visibility,
          })

          await song.save()
          songIds.push(track.songId)

          // Queue HLS conversion job for each song
          const conversionJob = {
            songId: track.songId,
            inputUrl: originalUrl,
            inputKey: track.songUploadKey,
            outputKey: `songs/${track.songId}/hls/`,
            timestamp: new Date().toISOString(),
          }

          const sent = channel.sendToQueue(
            'audio-conversion',
            Buffer.from(JSON.stringify(conversionJob)),
            { persistent: true }
          )

          if (!sent) {
            console.error(
              `Failed to queue conversion job for song ${track.songId}`
            )
            // TODO: Implement retry logic for failed jobs
          }

          // Publish song created event
          await SongEventPublisher.SongCreatedEvent(
            track.songId,
            originalUrl,
            coverArtUrl,
            StatusEnum.UPLOADED,
            {
              title: track.songName,
              artist: userId,
              collaborators: track.collaborators ?? [],
              album: albumId,
              genre: track.genre ?? genre,
              tags: track.tags ?? tags,
            },
            visibility
          )

          return track.songId
        }
      )

      await Promise.all(songCreationPromises)

      // Create album entry
      const album = new Album({
        _id: albumId,
        title: albumName,
        artist: userId,
        coverUrl: coverArtUrl,
        genre,
        tags,
        collaborators: collaborators ?? [],
        songs: songIds,
      })

      await album.save()

      res.json({
        message: 'Album upload confirmed and conversion jobs queued',
        albumId,
        songIds,
        status: StatusEnum.UPLOADED,
      })
    } catch (error) {
      next(error)
    }
  }
)
export { router as AlbumRouter }
