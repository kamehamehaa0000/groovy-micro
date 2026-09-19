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
  createPersonalArtistSchema,
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
   * GET /personal-collection/artists & GET /locker/artists
   * Returns all personal sandboxed artists created by the user with release & track counts.
   */
  const handleGetPersonalArtists = async (request: any, reply: any) => {
    const result = await storageService.getUserPersonalArtists(request.user.id)
    return reply.status(200).send(result)
  }

  fastify.get(
    '/personal-collection/artists',
    { preHandler: [requireAuth] },
    handleGetPersonalArtists,
  )

  fastify.get(
    '/locker/artists',
    { preHandler: [requireAuth] },
    handleGetPersonalArtists,
  )

  /**
   * POST /personal-collection/artists
   * Creates or resolves a personal sandboxed artist for the user.
   */
  fastify.post(
    '/personal-collection/artists',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parseResult = createPersonalArtistSchema.safeParse(request.body)
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Validation failed',
          errors: parseResult.error.flatten().fieldErrors,
        })
      }

      try {
        const result = await storageService.createPersonalArtist(
          request.user.id,
          parseResult.data,
        )
        return reply.status(result.isExisting ? 200 : 201).send(result)
      } catch (err: any) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: err.message || 'Failed to create personal artist',
        })
      }
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
   * GET /personal-collection/trash & GET /locker/trash
   * Returns all soft-deleted songs and releases in the user's trash.
   */
  const handleGetTrash = async (request: any, reply: any) => {
    const trash = await storageService.getUserTrash(request.user.id)
    return reply.status(200).send(trash)
  }

  fastify.get(
    '/personal-collection/trash',
    { preHandler: [requireAuth] },
    handleGetTrash,
  )

  fastify.get('/locker/trash', { preHandler: [requireAuth] }, handleGetTrash)

  /**
   * POST /personal-collection/songs/:id/restore & POST /locker/songs/:id/restore
   * Restores a soft-deleted song with quota validation.
   */
  const handleRestoreSong = async (request: any, reply: any) => {
    const { id } = request.params as { id: string }
    try {
      const result = await storageService.restorePersonalSong(
        request.user.id,
        id,
      )
      return reply.status(200).send(result)
    } catch (err: any) {
      const isQuota = err.message?.includes('quota exceeded')
      return reply.status(isQuota ? 403 : 400).send({
        statusCode: isQuota ? 403 : 400,
        error: isQuota ? 'Forbidden' : 'Bad Request',
        message: err.message || 'Failed to restore song from trash',
      })
    }
  }

  fastify.post(
    '/personal-collection/songs/:id/restore',
    { preHandler: [requireAuth] },
    handleRestoreSong,
  )

  fastify.post(
    '/locker/songs/:id/restore',
    { preHandler: [requireAuth] },
    handleRestoreSong,
  )

  /**
   * POST /personal-collection/releases/:id/restore & POST /locker/releases/:id/restore
   * Restores an entire soft-deleted release and its tracks with quota validation.
   */
  const handleRestoreRelease = async (request: any, reply: any) => {
    const { id } = request.params as { id: string }
    try {
      const result = await storageService.restorePersonalRelease(
        request.user.id,
        id,
      )
      return reply.status(200).send(result)
    } catch (err: any) {
      const isQuota = err.message?.includes('quota')
      return reply.status(isQuota ? 403 : 400).send({
        statusCode: isQuota ? 403 : 400,
        error: isQuota ? 'Forbidden' : 'Bad Request',
        message: err.message || 'Failed to restore release from trash',
      })
    }
  }

  fastify.post(
    '/personal-collection/releases/:id/restore',
    { preHandler: [requireAuth] },
    handleRestoreRelease,
  )

  fastify.post(
    '/locker/releases/:id/restore',
    { preHandler: [requireAuth] },
    handleRestoreRelease,
  )

  /**
   * DELETE /personal-collection/songs/:id/permanent & DELETE /locker/songs/:id/permanent
   * Permanently deletes a personal song from PostgreSQL and R2.
   */
  const handlePermanentlyDeleteSong = async (request: any, reply: any) => {
    const { id } = request.params as { id: string }
    try {
      const result = await storageService.permanentlyDeletePersonalSong(
        request.user.id,
        id,
      )
      return reply.status(200).send(result)
    } catch (err: any) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: err.message || 'Failed to permanently delete song',
      })
    }
  }

  fastify.delete(
    '/personal-collection/songs/:id/permanent',
    { preHandler: [requireAuth] },
    handlePermanentlyDeleteSong,
  )

  fastify.delete(
    '/locker/songs/:id/permanent',
    { preHandler: [requireAuth] },
    handlePermanentlyDeleteSong,
  )

  /**
   * DELETE /personal-collection/releases/:id/permanent & DELETE /locker/releases/:id/permanent
   * Permanently deletes a personal release and all its tracks from PostgreSQL and R2.
   */
  const handlePermanentlyDeleteRelease = async (request: any, reply: any) => {
    const { id } = request.params as { id: string }
    try {
      const result = await storageService.permanentlyDeletePersonalRelease(
        request.user.id,
        id,
      )
      return reply.status(200).send(result)
    } catch (err: any) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: err.message || 'Failed to permanently delete release',
      })
    }
  }

  fastify.delete(
    '/personal-collection/releases/:id/permanent',
    { preHandler: [requireAuth] },
    handlePermanentlyDeleteRelease,
  )

  fastify.delete(
    '/locker/releases/:id/permanent',
    { preHandler: [requireAuth] },
    handlePermanentlyDeleteRelease,
  )

  /**
   * DELETE /personal-collection/trash & DELETE /locker/trash
   * Empties the user's recycle bin permanently.
   */
  const handleEmptyTrash = async (request: any, reply: any) => {
    try {
      const result = await storageService.emptyPersonalTrash(request.user.id)
      return reply.status(200).send(result)
    } catch (err: any) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: err.message || 'Failed to empty recycle bin',
      })
    }
  }

  fastify.delete(
    '/personal-collection/trash',
    { preHandler: [requireAuth] },
    handleEmptyTrash,
  )

  fastify.delete(
    '/locker/trash',
    { preHandler: [requireAuth] },
    handleEmptyTrash,
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
        const fieldErrors = parseResult.error.flatten().fieldErrors
        const detailedMsg = Object.entries(fieldErrors)
          .map(([k, v]) => `${k}: ${v?.join(', ')}`)
          .join('; ')
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: detailedMsg ? `Validation failed (${detailedMsg})` : 'Validation failed',
          errors: fieldErrors,
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
        const fieldErrors = parseResult.error.flatten().fieldErrors
        const detailedMsg = Object.entries(fieldErrors)
          .map(([k, v]) => `${k}: ${v?.join(', ')}`)
          .join('; ')
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: detailedMsg ? `Validation failed (${detailedMsg})` : 'Validation failed',
          errors: fieldErrors,
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
