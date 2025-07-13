import {
  CustomError,
  validateRequest,
  AuthenticatedRequest,
  requireAuth,
  channel,
} from '@groovy-streaming/common'
import { NextFunction, Response, Router } from 'express'
import { Song, StatusEnum } from '../../models/Song.model'
import {
  albumConfirmationValidator,
  albumPresignedUrlValidator,
} from '../validators/album-upload-validators'
import { v4 as uuidv4 } from 'uuid'
import { Album } from '../../models/Album.model'
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { r2Client } from '../../config/cloudflareR2'
import { SongServiceEventPublisher } from '../../events/song-event-publisher'
import User from '../../models/User.model'
import { extractKeyFromR2Url } from '../../utils/extractKeyFromUrl'
import { body } from 'express-validator'

const router = Router()
router.get('/', (req: AuthenticatedRequest, res: Response) => {
  res.json({ message: 'Album routes' })
})
const albumMetadataValidators = [
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

          let trackCollaboratorIds: string[] = []
          if (track.collaborators && track.collaborators.length > 0) {
            const collaboratorUsers = await User.find({
              email: { $in: track.collaborators },
            }).select('_id')
            trackCollaboratorIds = collaboratorUsers.map((user) => user._id)
          }

          const song = new Song({
            _id: track.songId,
            originalUrl,
            coverArtUrl,
            status: StatusEnum.UPLOADED,
            metadata: {
              title: track.songName ?? `Track ${index + 1}`,
              artist: userId,
              collaborators: trackCollaboratorIds,
              album: albumId,
              genre: track.genre ?? genre,
              trackNumber: track.trackNumber ?? index + 1,
              tags: track.tags ?? tags,
              likedBy: [],
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
          await SongServiceEventPublisher.SongCreatedEvent({
            songId: song._id,
            originalUrl: song.originalUrl,
            coverArtUrl: song.coverArtUrl,
            status: song.status,
            metadata: song.metadata,
            visibility: song.visibility,
          })

          return track.songId
        }
      )

      await Promise.all(songCreationPromises)

      // Collect all collaborator IDs for the album
      let albumCollaboratorIds: string[] = []
      if (collaborators && collaborators.length > 0) {
        const collaboratorUsers = await User.find({
          email: { $in: collaborators },
        }).select('_id')
        albumCollaboratorIds = collaboratorUsers.map((user) => user._id)
      }
      // Create album entry
      const album = new Album({
        _id: albumId,
        title: albumName,
        artist: userId,
        coverUrl: coverArtUrl,
        genre,
        tags,
        collaborators: albumCollaboratorIds ?? [],
        songs: songIds,
        visibility: visibility,
        likedBy: [],
      })

      await album.save()

      // Publish album created event
      await SongServiceEventPublisher.AlbumCreatedEvent({
        albumId: album._id,
        title: album.title,
        artist: album.artist,
        coverUrl: album.coverUrl!,
        genre: album.genre!,
        tags: album.tags!,
        collaborators: album.collaborators,
        songs: album.songs,
        visibility: album.visibility,
        likedBy: album.likedBy,
      })

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

// delete album and all associated songs
router.delete(
  '/delete/:albumId',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { albumId } = req.params
      const userId = req.user?.id
      if (!userId) throw new CustomError('User not authenticated', 401)
      if (!albumId) throw new CustomError('Album ID is required', 400)

      const album = await Album.findById(albumId)
      if (!album) throw new CustomError('Album not found', 404)

      if (album.artist.toString() !== userId) {
        throw new CustomError('Unauthorized: You do not own this album', 403)
      }

      // --- R2 Cleanup ---

      // 1. Delete all song folders associated with the album
      for (const songId of album.songs) {
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
      }

      // 2. Delete the album cover art folder
      const albumFolderPrefix = `albums/${albumId}/`
      const listAlbumObjectsResponse = await r2Client.send(
        new ListObjectsV2Command({
          Bucket: process.env.R2_BUCKET_NAME,
          Prefix: albumFolderPrefix,
        })
      )

      if (listAlbumObjectsResponse.Contents?.length) {
        await r2Client.send(
          new DeleteObjectsCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Delete: {
              Objects: listAlbumObjectsResponse.Contents.map((obj) => ({
                Key: obj.Key,
              })),
            },
          })
        )
      }

      // Delete all song documents in the album
      await Song.deleteMany({ _id: { $in: album.songs } })

      // Delete the album document
      await Album.deleteOne({ _id: albumId })

      // Publish album deleted event
      await SongServiceEventPublisher.AlbumDeletedEvent({ albumId })

      res.json({
        message: 'Album and all associated songs deleted successfully',
        albumId,
      })
    } catch (error) {
      console.error(`Failed to delete album ${req.params.albumId}:`, error)
      next(error)
    }
  }
)

// Album routes - to update non-file fields
router.put(
  '/update/metadata/album/:albumId',
  requireAuth,
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

      await SongServiceEventPublisher.AlbumUpdatedEvent({
        albumId: album._id,
        title: album.title,
        artist: album.artist,
        coverUrl: album.coverUrl!,
        genre: album.genre!,
        tags: album.tags!,
        collaborators: album.collaborators,
        songs: album.songs,
        visibility: album.visibility,
        likedBy: album.likedBy,
      })
      res.json(album)
    } catch (error) {
      next(error)
    }
  }
)

// presign covert art update
router.post(
  '/update/cover/presign/album/:albumId',
  requireAuth,
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
  '/update/cover/confirm/album/:albumId',
  requireAuth,
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

      await SongServiceEventPublisher.AlbumUpdatedEvent({
        albumId: album._id,
        coverUrl: album.coverUrl,
        title: album.title,
        artist: album.artist,
        collaborators: album.collaborators,
        genre: album.genre,
        tags: album.tags,
        visibility: album.visibility,
        songs: album.songs,
        likedBy: album.likedBy,
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

// Toggle like status for an album
router.put(
  '/like/:albumId',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }
      const { albumId } = req.params
      if (!albumId) {
        throw new CustomError('Album ID is required', 400)
      }

      // Check if user already liked the album
      const album = await Album.findById(albumId)
      if (!album) {
        throw new CustomError('Album not found', 404)
      }

      const userLikedAlbum = album.likedBy.includes(user.id)

      const updateOperation = userLikedAlbum
        ? { $pull: { likedBy: user.id } }
        : { $addToSet: { likedBy: user.id } }

      const updatedAlbum = await Album.findByIdAndUpdate(
        albumId,
        updateOperation,
        { new: true }
      )

      if (!updatedAlbum) {
        throw new CustomError('Album not found', 404)
      }

      // Publish album updated event
      await SongServiceEventPublisher.AlbumUpdatedEvent({
        albumId: updatedAlbum._id,
        title: updatedAlbum.title,
        artist: updatedAlbum.artist,
        coverUrl: updatedAlbum.coverUrl!,
        genre: updatedAlbum.genre!,
        tags: updatedAlbum.tags!,
        collaborators: updatedAlbum.collaborators,
        songs: updatedAlbum.songs,
        visibility: updatedAlbum.visibility,
        likedBy: updatedAlbum.likedBy,
      })

      res.json({
        message: userLikedAlbum
          ? 'Album unliked successfully'
          : 'Album liked successfully',
        albumId,
        isLikedByCurrentUser: !userLikedAlbum,
        likeCount: updatedAlbum.likedBy.length,
      })
    } catch (error) {
      next(error)
    }
  }
)
export { router as AlbumRouter }
