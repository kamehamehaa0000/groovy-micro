import {
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { s3Client } from './storage.client'
import { UPLOAD_PRESETS, type UploadCategory } from './storage.presets'
import { randomUUID } from 'crypto'
import { eq, and, isNull, sql, ilike, desc, asc } from 'drizzle-orm'
import { db } from '../../db'
import { songs, albums, artistProfiles, outboxEvents } from '../../db/schema'
import { slugify } from '../artists/artists.service'
import { enqueueTranscodeJob } from '../../lib/queue/transcode.queue'
import { SubscriptionsService } from '../subscriptions/subscriptions.service'
import type { BulkImportReleaseInput } from './storage.schemas'

const subscriptionsService = new SubscriptionsService()

export interface LockerQuota {
  planId: string
  maxSongs: number
  usedSongs: number
  remainingSongs: number
}

function generateScopedSlug(text: string, userId: string): string {
  const base = slugify(text) || 'untitled'
  const userSegment = userId.replace(/-/g, '').slice(0, 8)
  const rand = randomUUID().replace(/-/g, '').slice(0, 4)
  return `${base.slice(0, 120)}-${userSegment}-${rand}`
}

export class StorageService {
  private get bucketName(): string {
    return process.env.R2_BUCKET_NAME || 'groovy-media'
  }

  private get cdnBaseUrl(): string {
    const raw = process.env.CDN_BASE_URL || 'https://cdn.groovy.stream'
    return raw.replace(/\/+$/, '')
  }

  /**
   * Generates a pre-signed PUT upload URL locked to MIME type and content length.
   */
  async generateUploadUrl(params: {
    category: UploadCategory
    ownerId: string
    resourceId: string
    mimeType: string
    fileExtension: string
    fileSizeBytes: number
  }) {
    const preset = UPLOAD_PRESETS[params.category]
    if (!preset) {
      throw new Error(`Invalid upload category: ${params.category}`)
    }

    // 1. Validate MIME Type
    const normalizedMime = params.mimeType.toLowerCase()
    if (!preset.allowedMimeTypes.includes(normalizedMime)) {
      throw new Error(
        `Unsupported MIME type "${params.mimeType}" for category ${params.category}. Allowed: ${preset.allowedMimeTypes.join(', ')}`,
      )
    }

    // 2. Validate File Size
    if (params.fileSizeBytes > preset.maxSizeBytes) {
      const maxMb = (preset.maxSizeBytes / (1024 * 1024)).toFixed(1)
      const reqMb = (params.fileSizeBytes / (1024 * 1024)).toFixed(1)
      throw new Error(
        `File size (${reqMb}MB) exceeds the maximum allowed size of ${maxMb}MB for ${params.category}`,
      )
    }

    // 3. Generate deterministic namespaced key
    const cleanExt = params.fileExtension.replace(/^\./, '').toLowerCase()
    const storageKey = preset.generateKey(
      params.ownerId,
      params.resourceId,
      cleanExt,
    )

    // 4. Create PutObjectCommand locked to Content-Type & Content-Length
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: storageKey,
      ContentType: normalizedMime,
      ContentLength: params.fileSizeBytes,
      Metadata: {
        ownerId: params.ownerId,
        category: params.category,
      },
    })

    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: preset.ttlSeconds,
    })

    const publicUrl = preset.isPublic
      ? `${this.cdnBaseUrl}/${storageKey}`
      : null

    return {
      uploadUrl,
      storageKey,
      publicUrl,
      expiresInSeconds: preset.ttlSeconds,
    }
  }

  /**
   * Verifies that the client actually finished uploading to R2 before saving to database.
   */
  async verifyObjectExists(
    storageKey: string,
  ): Promise<{ sizeBytes: number; contentType: string } | null> {
    try {
      const res = await s3Client.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: storageKey,
        }),
      )

      return {
        sizeBytes: res.ContentLength ?? 0,
        contentType: res.ContentType ?? 'application/octet-stream',
      }
    } catch (err: any) {
      if (
        err.name === 'NotFound' ||
        err.$metadata?.httpStatusCode === 404 ||
        err.name === 'NoSuchKey'
      ) {
        return null
      }
      throw err
    }
  }

  /**
   * Deletes an object from storage (e.g. replacing avatar or cover art).
   */
  async deleteObject(storageKey: string): Promise<void> {
    try {
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: storageKey,
        }),
      )
    } catch (err: any) {
      // Ignore if key didn't exist
      if (err.name !== 'NotFound' && err.name !== 'NoSuchKey') {
        throw err
      }
    }
  }

  /**
   * Constructs public CDN URL from a storage key.
   */
  getPublicUrl(storageKey: string): string {
    return `${this.cdnBaseUrl}/${storageKey.replace(/^\/+/, '')}`
  }

  /**
   * Ensures a valid CDN URL.
   */
  ensureFullUrl(pathOrUrl: string | null | undefined): string | null {
    if (!pathOrUrl) return null
    const trimmed = pathOrUrl.trim()
    if (!trimmed) return null
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed
    }
    return this.getPublicUrl(trimmed)
  }

  /**
   * Calculates the user's current locker quota and remaining upload capacity.
   * Free: 50, Premium/Pro/Student: 500, Hi-Fi: 2500 (or custom from plan features).
   */
  async getLockerQuota(userId: string): Promise<LockerQuota> {
    const userEntitlements =
      await subscriptionsService.getUserEntitlements(userId)
    let maxSongs = 50 // Free tier default

    const quotaVal = userEntitlements.features?.personal_collection_quota
    if (
      quotaVal !== undefined &&
      quotaVal !== null &&
      !Number.isNaN(Number(quotaVal))
    ) {
      maxSongs = Math.max(0, Number(quotaVal))
    } else {
      const plan = (userEntitlements.planId || 'free').toLowerCase()
      if (plan.includes('hifi')) {
        maxSongs = 5000
      } else if (
        plan.includes('premium') ||
        plan.includes('pro') ||
        plan.includes('student')
      ) {
        maxSongs = 1000
      }
    }

    const [songCountResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(songs)
      .where(
        and(
          eq(songs.uploaderUserId, userId),
          eq(songs.scope, 'PERSONAL'),
          isNull(songs.deletedAt),
        ),
      )

    const usedSongs = Number(songCountResult?.count || 0)
    const remainingSongs = Math.max(0, maxSongs - usedSongs)

    return {
      planId: userEntitlements.planId || 'free',
      maxSongs,
      usedSongs,
      remainingSongs,
    }
  }

  /**
   * Imports a clustered release (Album/EP/Single) into the user's personal cloud locker.
   * Performs deduplication for personal artist profiles scoped strictly to this user.
   */
  async bulkImportPersonalRelease(
    userId: string,
    input: BulkImportReleaseInput,
  ) {
    // 1. Quota Enforcement Gate
    const quota = await this.getLockerQuota(userId)
    if (quota.usedSongs + input.tracks.length > quota.maxSongs) {
      throw new Error(
        `Upload limit exceeded. You have ${quota.remainingSongs} personal slots remaining out of ${quota.maxSongs}. Requested import has ${input.tracks.length} track(s).`,
      )
    }

    const pendingTranscodeJobs: Array<{
      songId: string
      rawAudioKey: string
      artistId: string
      title: string
    }> = []

    const result = await db.transaction(async (tx) => {
      // 2. Personal Artist Deduplication: find or create personal artist scoped to this user
      const primaryArtistName = input.artistName.trim()
      let [primaryArtist] = await tx
        .select()
        .from(artistProfiles)
        .where(
          and(
            eq(artistProfiles.ownerUserId, userId),
            eq(artistProfiles.scope, 'PERSONAL'),
            ilike(artistProfiles.stageName, primaryArtistName),
          ),
        )
        .limit(1)

      if (!primaryArtist) {
        const artistSlug = generateScopedSlug(primaryArtistName, userId)
        const [created] = await tx
          .insert(artistProfiles)
          .values({
            ownerUserId: userId,
            userId: null, // Personal sandboxed artist has no login user account
            scope: 'PERSONAL',
            stageName: primaryArtistName,
            slug: artistSlug,
            verified: false,
            verificationStatus: 'NONE',
          })
          .returning()
        primaryArtist = created
      }

      const resolvedArtists = new Map<string, string>()
      resolvedArtists.set(primaryArtistName.toLowerCase(), primaryArtist.id)

      // 3. Create Personal Album
      const albumTitle = input.albumTitle.trim()
      const albumSlug = generateScopedSlug(albumTitle, userId)
      const releaseDate =
        input.releaseDate || new Date().toISOString().split('T')[0]
      const totalDuration = input.tracks.reduce(
        (acc, t) => acc + (t.durationSeconds || 0),
        0,
      )
      const albumType =
        input.albumType ||
        (input.tracks.length > 3
          ? 'ALBUM'
          : input.tracks.length > 1
            ? 'EP'
            : 'SINGLE')

      const albumCoverUrl = input.coverImageUrl
        ? this.ensureFullUrl(input.coverImageUrl)
        : null

      const [album] = await tx
        .insert(albums)
        .values({
          artistId: primaryArtist.id,
          uploaderUserId: userId,
          scope: 'PERSONAL',
          title: albumTitle,
          slug: albumSlug,
          albumType,
          coverImageUrl: albumCoverUrl,
          genre: input.genre || input.tracks[0]?.genre || null,
          releaseDate,
          status: 'PUBLISHED',
          visibility: 'PRIVATE',
          totalTracks: input.tracks.length,
          totalDurationSeconds: totalDuration,
        })
        .returning()

      // 4. Create Songs & Outbox Events
      const createdSongs = []
      for (let i = 0; i < input.tracks.length; i++) {
        const track = input.tracks[i]
        const trackArtistName = (track.artistName || primaryArtistName).trim()
        let trackArtistId = resolvedArtists.get(trackArtistName.toLowerCase())

        if (!trackArtistId) {
          let [existingTrackArtist] = await tx
            .select()
            .from(artistProfiles)
            .where(
              and(
                eq(artistProfiles.ownerUserId, userId),
                eq(artistProfiles.scope, 'PERSONAL'),
                ilike(artistProfiles.stageName, trackArtistName),
              ),
            )
            .limit(1)

          if (!existingTrackArtist) {
            const tSlug = generateScopedSlug(trackArtistName, userId)
            const [c] = await tx
              .insert(artistProfiles)
              .values({
                ownerUserId: userId,
                userId: null,
                scope: 'PERSONAL',
                stageName: trackArtistName,
                slug: tSlug,
                verified: false,
                verificationStatus: 'NONE',
              })
              .returning()
            existingTrackArtist = c
          }
          trackArtistId = existingTrackArtist.id
          resolvedArtists.set(trackArtistName.toLowerCase(), trackArtistId)
        }

        const songSlug = generateScopedSlug(track.title, userId)
        const audioUrl = this.ensureFullUrl(track.rawAudioKey)

        const [song] = await tx
          .insert(songs)
          .values({
            artistId: trackArtistId,
            albumId: album.id,
            uploaderUserId: userId,
            scope: 'PERSONAL',
            title: track.title.trim(),
            slug: songSlug,
            genre: track.genre || input.genre || null,
            durationSeconds: track.durationSeconds || 0,
            trackNumber: track.trackNumber || i + 1,
            discNumber: track.discNumber || 1,
            isExplicit: track.isExplicit || false,
            rawAudioKey: track.rawAudioKey,
            audioUrl,
            coverImageUrl: albumCoverUrl,
            processingStatus: 'PENDING',
          })
          .returning()

        const jobPayload = {
          songId: song.id,
          rawAudioKey: track.rawAudioKey,
          artistId: trackArtistId,
          title: song.title,
        }

        // Transactional Outbox record
        await tx.insert(outboxEvents).values({
          aggregateType: 'SONG',
          aggregateId: song.id,
          eventType: 'SONG_UPLOADED',
          payload: jobPayload,
          publishedAt: new Date(),
        })

        pendingTranscodeJobs.push(jobPayload)
        createdSongs.push(song)
      }

      return {
        album,
        artist: primaryArtist,
        tracks: createdSongs,
      }
    })

    // 5. Fast-path BullMQ Transcode Dispatch
    for (const job of pendingTranscodeJobs) {
      enqueueTranscodeJob(job).catch((err) => {
        console.warn(
          `[BulkImport] Fast-path transcode dispatch warning for song ${job.songId}:`,
          err.message,
        )
      })
    }

    return result
  }

  /**
   * Retrieves all personal locker releases uploaded by the user.
   */
  async getUserLockerReleases(userId: string) {
    const userAlbums = await db
      .select({
        id: albums.id,
        title: albums.title,
        slug: albums.slug,
        albumType: albums.albumType,
        coverImageUrl: albums.coverImageUrl,
        genre: albums.genre,
        releaseDate: albums.releaseDate,
        totalTracks: albums.totalTracks,
        totalDurationSeconds: albums.totalDurationSeconds,
        createdAt: albums.createdAt,
        artistId: artistProfiles.id,
        artistName: artistProfiles.stageName,
        artistSlug: artistProfiles.slug,
      })
      .from(albums)
      .innerJoin(artistProfiles, eq(albums.artistId, artistProfiles.id))
      .where(
        and(
          eq(albums.uploaderUserId, userId),
          eq(albums.scope, 'PERSONAL'),
          isNull(albums.deletedAt),
        ),
      )
      .orderBy(desc(albums.createdAt))

    const albumIds = userAlbums.map((a) => a.id)
    const songsByAlbum = new Map<string, any[]>()

    if (albumIds.length > 0) {
      const userSongs = await db
        .select({
          id: songs.id,
          albumId: songs.albumId,
          title: songs.title,
          slug: songs.slug,
          durationSeconds: songs.durationSeconds,
          trackNumber: songs.trackNumber,
          discNumber: songs.discNumber,
          genre: songs.genre,
          isExplicit: songs.isExplicit,
          rawAudioKey: songs.rawAudioKey,
          audioUrl: songs.audioUrl,
          hlsManifestUrl: songs.hlsManifestUrl,
          processingStatus: songs.processingStatus,
          coverImageUrl: songs.coverImageUrl,
          createdAt: songs.createdAt,
          artistId: artistProfiles.id,
          artistName: artistProfiles.stageName,
        })
        .from(songs)
        .innerJoin(artistProfiles, eq(songs.artistId, artistProfiles.id))
        .where(
          and(
            eq(songs.uploaderUserId, userId),
            eq(songs.scope, 'PERSONAL'),
            isNull(songs.deletedAt),
          ),
        )
        .orderBy(
          asc(songs.discNumber),
          asc(songs.trackNumber),
          asc(songs.createdAt),
        )

      for (const song of userSongs) {
        if (song.albumId) {
          const list = songsByAlbum.get(song.albumId) || []
          list.push(song)
          songsByAlbum.set(song.albumId, list)
        }
      }
    }

    return userAlbums.map((a) => ({
      ...a,
      tracks: songsByAlbum.get(a.id) || [],
    }))
  }

  /**
   * Deletes a single personal song from the user's personal collection.
   * If this was the last song in the personal album, the album is also soft-deleted.
   */
  async deletePersonalSong(userId: string, songId: string) {
    const [song] = await db
      .select()
      .from(songs)
      .where(
        and(
          eq(songs.id, songId),
          eq(songs.uploaderUserId, userId),
          eq(songs.scope, 'PERSONAL'),
          isNull(songs.deletedAt),
        ),
      )
      .limit(1)

    if (!song) {
      throw new Error('Song not found in your personal collection')
    }

    const now = sql`NOW()`

    await db.transaction(async (tx) => {
      // 1. Soft-delete the song
      await tx.update(songs).set({ deletedAt: now }).where(eq(songs.id, songId))

      // 2. If part of an album, update remaining tracks count and duration
      if (song.albumId) {
        const remainingSongs = await tx
          .select({
            id: songs.id,
            durationSeconds: songs.durationSeconds,
          })
          .from(songs)
          .where(and(eq(songs.albumId, song.albumId), isNull(songs.deletedAt)))

        if (remainingSongs.length === 0) {
          // No more active tracks in this album, mark album as deleted
          await tx
            .update(albums)
            .set({ deletedAt: now })
            .where(eq(albums.id, song.albumId))
        } else {
          const totalDuration = remainingSongs.reduce(
            (acc, s) => acc + (s.durationSeconds || 0),
            0,
          )
          await tx
            .update(albums)
            .set({
              totalTracks: remainingSongs.length,
              totalDurationSeconds: totalDuration,
            })
            .where(eq(albums.id, song.albumId))
        }
      }
    })

    return { success: true, message: 'Song removed from personal collection' }
  }

  /**
   * Deletes an entire personal release and all its tracks from the user's personal collection.
   */
  async deletePersonalRelease(userId: string, albumId: string) {
    const [album] = await db
      .select()
      .from(albums)
      .where(
        and(
          eq(albums.id, albumId),
          eq(albums.uploaderUserId, userId),
          eq(albums.scope, 'PERSONAL'),
          isNull(albums.deletedAt),
        ),
      )
      .limit(1)

    if (!album) {
      throw new Error('Release not found in your personal collection')
    }

    const now = sql`NOW()`

    await db.transaction(async (tx) => {
      // 1. Soft-delete the album
      await tx
        .update(albums)
        .set({ deletedAt: now })
        .where(eq(albums.id, albumId))

      // 2. Soft-delete all tracks belonging to this album
      await tx
        .update(songs)
        .set({ deletedAt: now })
        .where(
          and(
            eq(songs.albumId, albumId),
            eq(songs.uploaderUserId, userId),
            isNull(songs.deletedAt),
          ),
        )
    })

    return {
      success: true,
      message: 'Release removed from personal collection',
    }
  }
}
