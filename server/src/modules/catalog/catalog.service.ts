import {
  eq,
  sql,
  and,
  or,
  ilike,
  desc,
  asc,
  count,
  isNull,
  isNotNull,
  inArray,
  lte,
  gt,
} from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "../../db";
import {
  albums,
  songs,
  songCredits,
  albumLikes,
  songLikes,
  artistProfiles,
  releasePresaves,
  outboxEvents,
  users,
} from "../../db/schema";
import { redis } from "../../index";
import {
  scheduleReleaseJob,
  cancelScheduledReleaseJob,
} from "./catalog.queue";
import { enqueueTranscodeJob } from "../../lib/queue/transcode.queue";
import type {
  CreateAlbumInput,
  UpdateAlbumInput,
  CreateSongInput,
  UpdateSongInput,
  SearchAlbumsQuery,
  SearchSongsQuery,
} from "./catalog.schemas";
import { slugify } from "../artists/artists.service";
import { cacheManager, cacheKeys, likesCacheService, presavesCacheService, playlistsCacheService } from "../../lib/cache";

import { StorageService } from "../storage/storage.service";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractR2KeyFromUrl(urlOrKey: string | null | undefined): string | null {
  if (!urlOrKey) return null;
  if (!urlOrKey.startsWith("http://") && !urlOrKey.startsWith("https://")) {
    return urlOrKey;
  }
  try {
    const parsed = new URL(urlOrKey);
    const key = parsed.pathname.replace(/^\/+/, "");
    return key || null;
  } catch {
    return null;
  }
}

export class CatalogService {
  private storageService = new StorageService();

  private get cdnBaseUrl(): string {
    const raw =
      process.env.CDN_BASE_URL ||
      "https://pub-d2ff94b6e6924c22875a6799aa101a70.r2.dev";
    return raw.replace(/\/+$/, "");
  }

  /**
   * Guarantees that stored media references are full, valid CDN URLs rather than raw bucket keys.
   */
  ensureFullUrl(pathOrUrl: string | null | undefined): string | null {
    if (!pathOrUrl) return null;
    const trimmed = pathOrUrl.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return trimmed;
    }
    const cleanKey = trimmed.replace(/^\/+/, "");
    return `${this.cdnBaseUrl}/${cleanKey}`;
  }

  /**
   * Generates a unique slug for an album, resolving collisions with numbers.
   */
  async generateUniqueAlbumSlug(
    baseText: string,
    currentAlbumId?: string
  ): Promise<string> {
    const baseSlug = slugify(baseText) || "album";
    let candidate = baseSlug;
    let counter = 1;

    while (true) {
      const existing = await db
        .select({ id: albums.id })
        .from(albums)
        .where(eq(albums.slug, candidate))
        .limit(1);

      if (
        existing.length === 0 ||
        (currentAlbumId && existing[0].id === currentAlbumId)
      ) {
        return candidate;
      }

      counter++;
      candidate = `${baseSlug}-${counter}`;
    }
  }

  /**
   * Generates a unique slug for a song, resolving collisions with numbers.
   * Checks both database collisions (matching constraint: (artistId, slug) WHERE deletedAt IS NULL)
   * and in-memory collisions within the current batch.
   */
  async generateUniqueSongSlug(
    baseText: string,
    currentSongIdOrOptions?:
      | string
      | {
          currentSongId?: string;
          artistId?: string;
          usedSlugs?: Set<string>;
          executor?: any;
        }
  ): Promise<string> {
    const options =
      typeof currentSongIdOrOptions === "string"
        ? { currentSongId: currentSongIdOrOptions }
        : currentSongIdOrOptions;

    const baseSlug = slugify(baseText) || "track";
    let candidate = baseSlug;
    let counter = 1;
    const executor = options?.executor || db;

    while (true) {
      // 1. Check in-memory batch collisions first
      if (options?.usedSlugs && options.usedSlugs.has(candidate)) {
        counter++;
        candidate = `${baseSlug}-${counter}`;
        continue;
      }

      // 2. Check database collisions matching unique index: (artistId, slug) WHERE deletedAt IS NULL
      const condition = options?.artistId
        ? and(
            eq(songs.artistId, options.artistId),
            eq(songs.slug, candidate),
            isNull(songs.deletedAt)
          )
        : and(
            eq(songs.slug, candidate),
            isNull(songs.deletedAt)
          );

      const existing = await executor
        .select({ id: songs.id })
        .from(songs)
        .where(condition)
        .limit(1);

      if (
        existing.length === 0 ||
        (options?.currentSongId && existing[0].id === options.currentSongId)
      ) {
        if (options?.usedSlugs) {
          options.usedSlugs.add(candidate);
        }
        return candidate;
      }

      counter++;
      candidate = `${baseSlug}-${counter}`;
    }
  }


  /**
   * Resolves the artist profile belonging to a user.
   */
  private async getArtistByUserId(userId: string) {
    const [artist] = await db
      .select()
      .from(artistProfiles)
      .where(eq(artistProfiles.userId, userId))
      .limit(1);

    if (!artist) {
      throw new Error("You must establish an artist profile before publishing music");
    }

    return artist;
  }

  // =========================================================================
  // ALBUM OPERATIONS
  // =========================================================================

  /**
   * Creates a new album (and optionally initial tracks with multi-artist credits).
   */
  async createAlbum(userId: string, input: CreateAlbumInput) {
    const artist = await this.getArtistByUserId(userId);
    const finalSlug = await this.generateUniqueAlbumSlug(
      input.slug || input.title
    );

    const isScheduled = input.scheduledReleaseAt
      ? new Date(input.scheduledReleaseAt).getTime() > Date.now()
      : false;

    const scheduledDate = isScheduled ? new Date(input.scheduledReleaseAt!) : null;
    const publishedDate = isScheduled ? null : new Date();
    const releaseDateDay = scheduledDate
      ? scheduledDate.toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0];

    const visibility = input.visibility ?? "PUBLIC";
    const shareToken =
      visibility === "UNLISTED" ? randomBytes(16).toString("hex") : null;

    const pendingTranscodeJobs: Array<{
      songId: string;
      rawAudioKey: string;
      title: string;
      artistId: string;
    }> = [];

    // Intra-release payload validation & deduplication checks
    if (input.tracks && input.tracks.length > 0) {
      const seenAudioKeys = new Set<string>();
      const seenTrackSignatures = new Set<string>();
      const seenTrackPositions = new Set<string>();

      for (let idx = 0; idx < input.tracks.length; idx++) {
        const t = input.tracks[idx];

        // 1. Validate audio uniqueness within release
        const audioRef = t.rawAudioKey || t.audioUrl;
        if (audioRef) {
          if (seenAudioKeys.has(audioRef)) {
            throw new Error(
              `Duplicate audio recording detected in release: '${t.title || "Untitled"}' references the same audio file as another track.`
            );
          }
          seenAudioKeys.add(audioRef);
        }

        // 2. Validate track numbering within same disc
        const discNum = t.discNumber ?? 1;
        const trackNum = t.trackNumber ?? idx + 1;
        const posKey = `${discNum}:${trackNum}`;
        if (seenTrackPositions.has(posKey)) {
          throw new Error(
            `Duplicate track position detected: Disc ${discNum}, Track ${trackNum}.`
          );
        }
        seenTrackPositions.add(posKey);

        // 3. Validate exact metadata duplication (same title & duration > 0) within same release
        const normTitle = (t.title || "").trim().toLowerCase();
        const dur = t.durationSeconds || 0;
        if (normTitle && dur > 0) {
          const sig = `${normTitle}::${dur}`;
          if (seenTrackSignatures.has(sig)) {
            throw new Error(
              `Duplicate track detected in release payload: '${t.title}' appears more than once with identical duration.`
            );
          }
          seenTrackSignatures.add(sig);
        }
      }
    }

    const result = await db.transaction(async (tx) => {
      const albumCoverUrl = this.ensureFullUrl(input.coverImageUrl)!;

      // 1. Insert album
      const [newAlbum] = await tx
        .insert(albums)
        .values({
          artistId: artist.id,
          title: input.title,
          slug: finalSlug,
          albumType: input.albumType,
          coverImageUrl: albumCoverUrl,
          description: input.description ?? null,
          genre: input.genre ?? (input.tracks?.[0]?.genre ?? null),
          releaseDate: releaseDateDay,
          status: isScheduled ? "SCHEDULED" : "PUBLISHED",
          visibility,
          allowComments: input.allowComments ?? true,
          scheduledReleaseAt: scheduledDate,
          publishedAt: publishedDate,
          shareToken,
          preSavesCount: 0,
          likesCount: 0,
          totalTracks: input.tracks?.length ?? 0,
          totalDurationSeconds: 0,
        })
        .returning();

      let totalDuration = 0;
      const createdTracks = [];

      // 2. Insert initial tracks if supplied
      if (input.tracks && input.tracks.length > 0) {
        const usedSongSlugs = new Set<string>();

        for (let idx = 0; idx < input.tracks.length; idx++) {
          const trackInput = input.tracks[idx];
          const trackNumber = trackInput.trackNumber ?? idx + 1;
          const baseSlugText = trackInput.slug || trackInput.title;
          const songSlug = await this.generateUniqueSongSlug(baseSlugText, {
            artistId: artist.id,
            usedSlugs: usedSongSlugs,
            executor: tx,
          });

          const trackAudioUrl = this.ensureFullUrl(
            trackInput.audioUrl || trackInput.rawAudioKey
          );

          const trackCoverUrl =
            this.ensureFullUrl(trackInput.coverImageUrl) || albumCoverUrl;

          const [newSong] = await tx
            .insert(songs)
            .values({
              artistId: artist.id,
              albumId: newAlbum.id,
              title: trackInput.title,
              slug: songSlug,
              genre: trackInput.genre ?? null,
              durationSeconds: trackInput.durationSeconds,
              trackNumber,
              discNumber: trackInput.discNumber ?? 1,
              isExplicit: trackInput.isExplicit ?? false,
              allowComments: trackInput.allowComments ?? true,
              rawAudioKey: trackInput.rawAudioKey ?? null,
              audioUrl: trackAudioUrl,
              coverImageUrl: trackCoverUrl,
              processingStatus: trackInput.rawAudioKey ? "PENDING" : trackAudioUrl ? "READY" : "PENDING",
            })
            .returning();

          if (trackInput.rawAudioKey) {
            await tx.insert(outboxEvents).values({
              aggregateType: "SONG",
              aggregateId: newSong.id,
              eventType: "SONG_UPLOADED",
              payload: {
                songId: newSong.id,
                rawAudioKey: trackInput.rawAudioKey,
                title: newSong.title,
                artistId: artist.id,
              },
            });
            pendingTranscodeJobs.push({
              songId: newSong.id,
              rawAudioKey: trackInput.rawAudioKey,
              title: newSong.title,
              artistId: artist.id,
            });
          }

          totalDuration += trackInput.durationSeconds;

          // Add primary artist credit
          await tx.insert(songCredits).values({
            songId: newSong.id,
            artistId: artist.id,
            role: "PRIMARY",
          });

          // Add additional credits if provided
          if (trackInput.credits && trackInput.credits.length > 0) {
            for (const cred of trackInput.credits) {
              if (cred.artistId !== artist.id) {
                await tx
                  .insert(songCredits)
                  .values({
                    songId: newSong.id,
                    artistId: cred.artistId,
                    role: cred.role,
                  })
                  .onConflictDoNothing();
              }
            }
          }

          createdTracks.push(newSong);
        }

        // Update aggregated total duration
        await tx
          .update(albums)
          .set({ totalDurationSeconds: totalDuration })
          .where(eq(albums.id, newAlbum.id));
      }

      return {
        ...newAlbum,
        totalDurationSeconds: totalDuration,
        tracks: createdTracks,
      };
    });

    // Dispatch optimistic fast-path transcode jobs
    for (const job of pendingTranscodeJobs) {
      enqueueTranscodeJob(job)
        .then(async () => {
          await db
            .update(outboxEvents)
            .set({ publishedAt: new Date() })
            .where(
              and(
                eq(outboxEvents.aggregateId, job.songId),
                eq(outboxEvents.eventType, "SONG_UPLOADED")
              )
            );
        })
        .catch((err) => {
          console.warn(
            `[Catalog] Fast-path enqueue failed for song ${job.songId}:`,
            err.message
          );
        });
    }

    if (isScheduled) {
      await scheduleReleaseJob(result);
    }

    await cacheManager.invalidateAlbum({
      id: result.id,
      slug: result.slug,
      artistId: result.artistId,
    });

    return result;
  }

  /**
   * Retrieves or loads from Redis cache the public canonical album record (metadata, tracks, credits).
   * Cached for 10 minutes (600s).
   */
  async getPublicAlbum(idOrSlug: string) {
    const isUUID = UUID_REGEX.test(idOrSlug);
    const cacheKey = isUUID
      ? cacheKeys.catalog.album(idOrSlug)
      : cacheKeys.catalog.albumSlug(idOrSlug);

    return await cacheManager.getOrSet(
      cacheKey,
      async () => {
        const [album] = await db
          .select({
            id: albums.id,
            artistId: albums.artistId,
            title: albums.title,
            slug: albums.slug,
            albumType: albums.albumType,
            coverImageUrl: albums.coverImageUrl,
            description: albums.description,
            genre: albums.genre,
            releaseDate: albums.releaseDate,
            status: albums.status,
            visibility: albums.visibility,
            scheduledReleaseAt: albums.scheduledReleaseAt,
            publishedAt: albums.publishedAt,
            shareToken: albums.shareToken,
            allowComments: albums.allowComments,
            preSavesCount: albums.preSavesCount,
            likesCount: albums.likesCount,
            totalTracks: albums.totalTracks,
            totalDurationSeconds: albums.totalDurationSeconds,
            createdAt: albums.createdAt,
            updatedAt: albums.updatedAt,
            scope: albums.scope,
            uploaderUserId: albums.uploaderUserId,
            artistUserId: artistProfiles.userId,
            artistStageName: artistProfiles.stageName,
            artistSlug: artistProfiles.slug,
            artistVerified: artistProfiles.verified,
            artistBannerUrl: artistProfiles.bannerUrl,
          })
          .from(albums)
          .innerJoin(artistProfiles, eq(albums.artistId, artistProfiles.id))
          .where(
            and(
              isUUID ? eq(albums.id, idOrSlug) : eq(albums.slug, idOrSlug),
              isNull(albums.deletedAt)
            )
          )
          .limit(1);

        if (!album) return null;

        // Fetch tracks for the album
        const albumSongs = await db
          .select({
            id: songs.id,
            artistId: songs.artistId,
            albumId: songs.albumId,
            title: songs.title,
            slug: songs.slug,
            genre: songs.genre,
            durationSeconds: songs.durationSeconds,
            trackNumber: songs.trackNumber,
            discNumber: songs.discNumber,
            isExplicit: songs.isExplicit,
            allowComments: songs.allowComments,
            rawAudioKey: songs.rawAudioKey,
            audioUrl: songs.audioUrl,
            hlsManifestUrl: songs.hlsManifestUrl,
            processingStatus: songs.processingStatus,
            playsCount: songs.playsCount,
            likesCount: songs.likesCount,
            scope: songs.scope,
            uploaderUserId: songs.uploaderUserId,
            createdAt: songs.createdAt,
          })
          .from(songs)
          .where(and(eq(songs.albumId, album.id), isNull(songs.deletedAt)))
          .orderBy(asc(songs.discNumber), asc(songs.trackNumber), asc(songs.createdAt));

        const songIds = albumSongs.map((s) => s.id);
        let allCredits: Array<{
          songId: string;
          artistId: string;
          stageName: string;
          slug: string;
          verified: boolean;
          role: typeof songCredits.$inferSelect["role"];
        }> = [];

        if (songIds.length > 0) {
          allCredits = await db
            .select({
              songId: songCredits.songId,
              artistId: songCredits.artistId,
              stageName: artistProfiles.stageName,
              slug: artistProfiles.slug,
              verified: artistProfiles.verified,
              role: songCredits.role,
            })
            .from(songCredits)
            .innerJoin(artistProfiles, eq(songCredits.artistId, artistProfiles.id))
            .where(inArray(songCredits.songId, songIds));
        }

        const tracksWithCredits = albumSongs.map((song) => ({
          ...song,
          credits: allCredits.filter((c) => c.songId === song.id),
        }));

        const result = {
          ...album,
          tracks: tracksWithCredits,
        };

        // Warm secondary lookup key (if queried by slug, warm ID; if queried by ID, warm slug)
        if (isUUID && album.slug) {
          await cacheManager.set(cacheKeys.catalog.albumSlug(album.slug), result, 600);
        } else if (!isUUID && album.id) {
          await cacheManager.set(cacheKeys.catalog.album(album.id), result, 600);
        }

        return result;
      },
      600
    );
  }

  /**
   * Retrieves an album by UUID or slug, with tracklist and credit details.
   */
  async getAlbumByIdOrSlug(
    idOrSlug: string,
    currentUserId?: string,
    shareToken?: string
  ) {
    const publicAlbum = await this.getPublicAlbum(idOrSlug);
    if (!publicAlbum) {
      return null;
    }

    const isArtistOwner = !!(currentUserId && publicAlbum.artistUserId === currentUserId);
    const isUploaderOwner = !!(currentUserId && publicAlbum.uploaderUserId === currentUserId);
    const isOwner = isArtistOwner || isUploaderOwner;

    // Personal Locker releases are strictly private to the uploader
    if (publicAlbum.scope === "PERSONAL") {
      if (!isUploaderOwner) {
        return null;
      }
    }

    const isLive =
      publicAlbum.status === "PUBLISHED" ||
      (publicAlbum.status === "SCHEDULED" &&
        publicAlbum.scheduledReleaseAt &&
        new Date(publicAlbum.scheduledReleaseAt).getTime() <= Date.now());

    // Check visibility permissions
    if (!isOwner) {
      if (publicAlbum.visibility === "PRIVATE") {
        return null;
      }
      if (
        publicAlbum.visibility === "UNLISTED" &&
        (!shareToken || shareToken !== publicAlbum.shareToken)
      ) {
        return null;
      }
    }

    const isUpcoming = publicAlbum.scope === "PERSONAL" ? false : !isLive && !isArtistOwner;

    // Check if current user liked or pre-saved the album via 0.2ms Redis Sets
    let isLiked = false;
    let isPreSaved = false;
    if (currentUserId) {
      isLiked = await likesCacheService.isAlbumLiked(currentUserId, publicAlbum.id);
      isPreSaved = await presavesCacheService.isAlbumPreSaved(currentUserId, publicAlbum.id);
    }

    // High-performance SMISMEMBER enrichment for all tracks (0.2ms, 0 SQL queries)
    const enrichedTracksWithLikes = await likesCacheService.enrichSongsWithLikes(
      currentUserId,
      publicAlbum.tracks
    );

    const enrichedTracks = enrichedTracksWithLikes.map((song) => {
      if (isUpcoming) {
        return {
          ...song,
          rawAudioKey: null,
          audioUrl: null,
          hlsManifestUrl: null,
          isStreamable: false,
        };
      }

      return {
        ...song,
        isStreamable: true,
      };
    });

    return {
      ...publicAlbum,
      isUpcoming,
      isLiked,
      isPreSaved,
      tracks: enrichedTracks,
    };
  }

  /**
   * Updates album metadata.
   */
  async updateAlbum(userId: string, albumId: string, input: UpdateAlbumInput) {
    const artist = await this.getArtistByUserId(userId);

    const [existing] = await db
      .select()
      .from(albums)
      .where(and(eq(albums.id, albumId), eq(albums.artistId, artist.id)))
      .limit(1);

    if (!existing) {
      throw new Error("Album not found or you do not have edit permission");
    }

    let finalSlug = existing.slug;
    if (input.slug && input.slug !== existing.slug) {
      finalSlug = await this.generateUniqueAlbumSlug(input.slug, albumId);
    }

    let isScheduled = existing.status === "SCHEDULED";
    let scheduledDate = existing.scheduledReleaseAt;
    let publishedDate = existing.publishedAt;
    let visibility = existing.visibility;
    let shareToken = existing.shareToken;

    if (input.visibility !== undefined) {
      visibility = input.visibility;
      if (visibility === "UNLISTED" && !shareToken) {
        shareToken = randomBytes(16).toString("hex");
      }
    }

    if (input.scheduledReleaseAt !== undefined) {
      if (
        input.scheduledReleaseAt &&
        new Date(input.scheduledReleaseAt).getTime() > Date.now()
      ) {
        isScheduled = true;
        scheduledDate = new Date(input.scheduledReleaseAt);
        publishedDate = null;
      } else {
        isScheduled = false;
        scheduledDate = null;
        publishedDate = new Date();
      }
    }

    const [updated] = await db
      .update(albums)
      .set({
        ...(input.title ? { title: input.title } : {}),
        slug: finalSlug,
        ...(input.albumType ? { albumType: input.albumType } : {}),
        ...(input.coverImageUrl ? { coverImageUrl: this.ensureFullUrl(input.coverImageUrl)! } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.genre !== undefined ? { genre: input.genre } : {}),
        ...(input.releaseDate ? { releaseDate: input.releaseDate } : {}),
        status: isScheduled ? "SCHEDULED" : "PUBLISHED",
        visibility,
        ...(input.allowComments !== undefined ? { allowComments: input.allowComments } : {}),
        scheduledReleaseAt: scheduledDate,
        publishedAt: publishedDate,
        shareToken,
        updatedAt: new Date(),
      })
      .where(eq(albums.id, albumId))
      .returning();

    if (isScheduled) {
      await scheduleReleaseJob(updated);
    } else {
      await cancelScheduledReleaseJob(albumId);
    }

    await cacheManager.invalidateAlbum({
      id: albumId,
      slug: updated.slug,
      artistId: updated.artistId,
    });
    if (existing.slug && existing.slug !== updated.slug) {
      await cacheManager.invalidate(cacheKeys.catalog.albumSlug(existing.slug));
    }

    return updated;
  }

  /**
   * Soft-deletes an album and all its associated songs (30-day restore window).
   */
  async softDeleteAlbum(userId: string, albumId: string) {
    const artist = await this.getArtistByUserId(userId);

    const [existing] = await db
      .select({ id: albums.id, slug: albums.slug })
      .from(albums)
      .where(and(eq(albums.id, albumId), eq(albums.artistId, artist.id)))
      .limit(1);

    if (!existing) {
      throw new Error("Album not found or you do not have permission");
    }

    const now = new Date();

    const res = await db.transaction(async (tx) => {
      await tx
        .update(albums)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(albums.id, albumId));

      await tx
        .update(songs)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(songs.albumId, albumId));

      return {
        message: "Album and its tracks moved to trash (available for 30-day restore)",
        deletedAt: now.toISOString(),
      };
    });

    await cacheManager.invalidateAlbum({
      id: albumId,
      slug: existing.slug,
      artistId: artist.id,
    });

    const albumSongs = await db
      .select({ id: songs.id })
      .from(songs)
      .where(eq(songs.albumId, albumId));
    if (albumSongs.length > 0) {
      await playlistsCacheService.invalidatePlaylistsForSongs(albumSongs.map((s) => s.id));
    }

    return res;
  }

  /**
   * Restores a soft-deleted album and its tracks.
   */
  async restoreAlbum(userId: string, albumId: string) {
    const artist = await this.getArtistByUserId(userId);

    const [existing] = await db
      .select({ id: albums.id, slug: albums.slug, deletedAt: albums.deletedAt })
      .from(albums)
      .where(and(eq(albums.id, albumId), eq(albums.artistId, artist.id)))
      .limit(1);

    if (!existing) {
      throw new Error("Album not found or you do not have permission");
    }

    const now = new Date();

    const res = await db.transaction(async (tx) => {
      await tx
        .update(albums)
        .set({ deletedAt: null, updatedAt: now })
        .where(eq(albums.id, albumId));

      await tx
        .update(songs)
        .set({ deletedAt: null, updatedAt: now })
        .where(eq(songs.albumId, albumId));

      return { message: "Album and its tracks restored successfully" };
    });

    await cacheManager.invalidateAlbum({
      id: albumId,
      slug: existing.slug,
      artistId: artist.id,
    });

    const albumSongs = await db
      .select({ id: songs.id })
      .from(songs)
      .where(eq(songs.albumId, albumId));
    if (albumSongs.length > 0) {
      await playlistsCacheService.invalidatePlaylistsForSongs(albumSongs.map((s) => s.id));
    }

    return res;
  }

  /**
   * Permanently deletes a global album release and all its associated songs from database and R2 storage.
   */
  async permanentlyDeleteAlbum(userId: string, albumId: string) {
    const artist = await this.getArtistByUserId(userId);

    const [album] = await db
      .select()
      .from(albums)
      .where(and(eq(albums.id, albumId), eq(albums.artistId, artist.id)))
      .limit(1);

    if (!album) {
      throw new Error("Album not found or you do not have permission");
    }

    const albumSongs = await db
      .select({
        id: songs.id,
        rawAudioKey: songs.rawAudioKey,
      })
      .from(songs)
      .where(eq(songs.albumId, albumId));

    const songIds = albumSongs.map((s) => s.id);

    // 1. Delete all raw audio and cover files from R2
    for (const s of albumSongs) {
      if (s.rawAudioKey) {
        await this.storageService.deleteObject(s.rawAudioKey).catch((err) =>
          console.warn(`Failed to delete raw audio from R2: ${s.rawAudioKey}`, err)
        );
      }
    }
    if (album.coverImageUrl) {
      const coverKey = extractR2KeyFromUrl(album.coverImageUrl);
      if (coverKey && (coverKey.startsWith("covers/") || coverKey.startsWith("artwork/"))) {
        await this.storageService.deleteObject(coverKey).catch((err) =>
          console.warn(`Failed to delete cover from R2: ${coverKey}`, err)
        );
      }
    }

    // 2. Cascade delete records in PostgreSQL transaction
    await db.transaction(async (tx) => {
      if (songIds.length > 0) {
        await tx.delete(songCredits).where(inArray(songCredits.songId, songIds));
        await tx.delete(songs).where(eq(songs.albumId, albumId));
      }
      await tx.delete(albums).where(eq(albums.id, albumId));
    });

    // 3. Invalidate caches
    await cacheManager.invalidateAlbum({
      id: albumId,
      slug: album.slug,
      artistId: artist.id,
    });
    for (const s of albumSongs) {
      await cacheManager.invalidateSong({
        id: s.id,
        albumId,
        artistId: artist.id,
      });
    }
    await cacheManager.invalidate(
      cacheKeys.catalog.artist(artist.id),
      cacheKeys.catalog.artistAlbumsTag(artist.id)
    );
    if (songIds.length > 0) {
      await playlistsCacheService.invalidatePlaylistsForSongs(songIds);
    }

    return {
      success: true,
      message: `Release and all associated tracks permanently deleted`,
    };
  }


  // =========================================================================
  // SONG OPERATIONS
  // =========================================================================

  /**
   * Creates a standalone track or appends a song to an existing album.
   */
  async createSong(userId: string, input: CreateSongInput) {
    const artist = await this.getArtistByUserId(userId);

    let targetAlbumId: string | null = null;
    let targetAlbumSlug: string | null = null;
    let trackNumber = input.trackNumber ?? 1;

    if (input.albumId) {
      const [album] = await db
        .select({ id: albums.id, totalTracks: albums.totalTracks, slug: albums.slug })
        .from(albums)
        .where(
          and(
            eq(albums.id, input.albumId),
            eq(albums.artistId, artist.id),
            isNull(albums.deletedAt)
          )
        )
        .limit(1);

      if (!album) {
        throw new Error("Target album not found or not owned by artist");
      }

      // Check duplicate audio or exact metadata in this existing album
      const existingAlbumSongs = await db
        .select({
          title: songs.title,
          durationSeconds: songs.durationSeconds,
          rawAudioKey: songs.rawAudioKey,
          audioUrl: songs.audioUrl,
        })
        .from(songs)
        .where(and(eq(songs.albumId, album.id), isNull(songs.deletedAt)));

      const candidateAudio = input.rawAudioKey || input.audioUrl;
      const normCandidateTitle = (input.title || "").trim().toLowerCase();
      const candidateDur = input.durationSeconds || 0;

      for (const existingSong of existingAlbumSongs) {
        const existingAudio = existingSong.rawAudioKey || existingSong.audioUrl;
        if (candidateAudio && existingAudio && candidateAudio === existingAudio) {
          throw new Error(
            `This audio recording is already included in the release.`
          );
        }
        if (
          normCandidateTitle &&
          candidateDur > 0 &&
          existingSong.title.trim().toLowerCase() === normCandidateTitle &&
          Math.abs((existingSong.durationSeconds || 0) - candidateDur) <= 2
        ) {
          throw new Error(
            `A track titled "${input.title}" with matching duration already exists in this release.`
          );
        }
      }

      targetAlbumId = album.id;
      targetAlbumSlug = album.slug;
      if (!input.trackNumber) {
        trackNumber = album.totalTracks + 1;
      }
    } else {
      // Auto-wrap into a first-class SINGLE release (Pure Release Model)
      const coverUrl =
        this.ensureFullUrl(input.coverImageUrl) ||
        "https://pub-d2ff94b6e6924c22875a6799aa101a70.r2.dev/albums/default/single-cover.webp";
      const singleSlug = await this.generateUniqueAlbumSlug(
        `${input.slug || input.title}-single`
      );

      const [newSingleAlbum] = await db
        .insert(albums)
        .values({
          artistId: artist.id,
          title: input.title,
          slug: singleSlug,
          albumType: "SINGLE",
          coverImageUrl: coverUrl,
          releaseDate: new Date().toISOString().split("T")[0],
          totalTracks: 1,
          totalDurationSeconds: input.durationSeconds || 0,
          likesCount: 0,
        })
        .returning();

      targetAlbumId = newSingleAlbum.id;
      targetAlbumSlug = newSingleAlbum.slug;
      trackNumber = 1;
    }

    const finalSlug = await this.generateUniqueSongSlug(
      input.slug || input.title,
      {
        artistId: artist.id,
      }
    );


    const createdSong = await db.transaction(async (tx) => {
      const finalAudioUrl = this.ensureFullUrl(
        input.audioUrl || input.rawAudioKey
      );
      const finalCoverUrl = this.ensureFullUrl(input.coverImageUrl);

      const [newSong] = await tx
        .insert(songs)
        .values({
          artistId: artist.id,
          albumId: targetAlbumId,
          title: input.title,
          slug: finalSlug,
          genre: input.genre ?? null,
          durationSeconds: input.durationSeconds,
          trackNumber,
          discNumber: input.discNumber ?? 1,
          isExplicit: input.isExplicit ?? false,
          allowComments: input.allowComments ?? true,
          rawAudioKey: input.rawAudioKey ?? null,
          audioUrl: finalAudioUrl,
          coverImageUrl: finalCoverUrl,
          processingStatus: input.rawAudioKey
            ? "PENDING"
            : finalAudioUrl
              ? "READY"
              : "PENDING",
        })
        .returning();

      if (input.rawAudioKey) {
        await tx.insert(outboxEvents).values({
          aggregateType: "SONG",
          aggregateId: newSong.id,
          eventType: "SONG_UPLOADED",
          payload: {
            songId: newSong.id,
            rawAudioKey: input.rawAudioKey,
            title: newSong.title,
            artistId: artist.id,
          },
        });
      }

      // Add primary artist credit
      await tx.insert(songCredits).values({
        songId: newSong.id,
        artistId: artist.id,
        role: "PRIMARY",
      });

      // Add additional credits
      if (input.credits && input.credits.length > 0) {
        for (const cred of input.credits) {
          if (cred.artistId !== artist.id) {
            await tx
              .insert(songCredits)
              .values({
                songId: newSong.id,
                artistId: cred.artistId,
                role: cred.role,
              })
              .onConflictDoNothing();
          }
        }
      }

      // If attached to an album, update album aggregates
      if (targetAlbumId) {
        await tx
          .update(albums)
          .set({
            totalTracks: sql`${albums.totalTracks} + 1`,
            totalDurationSeconds: sql`${albums.totalDurationSeconds} + ${input.durationSeconds}`,
            updatedAt: new Date(),
          })
          .where(eq(albums.id, targetAlbumId));
      }

      return newSong;
    });

    if (input.rawAudioKey) {
      const transcodePayload = {
        songId: createdSong.id,
        rawAudioKey: input.rawAudioKey,
        title: createdSong.title,
        artistId: artist.id,
      };
      enqueueTranscodeJob(transcodePayload)
        .then(async () => {
          await db
            .update(outboxEvents)
            .set({ publishedAt: new Date() })
            .where(
              and(
                eq(outboxEvents.aggregateId, createdSong.id),
                eq(outboxEvents.eventType, "SONG_UPLOADED")
              )
            );
        })
        .catch((err) => {
          console.warn(
            `[Catalog] Fast-path enqueue failed for song ${createdSong.id}:`,
            err.message
          );
        });
    }

    if (targetAlbumId) {
      await cacheManager.invalidateAlbum({
        id: targetAlbumId,
        slug: targetAlbumSlug,
        artistId: artist.id,
      });
    }

    return createdSong;
  }

  /**
   * Retrieves single song by ID, with credits and album context.
   */
  async getSongById(songId: string, currentUserId?: string) {
    const publicSong = await cacheManager.getOrSet(
      cacheKeys.catalog.song(songId),
      async () => {
        const [song] = await db
          .select({
            id: songs.id,
            artistId: songs.artistId,
            albumId: songs.albumId,
            title: songs.title,
            slug: songs.slug,
            genre: songs.genre,
            durationSeconds: songs.durationSeconds,
            trackNumber: songs.trackNumber,
            discNumber: songs.discNumber,
            isExplicit: songs.isExplicit,
            allowComments: songs.allowComments,
            rawAudioKey: songs.rawAudioKey,
            audioUrl: songs.audioUrl,
            hlsManifestUrl: songs.hlsManifestUrl,
            processingStatus: songs.processingStatus,
            playsCount: songs.playsCount,
            likesCount: songs.likesCount,
            scope: songs.scope,
            uploaderUserId: songs.uploaderUserId,
            coverImageUrl: sql<string | null>`COALESCE(${songs.coverImageUrl}, ${albums.coverImageUrl})`,
            createdAt: songs.createdAt,
            artistUserId: artistProfiles.userId,
            artistStageName: artistProfiles.stageName,
            artistSlug: artistProfiles.slug,
            artistVerified: artistProfiles.verified,
            albumTitle: albums.title,
            albumStatus: albums.status,
            albumVisibility: albums.visibility,
            albumScheduledReleaseAt: albums.scheduledReleaseAt,
            albumShareToken: albums.shareToken,
          })
          .from(songs)
          .innerJoin(artistProfiles, eq(songs.artistId, artistProfiles.id))
          .leftJoin(albums, eq(songs.albumId, albums.id))
          .where(and(eq(songs.id, songId), isNull(songs.deletedAt)))
          .limit(1);

        if (!song) return null;

        const credits = await db
          .select({
            artistId: songCredits.artistId,
            stageName: artistProfiles.stageName,
            slug: artistProfiles.slug,
            verified: artistProfiles.verified,
            role: songCredits.role,
          })
          .from(songCredits)
          .innerJoin(artistProfiles, eq(songCredits.artistId, artistProfiles.id))
          .where(eq(songCredits.songId, song.id));

        return { ...song, credits };
      },
      600
    );

    if (!publicSong) {
      return null;
    }

    const isArtistOwner = !!(currentUserId && publicSong.artistUserId === currentUserId);
    const isUploaderOwner = !!(currentUserId && publicSong.uploaderUserId === currentUserId);

    let isJamAuthorized = false;
    if (currentUserId && publicSong.uploaderUserId) {
      try {
        const userActiveRoom = await redis.get(`jam:user:${currentUserId}:active_room`);
        if (userActiveRoom) {
          const isMember = await redis.hexists(
            `jam:session:${userActiveRoom.toUpperCase()}:members`,
            publicSong.uploaderUserId
          );
          if (isMember === 1) {
            isJamAuthorized = true;
          }
        }
      } catch (jamErr) {
        console.warn("[CatalogService] Jam room membership check warning:", jamErr);
      }
    }

    // Personal songs are invisible and non-streamable to non-owners outside of a shared active Jam session
    if (publicSong.scope === "PERSONAL" && !isUploaderOwner && !isJamAuthorized) {
      return null;
    }

    const isLive =
      !publicSong.albumId ||
      publicSong.albumStatus === "PUBLISHED" ||
      (publicSong.albumStatus === "SCHEDULED" &&
        publicSong.albumScheduledReleaseAt &&
        new Date(publicSong.albumScheduledReleaseAt).getTime() <= Date.now());

    const isStreamable =
      publicSong.scope === "PERSONAL"
        ? isUploaderOwner || isJamAuthorized
        : isLive || isArtistOwner;
    const isLiked = await likesCacheService.isSongLiked(currentUserId, publicSong.id);

    return {
      ...publicSong,
      rawAudioKey: isStreamable ? publicSong.rawAudioKey : null,
      audioUrl: isStreamable ? publicSong.audioUrl : null,
      hlsManifestUrl: isStreamable ? publicSong.hlsManifestUrl : null,
      isStreamable,
      isLiked,
    };
  }

  /**
   * Updates song metadata, handles album re-assignment, detaching, and credits.
   */
  async updateSong(userId: string, songId: string, input: UpdateSongInput) {
    const artist = await this.getArtistByUserId(userId);

    const [existing] = await db
      .select()
      .from(songs)
      .where(and(eq(songs.id, songId), eq(songs.artistId, artist.id)))
      .limit(1);

    if (!existing) {
      throw new Error("Song not found or you do not have permission");
    }

    let finalSlug = existing.slug;
    if (input.slug && input.slug !== existing.slug) {
      finalSlug = await this.generateUniqueSongSlug(input.slug, {
        currentSongId: songId,
        artistId: artist.id,
      });
    }


    const updatedSong = await db.transaction(async (tx) => {
      const oldAlbumId = existing.albumId;
      let finalAlbumId =
        input.albumId !== undefined ? input.albumId : existing.albumId;
      let finalTrackNumber =
        input.trackNumber !== undefined ? input.trackNumber : existing.trackNumber;
      let isSpunOffSingle = false;
      let detachedSingleCoverUrl: string | null = null;

      // If detaching from an album (albumId explicitly passed as null)
      if (input.albumId === null && oldAlbumId) {
        const [parentAlbum] = await tx
          .select({
            title: albums.title,
            albumType: albums.albumType,
            coverImageUrl: albums.coverImageUrl,
            releaseDate: albums.releaseDate,
          })
          .from(albums)
          .where(eq(albums.id, oldAlbumId))
          .limit(1);

        if (parentAlbum?.albumType === "SINGLE") {
          throw new Error("Cannot detach a track from a single release.");
        }

        const singleCoverUrl =
          (input.coverImageUrl ? this.ensureFullUrl(input.coverImageUrl) : null) ||
          existing.coverImageUrl ||
          parentAlbum?.coverImageUrl ||
          "https://pub-d2ff94b6e6924c22875a6799aa101a70.r2.dev/albums/default/single-cover.webp";
        const singleSlug = await this.generateUniqueAlbumSlug(
          `${existing.title}-single`
        );

        const [newSingleAlbum] = await tx
          .insert(albums)
          .values({
            artistId: artist.id,
            title: existing.title,
            slug: singleSlug,
            albumType: "SINGLE",
            coverImageUrl: singleCoverUrl,
            description: `Single release of "${existing.title}"`,
            releaseDate: new Date().toISOString().split("T")[0],
            totalTracks: 1,
            totalDurationSeconds: existing.durationSeconds,
            likesCount: 0,
          })
          .returning();

        finalAlbumId = newSingleAlbum.id;
        finalTrackNumber = 1;
        isSpunOffSingle = true;
        detachedSingleCoverUrl = singleCoverUrl;
      }

      // Update song
      const rawAudioChanged =
        input.rawAudioKey !== undefined &&
        input.rawAudioKey &&
        input.rawAudioKey !== existing.rawAudioKey;

      const [updated] = await tx
        .update(songs)
        .set({
          ...(input.title ? { title: input.title } : {}),
          slug: finalSlug,
          albumId: finalAlbumId,
          ...(input.genre !== undefined ? { genre: input.genre } : {}),
          ...(input.durationSeconds !== undefined
            ? { durationSeconds: input.durationSeconds }
            : {}),
          trackNumber: finalTrackNumber,
          ...(input.discNumber !== undefined
            ? { discNumber: input.discNumber }
            : {}),
          ...(input.isExplicit !== undefined
            ? { isExplicit: input.isExplicit }
            : {}),
          ...(input.allowComments !== undefined
            ? { allowComments: input.allowComments }
            : {}),
          ...(input.rawAudioKey !== undefined
            ? {
                rawAudioKey: input.rawAudioKey,
                ...(rawAudioChanged
                  ? {
                      processingStatus: "PENDING" as const,
                      hlsManifestUrl: null,
                      processingError: null,
                    }
                  : {}),
              }
            : {}),
          ...(input.audioUrl !== undefined
            ? { audioUrl: this.ensureFullUrl(input.audioUrl) }
            : {}),
          ...(input.coverImageUrl !== undefined
            ? { coverImageUrl: this.ensureFullUrl(input.coverImageUrl) }
            : detachedSingleCoverUrl
              ? { coverImageUrl: detachedSingleCoverUrl }
              : {}),
          updatedAt: new Date(),
        })
        .where(eq(songs.id, songId))
        .returning();

      if (rawAudioChanged && input.rawAudioKey) {
        await tx.insert(outboxEvents).values({
          aggregateType: "SONG",
          aggregateId: songId,
          eventType: "SONG_UPLOADED",
          payload: {
            songId,
            rawAudioKey: input.rawAudioKey,
            title: updated.title,
            artistId: artist.id,
          },
        });
      }

      // Recalculate aggregates if album changed
      if (oldAlbumId !== finalAlbumId) {
        if (oldAlbumId) {
          await tx
            .update(albums)
            .set({
              totalTracks: sql`GREATEST(0, ${albums.totalTracks} - 1)`,
              totalDurationSeconds: sql`GREATEST(0, ${albums.totalDurationSeconds} - ${existing.durationSeconds})`,
              updatedAt: new Date(),
            })
            .where(eq(albums.id, oldAlbumId));
        }

        if (finalAlbumId && !isSpunOffSingle) {
          await tx
            .update(albums)
            .set({
              totalTracks: sql`${albums.totalTracks} + 1`,
              totalDurationSeconds: sql`${albums.totalDurationSeconds} + ${updated.durationSeconds}`,
              updatedAt: new Date(),
            })
            .where(eq(albums.id, finalAlbumId));
        }
      }

      // Replace credits if supplied
      if (input.credits) {
        await tx.delete(songCredits).where(eq(songCredits.songId, songId));

        // Ensure primary artist is credited
        await tx.insert(songCredits).values({
          songId,
          artistId: artist.id,
          role: "PRIMARY",
        });

        for (const cred of input.credits) {
          if (cred.artistId !== artist.id) {
            await tx
              .insert(songCredits)
              .values({
                songId,
                artistId: cred.artistId,
                role: cred.role,
              })
              .onConflictDoNothing();
          }
        }
      }

      return updated;
    });

    if (input.rawAudioKey && input.rawAudioKey !== existing.rawAudioKey) {
      const transcodePayload = {
        songId: updatedSong.id,
        rawAudioKey: input.rawAudioKey,
        title: updatedSong.title,
        artistId: artist.id,
      };
      enqueueTranscodeJob(transcodePayload)
        .then(async () => {
          await db
            .update(outboxEvents)
            .set({ publishedAt: new Date() })
            .where(
              and(
                eq(outboxEvents.aggregateId, updatedSong.id),
                eq(outboxEvents.eventType, "SONG_UPLOADED")
              )
            );
        })
        .catch((err) => {
          console.warn(
            `[Catalog] Fast-path enqueue failed for song ${updatedSong.id}:`,
            err.message
          );
        });
    }

    await cacheManager.invalidateSong({
      id: songId,
      albumId: updatedSong.albumId,
      artistId: artist.id,
    });
    if (existing.albumId && existing.albumId !== updatedSong.albumId) {
      await cacheManager.invalidateAlbum({ id: existing.albumId });
    }
    await playlistsCacheService.invalidatePlaylistsForSongs([songId]);

    return updatedSong;
  }

  /**
   * Triggers on-demand re-transcoding for a song.
   * Can be invoked by the song's artist or an admin.
   */
  async retranscodeSong(userId: string, songId: string) {
    const artist = await this.getArtistByUserId(userId);

    const [song] = await db
      .select()
      .from(songs)
      .where(and(eq(songs.id, songId), eq(songs.artistId, artist.id)))
      .limit(1);

    if (!song) {
      throw new Error("Song not found or you do not have permission");
    }

    if (!song.rawAudioKey) {
      throw new Error("Cannot transcode song without rawAudioKey");
    }

    // Reset status to PENDING
    await db
      .update(songs)
      .set({
        processingStatus: "PENDING",
        processingError: null,
        updatedAt: new Date(),
      })
      .where(eq(songs.id, songId));

    // Record outbox event
    await db.insert(outboxEvents).values({
      aggregateType: "SONG",
      aggregateId: song.id,
      eventType: "SONG_UPLOADED",
      payload: {
        songId: song.id,
        rawAudioKey: song.rawAudioKey,
        title: song.title,
        artistId: artist.id,
      },
    });

    // Push to queue
    const jobId = await enqueueTranscodeJob({
      songId: song.id,
      rawAudioKey: song.rawAudioKey,
      title: song.title,
      artistId: artist.id,
    });

    return {
      success: true,
      message: "Song transcode job enqueued successfully",
      jobId,
      songId: song.id,
    };
  }

  /**
   * Soft deletes a song.
   */
  async softDeleteSong(userId: string, songId: string) {
    const artist = await this.getArtistByUserId(userId);

    const [existing] = await db
      .select({ id: songs.id, albumId: songs.albumId, duration: songs.durationSeconds })
      .from(songs)
      .where(and(eq(songs.id, songId), eq(songs.artistId, artist.id)))
      .limit(1);

    if (!existing) {
      throw new Error("Song not found or you do not have permission");
    }

    const now = new Date();
    let albumWasSoftDeleted = false;
    let albumSlug: string | null = null;

    const res = await db.transaction(async (tx) => {
      await tx
        .update(songs)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(songs.id, songId));

      if (existing.albumId) {
        const remainingActive = await tx
          .select({ id: songs.id, durationSeconds: songs.durationSeconds })
          .from(songs)
          .where(
            and(
              eq(songs.albumId, existing.albumId),
              isNull(songs.deletedAt)
            )
          );

        const [alb] = await tx
          .select({ slug: albums.slug })
          .from(albums)
          .where(eq(albums.id, existing.albumId))
          .limit(1);
        albumSlug = alb?.slug || null;

        if (remainingActive.length === 0) {
          // If no more active tracks in this album, soft-delete the parent album as well
          await tx
            .update(albums)
            .set({ deletedAt: now, updatedAt: now })
            .where(eq(albums.id, existing.albumId));
          albumWasSoftDeleted = true;
        } else {
          const totalDuration = remainingActive.reduce(
            (acc, s) => acc + (s.durationSeconds || 0),
            0
          );
          await tx
            .update(albums)
            .set({
              totalTracks: remainingActive.length,
              totalDurationSeconds: totalDuration,
              updatedAt: now,
            })
            .where(eq(albums.id, existing.albumId));
        }
      }

      return {
        message: albumWasSoftDeleted
          ? "Last song and parent release moved to 30-day trash"
          : "Song moved to trash (30-day restore window)",
        deletedAt: now.toISOString(),
      };
    });

    await cacheManager.invalidateSong({
      id: songId,
      albumId: existing.albumId,
      artistId: artist.id,
    });
    if (existing.albumId) {
      if (albumWasSoftDeleted) {
        await cacheManager.invalidateAlbum({
          id: existing.albumId,
          slug: albumSlug,
          artistId: artist.id,
        });
      } else {
        await cacheManager.invalidate(
          cacheKeys.catalog.album(existing.albumId),
          cacheKeys.catalog.artistAlbumsTag(artist.id)
        );
      }
    }

    await playlistsCacheService.invalidatePlaylistsForSongs([songId]);

    return res;
  }

  /**
   * Restores a soft-deleted song.
   */
  async restoreSong(userId: string, songId: string) {
    const artist = await this.getArtistByUserId(userId);

    const [existing] = await db
      .select({ id: songs.id, albumId: songs.albumId, duration: songs.durationSeconds })
      .from(songs)
      .where(and(eq(songs.id, songId), eq(songs.artistId, artist.id)))
      .limit(1);

    if (!existing) {
      throw new Error("Song not found or you do not have permission");
    }

    const now = new Date();
    let parentAlbumSlug: string | null = null;
    let albumWasRestored = false;

    const res = await db.transaction(async (tx) => {
      await tx
        .update(songs)
        .set({ deletedAt: null, updatedAt: now })
        .where(eq(songs.id, songId));

      if (existing.albumId) {
        const [album] = await tx
          .select({ id: albums.id, slug: albums.slug, deletedAt: albums.deletedAt })
          .from(albums)
          .where(eq(albums.id, existing.albumId))
          .limit(1);

        parentAlbumSlug = album?.slug || null;

        if (album && album.deletedAt) {
          // If parent album was soft-deleted, restore the album too
          await tx
            .update(albums)
            .set({ deletedAt: null, updatedAt: now })
            .where(eq(albums.id, existing.albumId));
          albumWasRestored = true;
        }

        const activeSongs = await tx
          .select({ durationSeconds: songs.durationSeconds })
          .from(songs)
          .where(
            and(
              eq(songs.albumId, existing.albumId),
              isNull(songs.deletedAt)
            )
          );

        const totalDuration = activeSongs.reduce(
          (acc, s) => acc + (s.durationSeconds || 0),
          0
        );

        await tx
          .update(albums)
          .set({
            totalTracks: activeSongs.length,
            totalDurationSeconds: totalDuration,
            updatedAt: now,
          })
          .where(eq(albums.id, existing.albumId));
      }

      return {
        message: albumWasRestored
          ? "Song and parent release restored successfully"
          : "Song restored successfully",
      };
    });

    await cacheManager.invalidateSong({
      id: songId,
      albumId: existing.albumId,
      artistId: artist.id,
    });
    if (existing.albumId) {
      await cacheManager.invalidateAlbum({
        id: existing.albumId,
        slug: parentAlbumSlug,
        artistId: artist.id,
      });
    }

    await playlistsCacheService.invalidatePlaylistsForSongs([songId]);

    return res;
  }


  /**
   * Permanently deletes a global song and its raw audio from database and R2 storage.
   */
  async permanentlyDeleteSong(userId: string, songId: string) {
    const artist = await this.getArtistByUserId(userId);

    const [song] = await db
      .select()
      .from(songs)
      .where(and(eq(songs.id, songId), eq(songs.artistId, artist.id)))
      .limit(1);

    if (!song) {
      throw new Error("Song not found or you do not have permission");
    }

    // Pre-fetch parent album info if attached to an album
    let parentAlbum: { id: string; slug: string | null; coverImageUrl: string | null } | null = null;
    if (song.albumId) {
      const [alb] = await db
        .select({
          id: albums.id,
          slug: albums.slug,
          coverImageUrl: albums.coverImageUrl,
        })
        .from(albums)
        .where(eq(albums.id, song.albumId))
        .limit(1);
      parentAlbum = alb || null;
    }

    // 1. Delete raw audio from R2
    if (song.rawAudioKey) {
      await this.storageService.deleteObject(song.rawAudioKey).catch((err) =>
        console.warn(`Failed to delete raw audio from R2: ${song.rawAudioKey}`, err)
      );
    }

    let albumWasDeleted = false;

    // 2. Delete database records in transaction
    await db.transaction(async (tx) => {
      await tx.delete(songCredits).where(eq(songCredits.songId, songId));
      await tx.delete(songs).where(eq(songs.id, songId));

      if (song.albumId) {
        const remainingTracks = await tx
          .select({ durationSeconds: songs.durationSeconds })
          .from(songs)
          .where(and(eq(songs.albumId, song.albumId), isNull(songs.deletedAt)));

        const anyTracksLeft = await tx
          .select({ id: songs.id })
          .from(songs)
          .where(eq(songs.albumId, song.albumId))
          .limit(1);

        if (anyTracksLeft.length === 0) {
          await tx.delete(albums).where(eq(albums.id, song.albumId));
          albumWasDeleted = true;
        } else {
          const totalDuration = remainingTracks.reduce(
            (acc, t) => acc + (t.durationSeconds || 0),
            0
          );
          await tx
            .update(albums)
            .set({
              totalTracks: remainingTracks.length,
              totalDurationSeconds: totalDuration,
              updatedAt: new Date(),
            })
            .where(eq(albums.id, song.albumId));
        }
      }
    });

    // 3. If parent album was deleted (0 tracks remaining), purge its cover artwork from R2
    if (albumWasDeleted && parentAlbum?.coverImageUrl) {
      const coverKey = extractR2KeyFromUrl(parentAlbum.coverImageUrl);
      if (coverKey && (coverKey.startsWith("covers/") || coverKey.startsWith("artwork/"))) {
        await this.storageService.deleteObject(coverKey).catch((err) =>
          console.warn(`Failed to delete parent album cover from R2: ${coverKey}`, err)
        );
      }
    }

    // 4. Invalidate caches
    await cacheManager.invalidateSong({
      id: songId,
      albumId: song.albumId,
      artistId: artist.id,
    });
    if (song.albumId) {
      if (albumWasDeleted && parentAlbum) {
        await cacheManager.invalidateAlbum({
          id: song.albumId,
          slug: parentAlbum.slug,
          artistId: artist.id,
        });
      } else {
        await cacheManager.invalidate(
          cacheKeys.catalog.album(song.albumId),
          cacheKeys.catalog.artistAlbumsTag(artist.id)
        );
      }
    }
    await cacheManager.invalidate(
      cacheKeys.catalog.artist(artist.id),
      cacheKeys.catalog.artistAlbumsTag(artist.id)
    );
    await playlistsCacheService.invalidatePlaylistsForSongs([songId]);

    return {
      success: true,
      message: albumWasDeleted
        ? "Song and empty parent release permanently deleted from storage and catalog"
        : "Song permanently deleted from storage and catalog",
    };
  }



  // =========================================================================
  // PUBLIC CATALOG & DISCOVERY
  // =========================================================================

  /**
   * Browse and search albums with filters and pagination.
   */
  async searchAlbums(query: SearchAlbumsQuery) {
    const page = query.page;
    const limit = query.limit;
    const offset = (page - 1) * limit;

    const conditions = [
      isNull(albums.deletedAt),
      eq(albums.scope, "GLOBAL"),
      eq(albums.visibility, "PUBLIC"),
      or(
        eq(albums.status, "PUBLISHED"),
        and(
          eq(albums.status, "SCHEDULED"),
          lte(albums.scheduledReleaseAt, sql`NOW()`)
        )
      )!,
    ];

    if (query.albumType) {
      conditions.push(eq(albums.albumType, query.albumType));
    }
    if (query.artistId) {
      conditions.push(eq(albums.artistId, query.artistId));
    }
    if (query.search) {
      conditions.push(
        or(
          ilike(albums.title, `%${query.search}%`),
          ilike(albums.slug, `%${query.search}%`),
          ilike(artistProfiles.stageName, `%${query.search}%`)
        )!
      );
    }

    const whereClause = and(...conditions);

    const [totalRes] = await db
      .select({ total: count() })
      .from(albums)
      .innerJoin(artistProfiles, eq(albums.artistId, artistProfiles.id))
      .where(whereClause);

    const total = totalRes?.total ?? 0;

    const data = await db
      .select({
        id: albums.id,
        artistId: albums.artistId,
        title: albums.title,
        slug: albums.slug,
        albumType: albums.albumType,
        coverImageUrl: albums.coverImageUrl,
        genre: albums.genre,
        releaseDate: albums.releaseDate,
        status: albums.status,
        visibility: albums.visibility,
        scheduledReleaseAt: albums.scheduledReleaseAt,
        preSavesCount: albums.preSavesCount,
        likesCount: albums.likesCount,
        totalTracks: albums.totalTracks,
        totalDurationSeconds: albums.totalDurationSeconds,
        createdAt: albums.createdAt,
        artistStageName: artistProfiles.stageName,
        artistSlug: artistProfiles.slug,
        artistVerified: artistProfiles.verified,
      })
      .from(albums)
      .innerJoin(artistProfiles, eq(albums.artistId, artistProfiles.id))
      .where(whereClause)
      .orderBy(desc(albums.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Browse and search songs (supports sorting by plays, likes, or recent).
   */
  async searchSongs(query: SearchSongsQuery, currentUserId?: string) {
    const page = query.page;
    const limit = query.limit;
    const offset = (page - 1) * limit;

    const conditions = [isNull(songs.deletedAt), eq(songs.scope, "GLOBAL")];

    if (query.genre) {
      conditions.push(ilike(songs.genre, `%${query.genre}%`));
    }
    if (query.artistId) {
      conditions.push(eq(songs.artistId, query.artistId));
    }
    if (query.albumId) {
      conditions.push(eq(songs.albumId, query.albumId));
    }
    if (query.search) {
      conditions.push(
        or(
          ilike(songs.title, `%${query.search}%`),
          ilike(songs.slug, `%${query.search}%`),
          ilike(artistProfiles.stageName, `%${query.search}%`)
        )!
      );
    }

    const whereClause = and(...conditions);

    const [totalRes] = await db
      .select({ total: count() })
      .from(songs)
      .innerJoin(artistProfiles, eq(songs.artistId, artistProfiles.id))
      .where(whereClause);

    const total = totalRes?.total ?? 0;

    let orderExpr = desc(songs.playsCount);
    if (query.orderBy === "recent") {
      orderExpr = desc(songs.createdAt);
    } else if (query.orderBy === "likes") {
      orderExpr = desc(songs.likesCount);
    }

    const data = await db
      .select({
        id: songs.id,
        artistId: songs.artistId,
        albumId: songs.albumId,
        title: songs.title,
        slug: songs.slug,
        genre: songs.genre,
        durationSeconds: songs.durationSeconds,
        trackNumber: songs.trackNumber,
        isExplicit: songs.isExplicit,
        audioUrl: songs.audioUrl,
        hlsManifestUrl: songs.hlsManifestUrl,
        processingStatus: songs.processingStatus,
        playsCount: songs.playsCount,
        likesCount: songs.likesCount,
        coverImageUrl: sql<string | null>`COALESCE(${songs.coverImageUrl}, ${albums.coverImageUrl})`,
        createdAt: songs.createdAt,
        artistStageName: artistProfiles.stageName,
        artistSlug: artistProfiles.slug,
        artistVerified: artistProfiles.verified,
        albumTitle: albums.title,
      })
      .from(songs)
      .innerJoin(artistProfiles, eq(songs.artistId, artistProfiles.id))
      .leftJoin(albums, eq(songs.albumId, albums.id))
      .where(whereClause)
      .orderBy(orderExpr)
      .limit(limit)
      .offset(offset);

    // Likes enrichment
    let userLikedSongIds = new Set<string>();
    if (currentUserId && data.length > 0) {
      const ids = data.map((s) => s.id);
      const userLikes = await db
        .select({ songId: songLikes.songId })
        .from(songLikes)
        .where(
          and(
            inArray(songLikes.songId, ids),
            eq(songLikes.userId, currentUserId)
          )
        );
      userLikedSongIds = new Set(userLikes.map((l) => l.songId));
    }

    const enriched = data.map((s) => ({
      ...s,
      isLiked: userLikedSongIds.has(s.id),
    }));

    return {
      data: enriched,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Retrieves complete discography for an artist profile:
   * Albums, EPs, Singles, Top Tracks, and Collaborations ("Appears On").
   */
  async getArtistDiscography(artistIdOrSlug: string, currentUserId?: string) {
    const isUUID = UUID_REGEX.test(artistIdOrSlug);

    const [artist] = await db
      .select({
        id: artistProfiles.id,
        stageName: artistProfiles.stageName,
        scope: artistProfiles.scope,
        ownerUserId: artistProfiles.ownerUserId,
      })
      .from(artistProfiles)
      .where(
        isUUID
          ? eq(artistProfiles.id, artistIdOrSlug)
          : eq(artistProfiles.slug, artistIdOrSlug)
      )
      .limit(1);

    if (!artist) {
      return null;
    }

    // Privacy boundary: Personal sandboxed artists can ONLY be viewed by their owner
    if (
      artist.scope === "PERSONAL" &&
      (!currentUserId || artist.ownerUserId !== currentUserId)
    ) {
      return null;
    }

    // 1. Released Albums, EPs, Singles
    // Only published public releases appear in public discography, unless user is the artist themselves
    let isSelf = false;
    if (currentUserId) {
      if (artist.scope === "PERSONAL") {
        isSelf = artist.ownerUserId === currentUserId;
      } else {
        const [requestingArtist] = await db
          .select({ id: artistProfiles.id })
          .from(artistProfiles)
          .where(eq(artistProfiles.userId, currentUserId))
          .limit(1);
        isSelf = requestingArtist?.id === artist.id;
      }
    }

    const discographyCondition = isSelf
      ? and(eq(albums.artistId, artist.id), isNull(albums.deletedAt))
      : and(
          eq(albums.artistId, artist.id),
          isNull(albums.deletedAt),
          eq(albums.visibility, "PUBLIC"),
          or(
            eq(albums.status, "PUBLISHED"),
            and(
              eq(albums.status, "SCHEDULED"),
              lte(albums.scheduledReleaseAt, sql`NOW()`)
            )
          )
        );

    const artistAlbums = await db
      .select()
      .from(albums)
      .where(discographyCondition)
      .orderBy(desc(albums.releaseDate), desc(albums.createdAt));

    const albumsList = artistAlbums.filter(
      (a) => a.albumType === "ALBUM" || a.albumType === "LP"
    );
    const epsList = artistAlbums.filter((a) => a.albumType === "EP");
    const singlesList = artistAlbums.filter((a) => a.albumType === "SINGLE");
    const mixtapesList = artistAlbums.filter((a) => a.albumType === "MIXTAPE");

    // 2. Top Tracks (Top 10 most played)
    const topTracks = await db
      .select({
        id: songs.id,
        artistId: songs.artistId,
        albumId: songs.albumId,
        title: songs.title,
        slug: songs.slug,
        durationSeconds: songs.durationSeconds,
        isExplicit: songs.isExplicit,
        audioUrl: songs.audioUrl,
        hlsManifestUrl: songs.hlsManifestUrl,
        coverImageUrl: sql<string | null>`COALESCE(${songs.coverImageUrl}, ${albums.coverImageUrl})`,
        playsCount: songs.playsCount,
        likesCount: songs.likesCount,
      })
      .from(songs)
      .leftJoin(albums, eq(songs.albumId, albums.id))
      .where(and(eq(songs.artistId, artist.id), isNull(songs.deletedAt)))
      .orderBy(desc(songs.playsCount))
      .limit(10);

    // 3. Appears On (Featured / Producer credits on other artists' tracks)
    const appearsOnCredits = await db
      .select({
        songId: songCredits.songId,
        role: songCredits.role,
        songTitle: songs.title,
        songSlug: songs.slug,
        songDuration: songs.durationSeconds,
        audioUrl: songs.audioUrl,
        primaryArtistName: artistProfiles.stageName,
        primaryArtistSlug: artistProfiles.slug,
      })
      .from(songCredits)
      .innerJoin(songs, eq(songCredits.songId, songs.id))
      .innerJoin(artistProfiles, eq(songs.artistId, artistProfiles.id))
      .where(
        and(
          eq(songCredits.artistId, artist.id),
          sql`${songCredits.role} != 'PRIMARY'`,
          isNull(songs.deletedAt),
          currentUserId
            ? or(
                eq(songs.scope, "GLOBAL"),
                and(
                  eq(songs.scope, "PERSONAL"),
                  eq(songs.uploaderUserId, currentUserId)
                )
              )
            : eq(songs.scope, "GLOBAL")
        )
      )
      .limit(20);

    // User like status on top tracks
    let userLikedSongIds = new Set<string>();
    if (currentUserId && topTracks.length > 0) {
      const ids = topTracks.map((t) => t.id);
      const likes = await db
        .select({ songId: songLikes.songId })
        .from(songLikes)
        .where(
          and(
            inArray(songLikes.songId, ids),
            eq(songLikes.userId, currentUserId)
          )
        );
      userLikedSongIds = new Set(likes.map((l) => l.songId));
    }

    // 4. Personal Collection Matches ("In Your Collection" shelf)
    let inYourCollection: any[] = [];
    if (currentUserId) {
      const [userRecord] = await db
        .select({ lockerLinkToGlobalArtists: users.lockerLinkToGlobalArtists })
        .from(users)
        .where(eq(users.id, currentUserId))
        .limit(1);

      const isLockerLinkEnabled = userRecord?.lockerLinkToGlobalArtists !== false;

      if (isLockerLinkEnabled) {
        const cleanStageName = artist.stageName.trim();
        const personalTracks = await db
          .select({
            id: songs.id,
            title: songs.title,
            slug: songs.slug,
            durationSeconds: songs.durationSeconds,
            audioUrl: songs.audioUrl,
            hlsManifestUrl: songs.hlsManifestUrl,
            rawAudioKey: songs.rawAudioKey,
            coverImageUrl: sql<string | null>`COALESCE(${songs.coverImageUrl}, ${albums.coverImageUrl})`,
            playsCount: songs.playsCount,
            likesCount: songs.likesCount,
            albumTitle: albums.title,
            artistName: artistProfiles.stageName,
            scope: songs.scope,
          })
          .from(songs)
          .innerJoin(artistProfiles, eq(songs.artistId, artistProfiles.id))
          .leftJoin(albums, eq(songs.albumId, albums.id))
          .where(
            and(
              eq(songs.scope, "PERSONAL"),
              eq(songs.uploaderUserId, currentUserId),
              isNull(songs.deletedAt),
              or(
                ilike(artistProfiles.stageName, cleanStageName),
                sql`EXISTS (
                  SELECT 1 FROM song_credits sc
                  INNER JOIN artist_profiles ap ON sc.artist_id = ap.id
                  WHERE sc.song_id = ${songs.id}
                  AND LOWER(TRIM(ap.stage_name)) = LOWER(TRIM(${cleanStageName}))
                )`
              )
            )
          )
          .limit(50);

        inYourCollection = personalTracks.map((t) => ({
          ...t,
          isPersonal: true,
          isStreamable: true,
        }));
      }
    }

    return {
      artist,
      albums: albumsList,
      eps: epsList,
      singles: singlesList,
      mixtapes: mixtapesList,
      topTracks: topTracks.map((t) => ({
        ...t,
        isLiked: userLikedSongIds.has(t.id),
      })),
      appearsOn: appearsOnCredits,
      inYourCollection,
    };
  }

  /**
   * Retrieves artist's own studio releases, including active releases and 30-day trash items.
   */
  async getStudioReleases(userId: string, showTrash = false) {
    const artist = await this.getArtistByUserId(userId);

    const albumCondition = showTrash
      ? and(eq(albums.artistId, artist.id), isNotNull(albums.deletedAt))
      : and(eq(albums.artistId, artist.id), isNull(albums.deletedAt));

    const artistAlbums = await db
      .select()
      .from(albums)
      .where(albumCondition)
      .orderBy(desc(albums.createdAt));

    const songCondition = showTrash
      ? and(eq(songs.artistId, artist.id), isNotNull(songs.deletedAt))
      : and(eq(songs.artistId, artist.id), isNull(songs.deletedAt));

    const artistSongs = await db
      .select()
      .from(songs)
      .where(songCondition)
      .orderBy(desc(songs.createdAt));

    return {
      artist,
      albums: artistAlbums,
      songs: artistSongs,
    };
  }

  /**
   * Permanently empties all soft-deleted releases and standalone cuts in the artist's studio trash.
   */
  async emptyStudioTrash(userId: string) {
    const artist = await this.getArtistByUserId(userId);

    const trashedAlbums = await db
      .select({ id: albums.id, coverImageUrl: albums.coverImageUrl })
      .from(albums)
      .where(and(eq(albums.artistId, artist.id), isNotNull(albums.deletedAt)));

    const trashedAlbumIds = trashedAlbums.map((a) => a.id);

    const trashedSongs = await db
      .select({
        id: songs.id,
        rawAudioKey: songs.rawAudioKey,
        albumId: songs.albumId,
      })
      .from(songs)
      .where(
        or(
          and(eq(songs.artistId, artist.id), isNotNull(songs.deletedAt)),
          trashedAlbumIds.length > 0 ? inArray(songs.albumId, trashedAlbumIds) : sql`false`
        )
      );

    const allSongIds = trashedSongs.map((s) => s.id);

    // 1. Delete all raw audio from R2
    for (const song of trashedSongs) {
      if (song.rawAudioKey) {
        await this.storageService.deleteObject(song.rawAudioKey).catch((err) =>
          console.warn(`Failed to delete raw audio: ${song.rawAudioKey}`, err)
        );
      }
    }
    for (const album of trashedAlbums) {
      if (album.coverImageUrl) {
        const coverKey = extractR2KeyFromUrl(album.coverImageUrl);
        if (coverKey && (coverKey.startsWith("covers/") || coverKey.startsWith("artwork/"))) {
          await this.storageService.deleteObject(coverKey).catch((err) =>
            console.warn(`Failed to delete cover: ${coverKey}`, err)
          );
        }
      }
    }

    // 2. Transactional database deletion
    await db.transaction(async (tx) => {
      if (allSongIds.length > 0) {
        await tx.delete(songCredits).where(inArray(songCredits.songId, allSongIds));
        await tx.delete(songs).where(inArray(songs.id, allSongIds));
      }
      if (trashedAlbumIds.length > 0) {
        await tx.delete(albums).where(inArray(albums.id, trashedAlbumIds));
      }
    });

    // 3. Invalidate caches
    for (const aId of trashedAlbumIds) {
      await cacheManager.invalidate(cacheKeys.catalog.album(aId));
    }
    for (const s of trashedSongs) {
      await cacheManager.invalidate(cacheKeys.catalog.song(s.id));
    }
    await cacheManager.invalidate(
      cacheKeys.catalog.artist(artist.id),
      cacheKeys.catalog.artistAlbumsTag(artist.id)
    );

    return {
      success: true,
      message: `Studio trash emptied permanently: ${allSongIds.length} song(s) and ${trashedAlbumIds.length} release(s) deleted`,
      deletedSongsCount: allSongIds.length,
      deletedReleasesCount: trashedAlbumIds.length,
    };
  }

  // =========================================================================
  // SOCIAL / LIKES OPERATIONS
  // =========================================================================

  /**
   * Toggles like/unlike on a song via high-performance LikesCacheService.
   */
  async toggleSongLike(userId: string, songId: string) {
    return await likesCacheService.toggleSongLike(userId, songId);
  }

  /**
   * Toggles like/unlike on an album via high-performance LikesCacheService.
   */
  async toggleAlbumLike(userId: string, albumId: string) {
    return await likesCacheService.toggleAlbumLike(userId, albumId);
  }

  /**
   * Fast sync method returning all song IDs liked by user for client-side Set.
   */
  async getUserLikedSongIds(userId: string): Promise<string[]> {
    const set = await likesCacheService.getUserLikedSongIds(userId);
    return Array.from(set);
  }

  /**
   * Fast sync method returning all album IDs liked by user for client-side Set.
   */
  async getUserLikedAlbumIds(userId: string): Promise<string[]> {
    const set = await likesCacheService.getUserLikedAlbumIds(userId);
    return Array.from(set);
  }

  /**
   * Retrieves a user's personal Liked Songs collection.
   */
  async getLikedSongs(userId: string, page = 1, limit = 50) {
    const offset = (page - 1) * limit;

    const [totalRes] = await db
      .select({ total: count() })
      .from(songLikes)
      .innerJoin(songs, eq(songLikes.songId, songs.id))
      .where(and(eq(songLikes.userId, userId), isNull(songs.deletedAt)));

    const total = totalRes?.total ?? 0;

    const rows = await db
      .select({
        likedAt: songLikes.createdAt,
        id: songs.id,
        artistId: songs.artistId,
        albumId: songs.albumId,
        title: songs.title,
        slug: songs.slug,
        durationSeconds: songs.durationSeconds,
        isExplicit: songs.isExplicit,
        audioUrl: songs.audioUrl,
        hlsManifestUrl: songs.hlsManifestUrl,
        playsCount: songs.playsCount,
        likesCount: songs.likesCount,
        artistStageName: artistProfiles.stageName,
        artistSlug: artistProfiles.slug,
        artistVerified: artistProfiles.verified,
        albumTitle: albums.title,
        coverImageUrl: sql<string | null>`COALESCE(${songs.coverImageUrl}, ${albums.coverImageUrl})`,
        albumCoverImageUrl: sql<string | null>`COALESCE(${songs.coverImageUrl}, ${albums.coverImageUrl})`,
      })
      .from(songLikes)
      .innerJoin(songs, eq(songLikes.songId, songs.id))
      .innerJoin(artistProfiles, eq(songs.artistId, artistProfiles.id))
      .leftJoin(albums, eq(songs.albumId, albums.id))
      .where(and(eq(songLikes.userId, userId), isNull(songs.deletedAt)))
      .orderBy(desc(songLikes.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      data: rows.map((r) => ({ ...r, isLiked: true })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // =========================================================================
  // PRE-SAVE OPERATIONS (ALL RELEASE TYPES)
  // =========================================================================

  /**
   * Pre-saves an upcoming scheduled release for a user.
   */
  async preSaveAlbum(userId: string, albumId: string) {
    return await presavesCacheService.preSaveAlbum(userId, albumId);
  }

  /**
   * Removes a pre-save for a user.
   */
  async removePreSave(userId: string, albumId: string) {
    return await presavesCacheService.removePreSave(userId, albumId);
  }

  /**
   * Fast sync: returns all album IDs pre-saved by user.
   */
  async getUserPreSavedAlbumIds(userId: string): Promise<string[]> {
    const set = await presavesCacheService.getUserPreSavedAlbumIds(userId);
    return Array.from(set);
  }

  /**
   * Lists all releases pre-saved by the current user.
   */
  async getUserPreSaves(userId: string) {
    return await db
      .select({
        albumId: albums.id,
        title: albums.title,
        slug: albums.slug,
        albumType: albums.albumType,
        coverImageUrl: albums.coverImageUrl,
        scheduledReleaseAt: albums.scheduledReleaseAt,
        releaseDate: albums.releaseDate,
        totalTracks: albums.totalTracks,
        totalDurationSeconds: albums.totalDurationSeconds,
        preSavedAt: releasePresaves.createdAt,
        artistStageName: artistProfiles.stageName,
        artistSlug: artistProfiles.slug,
        artistVerified: artistProfiles.verified,
      })
      .from(releasePresaves)
      .innerJoin(albums, eq(releasePresaves.albumId, albums.id))
      .innerJoin(artistProfiles, eq(albums.artistId, artistProfiles.id))
      .where(
        and(
          eq(releasePresaves.userId, userId),
          isNull(albums.deletedAt)
        )
      )
      .orderBy(asc(albums.scheduledReleaseAt), desc(releasePresaves.createdAt));
  }
}
