import type { FastifyPluginAsync } from 'fastify'
import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { artistProfiles, playlists } from '../../db/schema'
import { StorageService } from './storage.service'
import { requireAuth } from '../auth'
import type { UploadCategory } from './storage.presets'
import {
  presignedUrlSchema,
  batchPresignedUrlsSchema,
  bulkImportReleaseSchema,
} from './storage.schemas'

export const storageRoutes: FastifyPluginAsync = async (fastify) => {
  const storageService = new StorageService()

  /**
   * GET /locker-quota
   * Returns current personal locker usage and tier limits.
   */

  fastify.get(
    '/personal-collection/quota',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const quota = await storageService.getLockerQuota(request.user.id)
      return reply.status(200).send({ quota })
    },
  )

  /**
   * GET /locker/releases & GET /personal-collection/releases
   * Returns all personal releases and tracks stored in the user's personal collection.
   */
  fastify.get(
    '/locker/releases',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const releases = await storageService.getUserLockerReleases(
        request.user.id,
      )
      return reply.status(200).send({ releases })
    },
  )

  fastify.get(
    '/personal-collection/releases',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const releases = await storageService.getUserLockerReleases(
        request.user.id,
      )
      return reply.status(200).send({ releases })
    },
  )

  /**
   * DELETE /personal-collection/songs/:id & DELETE /locker/songs/:id
   * Removes a single personal track from the user's personal collection.
   */
  const handleDeletePersonalSong = async (request: any, reply: any) => {
    const { id } = request.params as { id: string }
    try {
      const result = await storageService.deletePersonalSong(
        request.user.id,
        id,
      )
      return reply.status(200).send(result)
    } catch (err: any) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: err.message || 'Failed to remove personal song',
      })
    }
  }

  fastify.delete(
    '/personal-collection/songs/:id',
    { preHandler: [requireAuth] },
    handleDeletePersonalSong,
  )

  fastify.delete(
    '/locker/songs/:id',
    { preHandler: [requireAuth] },
    handleDeletePersonalSong,
  )

  /**
   * DELETE /personal-collection/releases/:id & DELETE /locker/releases/:id
   * Removes an entire personal release and all its tracks.
   */
  const handleDeletePersonalRelease = async (request: any, reply: any) => {
    const { id } = request.params as { id: string }
    try {
      const result = await storageService.deletePersonalRelease(
        request.user.id,
        id,
      )
      return reply.status(200).send(result)
    } catch (err: any) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: err.message || 'Failed to remove personal release',
      })
    }
  }

  fastify.delete(
    '/personal-collection/releases/:id',
    { preHandler: [requireAuth] },
    handleDeletePersonalRelease,
  )

  fastify.delete(
    '/locker/releases/:id',
    { preHandler: [requireAuth] },
    handleDeletePersonalRelease,
  )

  /**
   * POST /batch-presigned-urls
   * Generates multiple presigned upload URLs for bulk locker imports with quota validation.
   */
  fastify.post(
    '/batch-presigned-urls',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parseResult = batchPresignedUrlsSchema.safeParse(request.body)
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Validation failed',
          errors: parseResult.error.flatten().fieldErrors,
        })
      }

      const { files } = parseResult.data
      const user = request.user

      // 1. Quota Check for raw audio files
      const audioFiles = files.filter((f) => f.category === 'SONG_AUDIO_RAW')
      if (audioFiles.length > 0) {
        const quota = await storageService.getLockerQuota(user.id)
        if (quota.usedSongs + audioFiles.length > quota.maxSongs) {
          return reply.status(403).send({
            statusCode: 403,
            error: 'Forbidden',
            message: `Upload limit exceeded. You have ${quota.remainingSongs} personal slots remaining out of ${quota.maxSongs}. Requested batch has ${audioFiles.length} audio file(s).`,
            quota,
          })
        }
      }

      // 2. Generate signed URLs concurrently
      try {
        const uploads = await Promise.all(
          files.map(async (file) => {
            const res = await storageService.generateUploadUrl({
              category: file.category as UploadCategory,
              ownerId: user.id,
              resourceId: file.resourceId,
              mimeType: file.mimeType,
              fileExtension: file.fileExtension,
              fileSizeBytes: file.fileSizeBytes,
            })
            return {
              clientFileId: file.clientFileId,
              category: file.category,
              ...res,
            }
          }),
        )

        return reply.status(200).send({ uploads })
      } catch (err: any) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: err.message || 'Failed to generate batch upload URLs',
        })
      }
    },
  )

  /**
   * POST /bulk-import-release
   * Clustered release importer: Creates sandboxed personal artist, album, tracks,
   * and dispatches transcoding outbox events.
   */
  fastify.post(
    '/bulk-import-release',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parseResult = bulkImportReleaseSchema.safeParse(request.body)
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Validation failed',
          errors: parseResult.error.flatten().fieldErrors,
        })
      }

      try {
        const result = await storageService.bulkImportPersonalRelease(
          request.user.id,
          parseResult.data,
        )
        return reply.status(201).send(result)
      } catch (err: any) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: err.message || 'Bulk import failed',
        })
      }
    },
  )

  /**
   * POST /presigned-url
   * Generates a single pre-signed PUT upload URL with domain authorization checks.
   */
  fastify.post(
    '/presigned-url',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parseResult = presignedUrlSchema.safeParse(request.body)
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Validation failed',
          errors: parseResult.error.flatten().fieldErrors,
        })
      }

      const { category, resourceId, mimeType, fileExtension, fileSizeBytes } =
        parseResult.data
      const user = request.user

      // Domain-specific authorization rules
      switch (category as UploadCategory) {
        case 'USER_AVATAR':
          if (resourceId !== user.id) {
            return reply.status(403).send({
              statusCode: 403,
              error: 'Forbidden',
              message:
                'You can only upload an avatar for your own user account',
            })
          }
          break

        case 'ARTIST_BANNER':
        case 'ARTIST_VERIFICATION_DOC': {
          if (user.role !== 'ARTIST' && user.role !== 'ADMIN') {
            return reply.status(403).send({
              statusCode: 403,
              error: 'Forbidden',
              message: 'Artist privileges required for this upload type',
            })
          }

          if (user.role === 'ARTIST') {
            const [profile] = await db
              .select({ id: artistProfiles.id })
              .from(artistProfiles)
              .where(eq(artistProfiles.userId, user.id))
              .limit(1)

            if (!profile || profile.id !== resourceId) {
              return reply.status(403).send({
                statusCode: 403,
                error: 'Forbidden',
                message: 'You do not own this artist profile',
              })
            }
          }
          break
        }

        case 'ALBUM_COVER':
        case 'SONG_AUDIO_RAW': {
          // Both verified artists and standard users (via personal locker quota) are authorized
          if (user.role !== 'ARTIST' && user.role !== 'ADMIN') {
            if (category === 'SONG_AUDIO_RAW') {
              const quota = await storageService.getLockerQuota(user.id)
              if (quota.remainingSongs <= 0) {
                return reply.status(403).send({
                  statusCode: 403,
                  error: 'Forbidden',
                  message: `Upload quota exceeded. You have 0 personal slots remaining out of ${quota.maxSongs}.`,
                  quota,
                })
              }
            }
          }
          break
        }

        case 'SONG_LYRICS': {
          if (user.role !== 'ARTIST' && user.role !== 'ADMIN') {
            return reply.status(403).send({
              statusCode: 403,
              error: 'Forbidden',
              message:
                'Artist or Admin privileges required to upload catalog media',
            })
          }
          break
        }

        case 'PLAYLIST_COVER': {
          const [playlist] = await db
            .select({ ownerId: playlists.ownerId })
            .from(playlists)
            .where(eq(playlists.id, resourceId))
            .limit(1)

          if (!playlist || playlist.ownerId !== user.id) {
            return reply.status(403).send({
              statusCode: 403,
              error: 'Forbidden',
              message: 'You can only upload cover art for playlists you own',
            })
          }
          break
        }
      }

      try {
        const result = await storageService.generateUploadUrl({
          category: category as UploadCategory,
          ownerId: user.id,
          resourceId,
          mimeType,
          fileExtension,
          fileSizeBytes,
        })

        return reply.status(200).send(result)
      } catch (err: any) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: err.message,
        })
      }
    },
  )
}
