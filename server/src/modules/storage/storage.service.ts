import {
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { s3Client } from './storage.client'
import { UPLOAD_PRESETS, type UploadCategory } from './storage.presets'
import { randomUUID, createHmac, timingSafeEqual } from 'crypto'
import { eq, and, isNull, isNotNull, sql, ilike, desc, asc, inArray, or } from 'drizzle-orm'
import { db } from '../../db'
import { songs, albums, artistProfiles, outboxEvents, songCredits } from '../../db/schema'
import { slugify } from '../artists/artists.service'
import { enqueueTranscodeJob } from '../../lib/queue/transcode.queue'
import { SubscriptionsService } from '../subscriptions/subscriptions.service'
import { cacheManager, cacheKeys, playlistsCacheService } from '../../lib/cache'
import type {
  BulkImportReleaseInput,
  PersonalReleasesQuery,
  PersonalArtistsQuery,
  PersonalTracksQuery,
} from './storage.schemas'

const subscriptionsService = new SubscriptionsService()

export interface LockerQuota {
  planId: string
  maxSongs: number
  usedSongs: number
  remainingSongs: number
}

function generateCleanupToken(userId: string, storageKey: string): string {
  const secret = process.env.JWT_SECRET || 'groovy-cleanup-secret'
  return createHmac('sha256', secret).update(`${userId}:${storageKey}`).digest('hex')
}

function verifyCleanupToken(userId: string, storageKey: string, token: string): boolean {
  try {
    const expected = generateCleanupToken(userId, storageKey)
    const a = Buffer.from(expected, 'hex')
    const b = Buffer.from(token, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

function generateScopedSlug(text: string, userId: string): string {
  const base = slugify(text) || 'untitled'
  const userSegment = userId.replace(/-/g, '').slice(0, 8)
  const rand = randomUUID().replace(/-/g, '').slice(0, 4)
  return `${base.slice(0, 120)}-${userSegment}-${rand}`
}

export function parseArtistNames(rawArtistString: string): string[] {
  if (!rawArtistString || !rawArtistString.trim()) return ['Various Artists']

  const normalized = rawArtistString
    .replace(/\s+(?:feat\.|ft\.|featuring)\s+/gi, ', ')
    .replace(/\s+&\s+/g, ', ')
    .replace(/;/g, ',')

  const parts = normalized
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0)

  const uniqueNames: string[] = []
  const seen = new Set<string>()
  for (const p of parts) {
    const lower = p.toLowerCase()
    if (!seen.has(lower)) {
      seen.add(lower)
      uniqueNames.push(p)
    }
  }

  return uniqueNames.length > 0 ? uniqueNames : ['Various Artists']
}

async function resolvePersonalArtist(
  tx: any,
  artistName: string,
  userId: string,
  cache: Map<string, typeof artistProfiles.$inferSelect>,
): Promise<typeof artistProfiles.$inferSelect> {
  const cleanName = artistName.trim()
  const lowerKey = cleanName.toLowerCase()

  if (cache.has(lowerKey)) {
    return cache.get(lowerKey)!
  }

  let [existing] = await tx
    .select()
    .from(artistProfiles)
    .where(
      and(
        eq(artistProfiles.ownerUserId, userId),
        eq(artistProfiles.scope, 'PERSONAL'),
        ilike(artistProfiles.stageName, cleanName),
      ),
    )
    .limit(1)

  if (!existing) {
    const slug = generateScopedSlug(cleanName, userId)
    const [created] = await tx
      .insert(artistProfiles)
      .values({
        ownerUserId: userId,
        userId: null,
        scope: 'PERSONAL',
        stageName: cleanName,
        slug,
        verified: false,
        verificationStatus: 'NONE',
      })
      .returning()
    existing = created
  }

  cache.set(lowerKey, existing)
  return existing
}

/**
 * Checks candidate personal artist IDs and permanently deletes any sandboxed artist
 * that has 0 remaining songs, 0 remaining credits, and 0 remaining albums anywhere.
 */
async function cleanupOrphanedPersonalArtists(
  tx: any,
  userId: string,
  candidateArtistIds: string[],
) {
  const uniqueIds = Array.from(new Set(candidateArtistIds.filter(Boolean)))
  if (uniqueIds.length === 0) return []

  const personalArtists = await tx
    .select({ id: artistProfiles.id, slug: artistProfiles.slug })
    .from(artistProfiles)
    .where(
      and(
        inArray(artistProfiles.id, uniqueIds),
        eq(artistProfiles.ownerUserId, userId),
        eq(artistProfiles.scope, 'PERSONAL'),
      ),
    )

  if (personalArtists.length === 0) return []

  const deletedArtistSlugs: string[] = []

  for (const artist of personalArtists) {
    // Check if artist has ANY songs remaining in songs table (active OR trashed)
    const anySongs = await tx
      .select({ id: songs.id })
      .from(songs)
      .where(eq(songs.artistId, artist.id))
      .limit(1)

    // Check if artist has ANY credits in songCredits table
    const anyCredits = await tx
      .select({ songId: songCredits.songId })
      .from(songCredits)
      .where(eq(songCredits.artistId, artist.id))
      .limit(1)

    // Check if artist has ANY albums remaining in albums table (active OR trashed)
    const anyAlbums = await tx
      .select({ id: albums.id })
      .from(albums)
      .where(eq(albums.artistId, artist.id))
      .limit(1)

    if (anySongs.length === 0 && anyCredits.length === 0 && anyAlbums.length === 0) {
      await tx.delete(artistProfiles).where(eq(artistProfiles.id, artist.id))
      deletedArtistSlugs.push(artist.slug)
      await cacheManager.invalidateArtist({ id: artist.id, slug: artist.slug })
    }
  }

  return deletedArtistSlugs
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

    const cleanupToken = generateCleanupToken(params.ownerId, storageKey)

    return {
      uploadUrl,
      storageKey,
      publicUrl,
      expiresInSeconds: preset.ttlSeconds,
      cleanupToken,
    }
  }

  /**
   * Securely deletes an uncommitted raw audio file from R2.
   * Ensures:
   * 1. Storage key matches category SONG_AUDIO_RAW ('audio/raw/').
   * 2. Cleanup token matches the authenticated user and storageKey.
   * 3. Database guard: The storageKey is NOT referenced by any song in the catalog.
   */
  async cleanupUncommittedAudio(
    userId: string,
    storageKey: string,
    cleanupToken: string,
  ): Promise<boolean> {
    if (!storageKey || !storageKey.startsWith('audio/raw/')) {
      throw new Error('Invalid storage key format for uncommitted audio')
    }

    if (!verifyCleanupToken(userId, storageKey, cleanupToken)) {
      throw new Error('Invalid or unauthorized cleanup token')
    }

    // Active Database Guard: Ensure key is not committed to any song in catalog
    const [referencedSong] = await db
      .select({ id: songs.id })
      .from(songs)
      .where(eq(songs.rawAudioKey, storageKey))
      .limit(1)

    if (referencedSong) {
      throw new Error('Cannot delete key: object is actively referenced by a published song')
    }

    // Safe to delete from R2
    await this.deleteObject(storageKey)
    return true
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
      const resolvedArtists = new Map<string, typeof artistProfiles.$inferSelect>()

      // 2. Personal Artist Deduplication: resolve primary artist of album
      const albumArtistNames = parseArtistNames(input.artistName || 'Various Artists')
      const primaryArtist = await resolvePersonalArtist(
        tx,
        albumArtistNames[0],
        userId,
        resolvedArtists,
      )

      // Query existing active personal songs for this user to deduplicate against
      const existingPersonalSongs = await tx
        .select({
          id: songs.id,
          title: songs.title,
          artistId: songs.artistId,
          durationSeconds: songs.durationSeconds,
        })
        .from(songs)
        .where(
          and(
            eq(songs.uploaderUserId, userId),
            eq(songs.scope, 'PERSONAL'),
            isNull(songs.deletedAt),
          ),
        )

      // Pre-resolve artists and filter out duplicate songs
      const tracksToImport: Array<{
        track: (typeof input.tracks)[0]
        primaryArtist: typeof artistProfiles.$inferSelect
        featuredArtists: Array<typeof artistProfiles.$inferSelect>
      }> = []
      let skippedDuplicates = 0

      for (let i = 0; i < input.tracks.length; i++) {
        const track = input.tracks[i]
        const rawTrackArtist = (track.artistName || input.artistName || 'Various Artists').trim()
        const trackArtistNames = parseArtistNames(rawTrackArtist)
        const primaryTrackArtist = await resolvePersonalArtist(
          tx,
          trackArtistNames[0],
          userId,
          resolvedArtists,
        )

        const featuredArtists: Array<typeof artistProfiles.$inferSelect> = []
        for (const featName of trackArtistNames.slice(1)) {
          const featArtist = await resolvePersonalArtist(
            tx,
            featName,
            userId,
            resolvedArtists,
          )
          if (
            featArtist.id !== primaryTrackArtist.id &&
            !featuredArtists.some((a) => a.id === featArtist.id)
          ) {
            featuredArtists.push(featArtist)
          }
        }

        // Deduplication check: same artist, same title (case-insensitive), duration within 2s
        const normTitle = track.title.trim().toLowerCase()
        const trackDur = track.durationSeconds || 0
        const isDuplicate = existingPersonalSongs.some(
          (s) =>
            s.artistId === primaryTrackArtist.id &&
            s.title.trim().toLowerCase() === normTitle &&
            Math.abs((s.durationSeconds || 0) - trackDur) <= 2,
        )

        if (isDuplicate) {
          skippedDuplicates++
          // Fire-and-forget immediate cleanup of the uploaded raw audio
          if (track.rawAudioKey) {
            this.deleteObject(track.rawAudioKey).catch((err) =>
              console.warn(
                `[StorageService] Failed to cleanup duplicate R2 raw audio key: ${track.rawAudioKey}`,
                err,
              ),
            )
          }
        } else {
          tracksToImport.push({
            track,
            primaryArtist: primaryTrackArtist,
            featuredArtists,
          })
        }
      }

      // If all tracks are duplicates, return early without creating an empty album
      if (tracksToImport.length === 0) {
        // Also clean up uploaded cover art if a new cover was provided for this skipped release
        if (input.coverImageUrl && !input.existingAlbumId) {
          const coverKey = input.coverImageUrl
            .replace(this.cdnBaseUrl, '')
            .replace(/^\/+/, '')
          if (coverKey && !coverKey.startsWith('http')) {
            this.deleteObject(coverKey).catch((err) =>
              console.warn(
                `[StorageService] Failed to cleanup orphaned cover art: ${coverKey}`,
                err,
              ),
            )
          }
        }

        return {
          album: null,
          artist: primaryArtist,
          tracks: [],
          skippedDuplicates,
          message:
            'All tracks in this release already exist in your personal collection',
        }
      }

      // 3. Resolve or Create Personal Album
      let album: typeof albums.$inferSelect
      let startTrackNumber = 1

      if (input.existingAlbumId) {
        const [existingAlbum] = await tx
          .select()
          .from(albums)
          .where(
            and(
              eq(albums.id, input.existingAlbumId),
              eq(albums.uploaderUserId, userId),
              eq(albums.scope, 'PERSONAL'),
              isNull(albums.deletedAt),
            ),
          )
          .limit(1)

        if (!existingAlbum) {
          throw new Error('Target release not found in your personal collection')
        }

        startTrackNumber = (existingAlbum.totalTracks || 0) + 1
        const addDuration = tracksToImport.reduce(
          (acc, t) => acc + (t.track.durationSeconds || 0),
          0,
        )

        const [updatedAlbum] = await tx
          .update(albums)
          .set({
            totalTracks: (existingAlbum.totalTracks || 0) + tracksToImport.length,
            totalDurationSeconds:
              (existingAlbum.totalDurationSeconds || 0) + addDuration,
            updatedAt: new Date(),
          })
          .where(eq(albums.id, existingAlbum.id))
          .returning()

        album = updatedAlbum
      } else {
        const albumTitle = input.albumTitle.trim()
        const albumSlug = generateScopedSlug(albumTitle, userId)
        const releaseDate =
          input.releaseDate || new Date().toISOString().split('T')[0]
        const totalDuration = tracksToImport.reduce(
          (acc, t) => acc + (t.track.durationSeconds || 0),
          0,
        )
        const albumType =
          input.albumType ||
          (tracksToImport.length > 3
            ? 'ALBUM'
            : tracksToImport.length > 1
              ? 'EP'
              : 'SINGLE')

        const albumCoverUrl = input.coverImageUrl
          ? this.ensureFullUrl(input.coverImageUrl)
          : null

        const [createdAlbum] = await tx
          .insert(albums)
          .values({
            artistId: primaryArtist.id,
            uploaderUserId: userId,
            scope: 'PERSONAL',
            title: albumTitle,
            slug: albumSlug,
            albumType,
            coverImageUrl: albumCoverUrl,
            genre: input.genre || tracksToImport[0]?.track.genre || null,
            releaseDate,
            status: 'PUBLISHED',
            visibility: 'PRIVATE',
            totalTracks: tracksToImport.length,
            totalDurationSeconds: totalDuration,
          })
          .returning()

        album = createdAlbum
      }

      // 4. Create Songs, Song Credits & Outbox Events
      const createdSongs = []
      for (let i = 0; i < tracksToImport.length; i++) {
        const {
          track,
          primaryArtist: trackPrimaryArtist,
          featuredArtists: trackFeaturedArtists,
        } = tracksToImport[i]
        const songSlug = generateScopedSlug(track.title, userId)
        const audioUrl = this.ensureFullUrl(track.rawAudioKey)

        const [song] = await tx
          .insert(songs)
          .values({
            artistId: trackPrimaryArtist.id,
            albumId: album.id,
            uploaderUserId: userId,
            scope: 'PERSONAL',
            title: track.title.trim(),
            slug: songSlug,
            genre: track.genre || input.genre || null,
            durationSeconds: track.durationSeconds || 0,
            trackNumber: input.existingAlbumId
              ? startTrackNumber + i
              : (track.trackNumber || i + 1),
            discNumber: track.discNumber || 1,
            isExplicit: track.isExplicit || false,
            rawAudioKey: track.rawAudioKey,
            audioUrl,
            coverImageUrl: album.coverImageUrl,
            processingStatus: 'PENDING',
          })
          .returning()

        // Insert Song Credits (Primary + Featured Collaborators)
        const creditsToInsert = [
          {
            songId: song.id,
            artistId: trackPrimaryArtist.id,
            role: 'PRIMARY' as const,
          },
          ...trackFeaturedArtists.map((feat) => ({
            songId: song.id,
            artistId: feat.id,
            role: 'FEATURED' as const,
          })),
        ]

        await tx
          .insert(songCredits)
          .values(creditsToInsert)
          .onConflictDoNothing()

        const jobPayload = {
          songId: song.id,
          rawAudioKey: track.rawAudioKey,
          artistId: trackPrimaryArtist.id,
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
        createdSongs.push({
          ...song,
          artistName:
            trackFeaturedArtists.length > 0
              ? `${trackPrimaryArtist.stageName} feat. ${trackFeaturedArtists.map((f) => f.stageName).join(', ')}`
              : trackPrimaryArtist.stageName,
          credits: [
            {
              songId: song.id,
              artistId: trackPrimaryArtist.id,
              stageName: trackPrimaryArtist.stageName,
              slug: trackPrimaryArtist.slug,
              role: 'PRIMARY',
            },
            ...trackFeaturedArtists.map((f) => ({
              songId: song.id,
              artistId: f.id,
              stageName: f.stageName,
              slug: f.slug,
              role: 'FEATURED',
            })),
          ],
        })
      }

      return {
        album,
        artist: primaryArtist,
        tracks: createdSongs,
        skippedDuplicates,
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
   * Retrieves personal locker releases uploaded by the user with pagination, filter, search, and sort.
   */
  async getUserLockerReleases(userId: string, query?: PersonalReleasesQuery) {
    const isPaginated = Boolean(query?.page && query?.limit)
    const page = query?.page ?? 1
    const limit = query?.limit ?? 50
    const offset = (page - 1) * limit

    const conditions = [
      eq(albums.uploaderUserId, userId),
      eq(albums.scope, 'PERSONAL'),
      isNull(albums.deletedAt),
    ]

    if (query?.type && query.type !== 'ALL') {
      conditions.push(eq(albums.albumType, query.type))
    }

    if (query?.search && query.search.trim()) {
      const q = `%${query.search.trim()}%`
      conditions.push(
        or(
          ilike(albums.title, q),
          ilike(artistProfiles.stageName, q),
          sql`EXISTS (
            SELECT 1 FROM "songs"
            WHERE "songs"."album_id" = "albums"."id"
              AND "songs"."deleted_at" IS NULL
              AND (${ilike(songs.title, q)})
          )`
        )!
      )
    }

    const whereClause = and(...conditions)

    const sort = query?.sort ?? 'recent'
    const defaultDir = sort === 'title' || sort === 'artist' ? 'asc' : 'desc'
    const isAsc = (query?.order ?? defaultDir) === 'asc'

    let orderByClause
    if (sort === 'title') {
      orderByClause = isAsc
        ? [asc(albums.title), asc(albums.id)]
        : [desc(albums.title), desc(albums.id)]
    } else if (sort === 'artist') {
      orderByClause = isAsc
        ? [asc(artistProfiles.stageName), asc(albums.title)]
        : [desc(artistProfiles.stageName), desc(albums.title)]
    } else if (sort === 'releaseDate') {
      orderByClause = isAsc
        ? [asc(albums.releaseDate), asc(albums.id)]
        : [desc(albums.releaseDate), desc(albums.id)]
    } else {
      // Default: recent (createdAt)
      orderByClause = isAsc
        ? [asc(albums.createdAt), asc(albums.id)]
        : [desc(albums.createdAt), desc(albums.id)]
    }

    let total = 0
    let userAlbumsQuery = db
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
      .where(whereClause)
      .orderBy(...orderByClause)

    let userAlbums: any[]
    if (isPaginated) {
      const [countRes, rows] = await Promise.all([
        db
          .select({ total: sql<number>`count(*)::int` })
          .from(albums)
          .innerJoin(artistProfiles, eq(albums.artistId, artistProfiles.id))
          .where(whereClause),
        userAlbumsQuery.limit(limit).offset(offset),
      ])
      total = countRes[0]?.total ?? 0
      userAlbums = rows
    } else {
      userAlbums = await userAlbumsQuery
      total = userAlbums.length
    }

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
            inArray(songs.albumId, albumIds),
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

      const songIds = userSongs.map((s) => s.id)
      let allCredits: Array<{
        songId: string
        artistId: string
        stageName: string
        slug: string
        role: string
      }> = []

      if (songIds.length > 0) {
        allCredits = await db
          .select({
            songId: songCredits.songId,
            artistId: songCredits.artistId,
            stageName: artistProfiles.stageName,
            slug: artistProfiles.slug,
            role: songCredits.role,
          })
          .from(songCredits)
          .innerJoin(
            artistProfiles,
            eq(songCredits.artistId, artistProfiles.id),
          )
          .where(inArray(songCredits.songId, songIds))
      }

      const creditsBySongId = new Map<string, typeof allCredits>()
      for (const c of allCredits) {
        const list = creditsBySongId.get(c.songId) || []
        list.push(c)
        creditsBySongId.set(c.songId, list)
      }

      for (const song of userSongs) {
        if (song.albumId) {
          const songCreditsList = creditsBySongId.get(song.id) || []
          const primaryCredit = songCreditsList.find(
            (c) => c.role === 'PRIMARY',
          )
          const featCredits = songCreditsList.filter(
            (c) => c.role === 'FEATURED',
          )

          let formattedArtistName = song.artistName
          if (featCredits.length > 0) {
            const primaryName =
              primaryCredit?.stageName || song.artistName
            const featNames = featCredits.map((f) => f.stageName).join(', ')
            formattedArtistName = `${primaryName} feat. ${featNames}`
          }

          const enrichedSong = {
            ...song,
            artistName: formattedArtistName,
            credits: songCreditsList,
          }

          const list = songsByAlbum.get(song.albumId) || []
          list.push(enrichedSong)
          songsByAlbum.set(song.albumId, list)
        }
      }
    }

    const releases = userAlbums.map((a) => ({
      ...a,
      tracks: songsByAlbum.get(a.id) || [],
    }))

    if (isPaginated) {
      return {
        releases,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      }
    }

    return { releases }
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

    await cacheManager.invalidate(cacheKeys.catalog.song(songId))
    if (song.albumId) {
      await cacheManager.invalidate(cacheKeys.catalog.album(song.albumId))
    }
    if (song.artistId) {
      await cacheManager.invalidate(cacheKeys.catalog.artist(song.artistId))
    }
    await playlistsCacheService.invalidatePlaylistsForSongs([songId])

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

    const albumSongs = await db
      .select({ id: songs.id })
      .from(songs)
      .where(
        and(
          eq(songs.albumId, albumId),
          eq(songs.uploaderUserId, userId),
          isNull(songs.deletedAt),
        ),
      )

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

    await cacheManager.invalidate(cacheKeys.catalog.album(albumId))
    if (album.artistId) {
      await cacheManager.invalidate(cacheKeys.catalog.artist(album.artistId))
    }
    for (const track of albumSongs) {
      await cacheManager.invalidate(cacheKeys.catalog.song(track.id))
    }
    if (albumSongs.length > 0) {
      await playlistsCacheService.invalidatePlaylistsForSongs(albumSongs.map((t) => t.id))
    }

    return {
      success: true,
      message: 'Release removed from personal collection',
    }
  }

  /**
   * Retrieves all soft-deleted songs and releases in the user's personal recycle bin / trash.
   */
  async getUserTrash(userId: string) {
    const trashedSongs = await db
      .select({
        id: songs.id,
        title: songs.title,
        durationSeconds: songs.durationSeconds,
        albumId: songs.albumId,
        albumTitle: albums.title,
        artistName: artistProfiles.stageName,
        deletedAt: songs.deletedAt,
        rawAudioKey: songs.rawAudioKey,
      })
      .from(songs)
      .innerJoin(artistProfiles, eq(songs.artistId, artistProfiles.id))
      .leftJoin(albums, eq(songs.albumId, albums.id))
      .where(
        and(
          eq(songs.uploaderUserId, userId),
          eq(songs.scope, 'PERSONAL'),
          isNotNull(songs.deletedAt),
        ),
      )
      .orderBy(desc(songs.deletedAt))

    const trashedAlbums = await db
      .select({
        id: albums.id,
        title: albums.title,
        albumType: albums.albumType,
        coverImageUrl: albums.coverImageUrl,
        deletedAt: albums.deletedAt,
        totalTracks: albums.totalTracks,
        artistName: artistProfiles.stageName,
      })
      .from(albums)
      .innerJoin(artistProfiles, eq(albums.artistId, artistProfiles.id))
      .where(
        and(
          eq(albums.uploaderUserId, userId),
          eq(albums.scope, 'PERSONAL'),
          isNotNull(albums.deletedAt),
        ),
      )
      .orderBy(desc(albums.deletedAt))

    return {
      songs: trashedSongs,
      releases: trashedAlbums,
    }
  }

  /**
   * Restores a soft-deleted personal song from the recycle bin back to the active collection.
   * Performs personal quota validation.
   */
  async restorePersonalSong(userId: string, songId: string) {
    const [song] = await db
      .select()
      .from(songs)
      .where(
        and(
          eq(songs.id, songId),
          eq(songs.uploaderUserId, userId),
          eq(songs.scope, 'PERSONAL'),
          isNotNull(songs.deletedAt),
        ),
      )
      .limit(1)

    if (!song) {
      throw new Error('Song not found in recycle bin')
    }

    // 1. Quota check: ensure user has at least 1 free slot
    const quota = await this.getLockerQuota(userId)
    if (quota.usedSongs + 1 > quota.maxSongs) {
      throw new Error(
        `Cannot restore song: personal collection quota exceeded (${quota.usedSongs}/${quota.maxSongs} slots used)`
      )
    }

    await db.transaction(async (tx) => {
      // 2. Restore the song
      await tx.update(songs).set({ deletedAt: null }).where(eq(songs.id, songId))

      // 3. If part of an album, ensure album is restored & update metadata
      if (song.albumId) {
        const [album] = await tx
          .select()
          .from(albums)
          .where(eq(albums.id, song.albumId))
          .limit(1)

        if (album && album.deletedAt) {
          await tx
            .update(albums)
            .set({ deletedAt: null })
            .where(eq(albums.id, song.albumId))
        }

        const activeSongs = await tx
          .select({ durationSeconds: songs.durationSeconds })
          .from(songs)
          .where(and(eq(songs.albumId, song.albumId), isNull(songs.deletedAt)))

        const totalDuration = activeSongs.reduce(
          (acc, s) => acc + (s.durationSeconds || 0),
          0,
        )

        await tx
          .update(albums)
          .set({
            totalTracks: activeSongs.length,
            totalDurationSeconds: totalDuration,
          })
          .where(eq(albums.id, song.albumId))
      }
    })

    await cacheManager.invalidate(cacheKeys.catalog.song(songId))
    if (song.albumId) {
      await cacheManager.invalidate(cacheKeys.catalog.album(song.albumId))
    }
    if (song.artistId) {
      await cacheManager.invalidate(cacheKeys.catalog.artist(song.artistId))
    }
    await playlistsCacheService.invalidatePlaylistsForSongs([songId])

    return { success: true, message: 'Song restored to personal collection' }
  }

  /**
   * Restores an entire soft-deleted personal release and its trashed tracks.
   * Performs batch quota validation.
   */
  async restorePersonalRelease(userId: string, albumId: string) {
    const [album] = await db
      .select()
      .from(albums)
      .where(
        and(
          eq(albums.id, albumId),
          eq(albums.uploaderUserId, userId),
          eq(albums.scope, 'PERSONAL'),
          isNotNull(albums.deletedAt),
        ),
      )
      .limit(1)

    if (!album) {
      throw new Error('Release not found in recycle bin')
    }

    // Find all soft-deleted tracks belonging to this album
    const trashedTracks = await db
      .select({
        id: songs.id,
        durationSeconds: songs.durationSeconds,
      })
      .from(songs)
      .where(
        and(
          eq(songs.albumId, albumId),
          eq(songs.uploaderUserId, userId),
          isNotNull(songs.deletedAt),
        ),
      )

    // Quota validation for restoring all trashed tracks
    const quota = await this.getLockerQuota(userId)
    if (quota.usedSongs + trashedTracks.length > quota.maxSongs) {
      throw new Error(
        `Cannot restore release: restoring ${trashedTracks.length} song(s) would exceed your quota (${quota.usedSongs}/${quota.maxSongs} slots used)`
      )
    }

    await db.transaction(async (tx) => {
      // 1. Restore the album
      await tx
        .update(albums)
        .set({ deletedAt: null })
        .where(eq(albums.id, albumId))

      // 2. Restore all soft-deleted tracks in this album
      if (trashedTracks.length > 0) {
        await tx
          .update(songs)
          .set({ deletedAt: null })
          .where(
            and(
              eq(songs.albumId, albumId),
              eq(songs.uploaderUserId, userId),
              isNotNull(songs.deletedAt),
            ),
          )
      }

      // 3. Recalculate totals
      const activeSongs = await tx
        .select({ durationSeconds: songs.durationSeconds })
        .from(songs)
        .where(and(eq(songs.albumId, albumId), isNull(songs.deletedAt)))

      const totalDuration = activeSongs.reduce(
        (acc, s) => acc + (s.durationSeconds || 0),
        0,
      )

      await tx
        .update(albums)
        .set({
          totalTracks: activeSongs.length,
          totalDurationSeconds: totalDuration,
        })
        .where(eq(albums.id, albumId))
    })

    await cacheManager.invalidate(cacheKeys.catalog.album(albumId))
    if (album.artistId) {
      await cacheManager.invalidate(cacheKeys.catalog.artist(album.artistId))
    }
    for (const track of trashedTracks) {
      await cacheManager.invalidate(cacheKeys.catalog.song(track.id))
    }
    if (trashedTracks.length > 0) {
      await playlistsCacheService.invalidatePlaylistsForSongs(trashedTracks.map((t) => t.id))
    }

    return {
      success: true,
      message: `Release restored with ${trashedTracks.length} track(s)`,
    }
  }

  /**
   * Permanently deletes a personal song from PostgreSQL and Cloudflare R2 storage.
   */
  async permanentlyDeletePersonalSong(userId: string, songId: string) {
    const [song] = await db
      .select()
      .from(songs)
      .where(
        and(
          eq(songs.id, songId),
          eq(songs.uploaderUserId, userId),
          eq(songs.scope, 'PERSONAL'),
        ),
      )
      .limit(1)

    if (!song) {
      throw new Error('Song not found in your personal collection')
    }

    // Identify candidate personal artists (primary & collaborators) for cleanup
    const songCreditsRows = await db
      .select({ artistId: songCredits.artistId })
      .from(songCredits)
      .where(eq(songCredits.songId, songId))
    const candidateArtistIds = [
      song.artistId,
      ...songCreditsRows.map((r) => r.artistId),
    ].filter(Boolean) as string[]

    // 1. Delete raw audio from Cloudflare R2
    if (song.rawAudioKey) {
      await this.deleteObject(song.rawAudioKey)
    }

    // 2. Delete database records in transaction
    await db.transaction(async (tx) => {
      await tx.delete(songCredits).where(eq(songCredits.songId, songId))
      await tx.delete(songs).where(eq(songs.id, songId))

      // If part of an album, update remaining track count & duration
      if (song.albumId) {
        const remainingActive = await tx
          .select({ durationSeconds: songs.durationSeconds })
          .from(songs)
          .where(and(eq(songs.albumId, song.albumId), isNull(songs.deletedAt)))

        const anyTracksLeft = await tx
          .select({ id: songs.id })
          .from(songs)
          .where(eq(songs.albumId, song.albumId))
          .limit(1)

        if (anyTracksLeft.length === 0) {
          await tx.delete(albums).where(eq(albums.id, song.albumId))
        } else {
          const totalDuration = remainingActive.reduce(
            (acc, s) => acc + (s.durationSeconds || 0),
            0,
          )
          await tx
            .update(albums)
            .set({
              totalTracks: remainingActive.length,
              totalDurationSeconds: totalDuration,
            })
            .where(eq(albums.id, song.albumId))
        }
      }

      // Cleanup any sandboxed personal artists that now have 0 songs, 0 credits, and 0 albums
      await cleanupOrphanedPersonalArtists(tx, userId, candidateArtistIds)
    })

    await cacheManager.invalidate(cacheKeys.catalog.song(songId))
    if (song.albumId) {
      await cacheManager.invalidate(cacheKeys.catalog.album(song.albumId))
    }
    for (const aId of candidateArtistIds) {
      await cacheManager.invalidate(cacheKeys.catalog.artist(aId))
    }
    await playlistsCacheService.invalidatePlaylistsForSongs([songId])

    return {
      success: true,
      message: 'Song permanently deleted from storage and collection',
    }
  }

  /**
   * Permanently deletes a personal release and all its tracks from PostgreSQL and R2.
   */
  async permanentlyDeletePersonalRelease(userId: string, albumId: string) {
    const [album] = await db
      .select()
      .from(albums)
      .where(
        and(
          eq(albums.id, albumId),
          eq(albums.uploaderUserId, userId),
          eq(albums.scope, 'PERSONAL'),
        ),
      )
      .limit(1)

    if (!album) {
      throw new Error('Release not found in your personal collection')
    }

    const albumSongs = await db
      .select({ id: songs.id, rawAudioKey: songs.rawAudioKey, artistId: songs.artistId })
      .from(songs)
      .where(eq(songs.albumId, albumId))

    const songIds = albumSongs.map((s) => s.id)
    let candidateArtistIds = [
      album.artistId,
      ...albumSongs.map((s) => s.artistId),
    ].filter(Boolean) as string[]

    if (songIds.length > 0) {
      const credits = await db
        .select({ artistId: songCredits.artistId })
        .from(songCredits)
        .where(inArray(songCredits.songId, songIds))
      candidateArtistIds = [
        ...candidateArtistIds,
        ...credits.map((c) => c.artistId),
      ]
    }

    // 1. Delete all audio files from R2
    for (const song of albumSongs) {
      if (song.rawAudioKey) {
        await this.deleteObject(song.rawAudioKey)
      }
    }

    // 2. Delete database records in transaction
    await db.transaction(async (tx) => {
      if (songIds.length > 0) {
        await tx.delete(songCredits).where(inArray(songCredits.songId, songIds))
        await tx.delete(songs).where(eq(songs.albumId, albumId))
      }
      await tx.delete(albums).where(eq(albums.id, albumId))

      // Cleanup any sandboxed personal artists that now have 0 songs, 0 credits, and 0 albums
      await cleanupOrphanedPersonalArtists(tx, userId, candidateArtistIds)
    })

    await cacheManager.invalidate(cacheKeys.catalog.album(albumId))
    for (const song of albumSongs) {
      await cacheManager.invalidate(cacheKeys.catalog.song(song.id))
    }
    for (const aId of candidateArtistIds) {
      await cacheManager.invalidate(cacheKeys.catalog.artist(aId))
    }
    if (albumSongs.length > 0) {
      await playlistsCacheService.invalidatePlaylistsForSongs(albumSongs.map((s) => s.id))
    }

    return {
      success: true,
      message: `Release and ${albumSongs.length} track(s) permanently deleted`,
    }
  }

  /**
   * Permanently deletes all soft-deleted songs and releases in the user's trash.
   */
  async emptyPersonalTrash(userId: string) {
    const trashedSongs = await db
      .select({
        id: songs.id,
        rawAudioKey: songs.rawAudioKey,
        albumId: songs.albumId,
        artistId: songs.artistId,
      })
      .from(songs)
      .where(
        and(
          eq(songs.uploaderUserId, userId),
          eq(songs.scope, 'PERSONAL'),
          isNotNull(songs.deletedAt),
        ),
      )

    const trashedAlbums = await db
      .select({ id: albums.id, artistId: albums.artistId })
      .from(albums)
      .where(
        and(
          eq(albums.uploaderUserId, userId),
          eq(albums.scope, 'PERSONAL'),
          isNotNull(albums.deletedAt),
        ),
      )

    const songIds = trashedSongs.map((s) => s.id)
    let candidateArtistIds = [
      ...trashedAlbums.map((a) => a.artistId),
      ...trashedSongs.map((s) => s.artistId),
    ].filter(Boolean) as string[]

    if (songIds.length > 0) {
      const credits = await db
        .select({ artistId: songCredits.artistId })
        .from(songCredits)
        .where(inArray(songCredits.songId, songIds))
      candidateArtistIds = [
        ...candidateArtistIds,
        ...credits.map((c) => c.artistId),
      ]
    }

    // 1. Purge all R2 files
    for (const song of trashedSongs) {
      if (song.rawAudioKey) {
        await this.deleteObject(song.rawAudioKey)
      }
    }

    // 2. Delete in database transaction
    await db.transaction(async (tx) => {
      if (songIds.length > 0) {
        await tx.delete(songCredits).where(inArray(songCredits.songId, songIds))
        await tx.delete(songs).where(inArray(songs.id, songIds))
      }

      const albumIds = trashedAlbums.map((a) => a.id)
      if (albumIds.length > 0) {
        await tx.delete(albums).where(inArray(albums.id, albumIds))
      }

      // Cleanup any sandboxed personal artists that now have 0 songs, 0 credits, and 0 albums
      await cleanupOrphanedPersonalArtists(tx, userId, candidateArtistIds)
    })

    // Invalidate caches
    for (const song of trashedSongs) {
      await cacheManager.invalidate(cacheKeys.catalog.song(song.id))
    }
    for (const album of trashedAlbums) {
      await cacheManager.invalidate(cacheKeys.catalog.album(album.id))
    }
    for (const aId of candidateArtistIds) {
      await cacheManager.invalidate(cacheKeys.catalog.artist(aId))
    }
    if (trashedSongs.length > 0) {
      await playlistsCacheService.invalidatePlaylistsForSongs(trashedSongs.map((s) => s.id))
    }

    return {
      success: true,
      message: 'Trash emptied successfully',
      deletedSongsCount: trashedSongs.length,
      deletedReleasesCount: trashedAlbums.length,
    }
  }

  /**
   * Retrieves all personal artists created by the user with their release and track counts.
   */
  async getUserPersonalArtists(userId: string, query?: PersonalArtistsQuery) {
    const isPaginated = Boolean(query?.page && query?.limit)
    const page = query?.page ?? 1
    const limit = query?.limit ?? 50
    const offset = (page - 1) * limit

    const releaseCountExpr = sql<number>`(
      SELECT count(*)::int
      FROM "albums"
      WHERE "albums"."artist_id" = "artist_profiles"."id"
        AND "albums"."uploader_user_id" = ${userId}
        AND "albums"."scope" = 'PERSONAL'
        AND "albums"."deleted_at" IS NULL
    )`

    const trackCountExpr = sql<number>`(
      SELECT count(DISTINCT s_id)::int
      FROM (
        SELECT "song_credits"."song_id" AS s_id
        FROM "song_credits"
        INNER JOIN "songs" ON "songs"."id" = "song_credits"."song_id"
        WHERE "song_credits"."artist_id" = "artist_profiles"."id"
          AND "songs"."uploader_user_id" = ${userId}
          AND "songs"."scope" = 'PERSONAL'
          AND "songs"."deleted_at" IS NULL
        UNION
        SELECT "songs"."id" AS s_id
        FROM "songs"
        WHERE "songs"."artist_id" = "artist_profiles"."id"
          AND "songs"."uploader_user_id" = ${userId}
          AND "songs"."scope" = 'PERSONAL'
          AND "songs"."deleted_at" IS NULL
      ) t_sub
    )`

    const conditions = [
      eq(artistProfiles.ownerUserId, userId),
      eq(artistProfiles.scope, 'PERSONAL'),
    ]

    if (query?.search && query.search.trim()) {
      conditions.push(ilike(artistProfiles.stageName, `%${query.search.trim()}%`))
    }

    const whereClause = and(...conditions)

    const sort = query?.sort ?? 'name'
    const defaultDir = sort === 'name' ? 'asc' : 'desc'
    const isAsc = (query?.order ?? defaultDir) === 'asc'

    let orderByClause
    if (sort === 'releases') {
      orderByClause = isAsc
        ? [asc(releaseCountExpr), asc(artistProfiles.stageName), asc(artistProfiles.id)]
        : [desc(releaseCountExpr), asc(artistProfiles.stageName), asc(artistProfiles.id)]
    } else if (sort === 'tracks') {
      orderByClause = isAsc
        ? [asc(trackCountExpr), asc(artistProfiles.stageName), asc(artistProfiles.id)]
        : [desc(trackCountExpr), asc(artistProfiles.stageName), asc(artistProfiles.id)]
    } else if (sort === 'recent') {
      orderByClause = isAsc
        ? [asc(artistProfiles.createdAt), asc(artistProfiles.id)]
        : [desc(artistProfiles.createdAt), desc(artistProfiles.id)]
    } else {
      // Default: name
      orderByClause = isAsc
        ? [asc(artistProfiles.stageName), asc(artistProfiles.id)]
        : [desc(artistProfiles.stageName), desc(artistProfiles.id)]
    }

    if (isPaginated) {
      const [countRes, artists] = await Promise.all([
        db
          .select({ total: sql<number>`count(*)::int` })
          .from(artistProfiles)
          .where(whereClause),
        db
          .select({
            id: artistProfiles.id,
            stageName: artistProfiles.stageName,
            slug: artistProfiles.slug,
            bio: artistProfiles.bio,
            bannerUrl: artistProfiles.bannerUrl,
            avatarUrl: artistProfiles.avatarUrl,
            createdAt: artistProfiles.createdAt,
            releaseCount: releaseCountExpr,
            trackCount: trackCountExpr,
          })
          .from(artistProfiles)
          .where(whereClause)
          .orderBy(...orderByClause)
          .limit(limit)
          .offset(offset),
      ])

      const total = countRes[0]?.total ?? 0
      return {
        artists,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      }
    }

    const artists = await db
      .select({
        id: artistProfiles.id,
        stageName: artistProfiles.stageName,
        slug: artistProfiles.slug,
        bio: artistProfiles.bio,
        bannerUrl: artistProfiles.bannerUrl,
        avatarUrl: artistProfiles.avatarUrl,
        createdAt: artistProfiles.createdAt,
        releaseCount: releaseCountExpr,
        trackCount: trackCountExpr,
      })
      .from(artistProfiles)
      .where(whereClause)
      .orderBy(...orderByClause)

    return { artists }
  }

  /**
   * Retrieves flat personal tracks for direct playback or shuffle.
   */
  async getUserPersonalTracks(userId: string, query: PersonalTracksQuery) {
    const conditions = [
      eq(songs.uploaderUserId, userId),
      eq(songs.scope, 'PERSONAL'),
      isNull(songs.deletedAt),
      isNull(albums.deletedAt),
    ]

    if (query.albumType) {
      conditions.push(eq(albums.albumType, query.albumType))
    }

    if (query.search && query.search.trim()) {
      const q = `%${query.search.trim()}%`
      conditions.push(
        or(
          ilike(songs.title, q),
          ilike(albums.title, q),
          ilike(artistProfiles.stageName, q)
        )!
      )
    }

    const whereClause = and(...conditions)
    const limit = Math.min(query.limit ?? 200, 500)

    const rows = await db
      .select({
        id: songs.id,
        title: songs.title,
        slug: songs.slug,
        durationSeconds: songs.durationSeconds,
        audioUrl: songs.audioUrl,
        hlsManifestUrl: songs.hlsManifestUrl,
        rawAudioKey: songs.rawAudioKey,
        coverImageUrl: songs.coverImageUrl,
        isExplicit: songs.isExplicit,
        albumId: albums.id,
        albumTitle: albums.title,
        albumSlug: albums.slug,
        albumCoverImageUrl: albums.coverImageUrl,
        artistId: artistProfiles.id,
        artistName: artistProfiles.stageName,
        artistSlug: artistProfiles.slug,
      })
      .from(songs)
      .innerJoin(albums, eq(songs.albumId, albums.id))
      .innerJoin(artistProfiles, eq(songs.artistId, artistProfiles.id))
      .where(whereClause)
      .orderBy(query.shuffle ? sql`RANDOM()` : desc(songs.createdAt))
      .limit(limit)

    const tracks = rows.map((r) => ({
      id: r.id,
      title: r.title,
      artistId: r.artistId || '',
      artistName: r.artistName || 'Personal Artist',
      artistSlug: r.artistSlug,
      albumId: r.albumId,
      albumTitle: r.albumTitle,
      albumSlug: r.albumSlug,
      durationSeconds: r.durationSeconds || 0,
      audioUrl: r.audioUrl || '',
      hlsManifestUrl: r.hlsManifestUrl || undefined,
      rawAudioKey: r.rawAudioKey,
      coverImageUrl: r.coverImageUrl || r.albumCoverImageUrl,
      scope: 'PERSONAL' as const,
      isStreamable: true,
      isExplicit: r.isExplicit,
    }))

    return { tracks }
  }

  /**
   * Creates a new personal sandboxed artist for the user.
   */
  async createPersonalArtist(
    userId: string,
    input: { stageName: string; bio?: string | null },
  ) {
    const cleanName = input.stageName.trim()
    if (!cleanName) {
      throw new Error('Artist name is required')
    }

    const [existing] = await db
      .select()
      .from(artistProfiles)
      .where(
        and(
          eq(artistProfiles.ownerUserId, userId),
          eq(artistProfiles.scope, 'PERSONAL'),
          ilike(artistProfiles.stageName, cleanName),
        ),
      )
      .limit(1)

    if (existing) {
      return { artist: existing, isExisting: true }
    }

    const slug = generateScopedSlug(cleanName, userId)
    const [created] = await db
      .insert(artistProfiles)
      .values({
        ownerUserId: userId,
        userId: null,
        scope: 'PERSONAL',
        stageName: cleanName,
        slug,
        bio: input.bio || null,
        verified: false,
        verificationStatus: 'NONE',
      })
      .returning()

    return { artist: created, isExisting: false }
  }
}
