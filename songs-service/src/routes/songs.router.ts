import {
  CustomError,
  validateRequest,
  AuthenticatedRequest,
  requireAuth,
} from '@groovy-streaming/common'
import { NextFunction, Response, Router } from 'express'
import { Song, StatusEnum } from '../models/Song.model'

import {
  singleSongUploadConfirmationBodyValidator,
  singleSongUploadValidator,
} from './validators/single-upload-validator'
import { channel } from '../config/cloudAMQP'
import {
  createCoverPresignedUrl,
  createSong,
  createSongWithoutCover,
} from '../controllers/songsController'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import r2Client from '../config/cloudflareR2'
import {
  albumConfirmUploadValidator,
  albumUploadValidator,
} from './validators/album-upload-validators'
import { v4 as uuidv4 } from 'uuid'
import { Album } from '../models/Album.model'

const router = Router()

// "/upload/presigned/single" endpoint to get presigned URLs for single song upload
router.post(
  '/upload/presigned/single',
  requireAuth,
  singleSongUploadValidator,
  validateRequest,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id
      if (!userId) {
        throw new CustomError('User not authenticated', 401)
      }
      const {
        filename,
        collaborators,
        coverArtFileName,
        genre,
        tags,
        visibility,
        songName,
      } = req.body

      const {
        presignedSongUrl,
        presignedCoverUrl,
        songUploadKey,
        coverUploadKey,
        songId,
      } = await createSong(userId, filename, coverArtFileName, visibility, {
        title: songName,
        artist: userId,
        collaborators: collaborators ?? [],
        album: '',
        genre: genre ?? '',
        tags: tags ?? [],
      })

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
  '/upload/confirm/single',
  requireAuth,
  singleSongUploadConfirmationBodyValidator,
  validateRequest,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id
      if (!userId) {
        throw new CustomError('User not authenticated', 401)
      }
      const { songId, songUploadKey, coverUploadKey } = req.body

      const song = await Song.findById(songId)
      if (!song) {
        throw new CustomError('Song not found', 404)
      }

      const originalUrl = `https://${process.env.R2_BUCKET_NAME}.r2.cloudflarestorage.com/${songUploadKey}`
      const coverArtUrl = `https://${process.env.R2_BUCKET_NAME}.r2.cloudflarestorage.com/${coverUploadKey}`

      const commandToCheckUploadedSongFile = new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: songUploadKey,
      })

      const commandToCheckUploadedCoverFile = new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: coverUploadKey,
      })

      // You need to import and use the S3 client to execute these commands
      // Example:
      const songFileExists = await r2Client.send(commandToCheckUploadedSongFile)
      const coverFileExists = await r2Client.send(
        commandToCheckUploadedCoverFile
      )
      if (!songFileExists || !coverFileExists) {
        throw new CustomError('Uploaded files not found', 404)
      }
      song.originalUrl = originalUrl
      song.coverArtUrl = coverArtUrl
      song.status = StatusEnum.UPLOADED
      await song.save()

      //send job for hls conversion
      const job = {
        songId,
        inputUrl: originalUrl,
        inputKey: songUploadKey,
        outputKey: `songs/${songId}/hls/`,
        timestamp: new Date().toISOString(),
      }

      //TODO: add a retry mechanism later
      channel.sendToQueue(
        'audio-conversion',
        Buffer.from(JSON.stringify(job)),
        {
          persistent: true,
        }
      )

      //TODO: publish to other services.
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

// "/upload/presigned/album" endpoint to get presigned URLs for album upload
router.post(
  '/upload/presigned/album',
  requireAuth,
  albumUploadValidator,
  validateRequest,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id
      if (!userId) {
        throw new CustomError('User not authenticated', 401)
      }
      const { tracks, coverFilename, visibility } = req.body

      const albumId = uuidv4()
      //create this album entry in the database on confirm route
      // const album = new Album({
      //   _id: albumId,
      //   title: albumName,
      //   coverUrl: '',
      //   artist: userId,
      //   genre: genre ?? '',
      //   tags: tags ?? [],
      //   collaborators: collaborators ?? [],
      //   visibility: visibility ?? 'public',
      // })

      const trackPresignedUrls: {
        songId: string
        presignedSongUrl: string
        songUploadKey: string
      }[] = []
      await Promise.all(
        tracks.map(
          async (track: {
            filename: string
            songName: string
            trackNumber: number
            genre: string
            tags: string[]
            collaborators: string[]
          }) => {
            const { presignedSongUrl, songUploadKey, songId } =
              await createSongWithoutCover(userId, track.filename, visibility, {
                title: track.songName,
                trackNumber: track.trackNumber,
                album: albumId,
                artist: userId,
                genre: track.genre,
                tags: track.tags,
                collaborators: track.collaborators,
              })
            trackPresignedUrls.push({
              songId,
              presignedSongUrl,
              songUploadKey,
            })
          }
        )
      )

      console.log('Track presigned URLs:', trackPresignedUrls)

      const { presignedCoverUrl, coverUploadKey } =
        await createCoverPresignedUrl(coverFilename, false, albumId)

      res.json({
        albumId,
        presignedCoverUrl,
        coverUploadKey,
        trackPresignedUrls,
        message: 'Presigned URLs for album tracks generated successfully',
      })
    } catch (error) {
      next(error)
    }
  }
)

router.post(
  '/upload/confirm/album',
  requireAuth,
  albumConfirmUploadValidator,
  validateRequest,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id
      if (!userId) {
        throw new CustomError('User not authenticated', 401)
      }

      const {
        albumId,
        coverUploadKey,
        tracksData,
        collaborators,
        genre,
        visibility,
        tags,
        albumName,
      } = req.body

      const coverUrl = `https://${process.env.R2_CUSTOM_DOMAIN}/${coverUploadKey}`
      // Confirm the album upload and create the album entry in the database
      const album = new Album({
        _id: albumId,
        title: albumName,
        genre: genre ?? '',
        tags: tags ?? [],
        collaborators: collaborators ?? [],
        visibility: visibility ?? 'public',
        coverUrl: coverUrl,
        artist: userId,
        songs: tracksData.map((track: { songId: string }) => track.songId),
      })

      await album.save()

      tracksData.forEach(
        async (element: { songId: string; songUploadKey: string }) => {
          // Update each song with the original URL and status
          const song = await Song.findById(element.songId)
          if (song) {
            song.originalUrl = `https://${process.env.R2_CUSTOM_DOMAIN}/${element.songUploadKey}`
            song.status = StatusEnum.UPLOADED
            song.coverArtUrl = coverUrl //  cover is the same for all songs in the album
            await song.save()
          }
        }
      )
      //TODO: send job for hls conversion for each song
      res.json({
        message: 'Album upload confirmed',
        albumId,
      })
    } catch (error) {
      next(error)
    }
  }
)
export { router as SongRouter }
