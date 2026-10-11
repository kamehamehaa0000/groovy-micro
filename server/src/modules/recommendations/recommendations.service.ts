import {
  eq,
  and,
  or,
  sql,
  desc,
  inArray,
  notInArray,
  ne,
  isNull,
  gte,
} from "drizzle-orm";
import { db } from "../../db";
import { redis } from "../../db/redis";
import {
  songs,
  albums,
  artistProfiles,
  artistFollowers,
  listeningHistory,
  songLikes,
  playlists,
  playlistSongs,
  userLibraryPlaylists,
  users,
} from "../../db/schema";
import { cacheKeys } from "../../lib/cache/keys";
import type {
  TasteProfile,
  ScoredRecommendationTrack,
  PersonalizedHomeFeed,
  RadioMixCard,
  UserPlaylistSummary,
  SimilarArtistCard,
  RecommendationScopeMode,
  RecommendationContext,
} from "./recommendations.types";


export class RecommendationsService {
  private get cdnBaseUrl(): string {
    const raw =
      process.env.CDN_BASE_URL ||
      "https://pub-d2ff94b6e6924c22875a6799aa101a70.r2.dev";
    return raw.replace(/\/+$/, "");
  }

  /**
   * Guarantees CDN URL resolution for image and audio assets.
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
   * Resolves the operational recommendation context:
   * 1. UNAUTHORIZED: visitor with zero personal data
   * 2. GLOBAL_ONLY: signed-in user with lockerIncludeInHome = false (default)
   * 3. MIXED: signed-in user with lockerIncludeInHome = true (opt-in)
   */
  async resolveContext(userId?: string | null): Promise<RecommendationContext> {
    if (!userId) {
      return { userId: null, mode: "UNAUTHORIZED", includePersonal: false };
    }

    try {
      const [userRow] = await db
        .select({ lockerIncludeInHome: users.lockerIncludeInHome })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const includePersonal = userRow?.lockerIncludeInHome === true;
      return {
        userId,
        mode: includePersonal ? "MIXED" : "GLOBAL_ONLY",
        includePersonal,
      };
    } catch {
      return { userId, mode: "GLOBAL_ONLY", includePersonal: false };
    }
  }

  /**
   * Universal scope condition evaluator ensuring personal sandboxed data
   * is only surfaced when explicitly allowed and owned by the calling user.
   */
  getScopeCondition(
    table: typeof songs | typeof albums | typeof artistProfiles,
    ctx: RecommendationContext
  ) {
    if (ctx.includePersonal && ctx.userId) {
      if ("uploaderUserId" in table) {
        return or(
          eq(table.scope, "GLOBAL"),
          and(eq(table.scope, "PERSONAL"), eq(table.uploaderUserId, ctx.userId))
        );
      }
      if ("ownerUserId" in table) {
        return or(
          eq(table.scope, "GLOBAL"),
          and(eq(table.scope, "PERSONAL"), eq(table.ownerUserId, ctx.userId))
        );
      }
    }
    return eq(table.scope, "GLOBAL");
  }

  // =========================================================================
  // 1. USER TASTE PROFILE EXTRACTOR (Affinity Vector)
  // Integrates Playlists (+5.0), Likes (+3.0), and Completed Plays (+1.5)
  // =========================================================================
  async getUserTasteProfile(userId: string): Promise<TasteProfile> {
    const cacheKey = cacheKeys.recommendations.tasteProfile(userId);
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as TasteProfile;
      }
    } catch {
      // Redis fault-tolerant fallback
    }

    const genreWeights = new Map<string, number>();
    const moodWeights = new Map<string, number>();
    const bpmValues: number[] = [];
    const energyValues: number[] = [];
    let totalSignalWeight = 0;

    // A. Playlist Signals (Curated by user = Weight 5.0)
    const playlistTracks = await db
      .select({
        primaryGenre: songs.primaryGenre,
        moods: songs.moods,
        bpm: songs.bpm,
        energy: songs.energy,
      })
      .from(playlistSongs)
      .innerJoin(songs, eq(playlistSongs.songId, songs.id))
      .innerJoin(playlists, eq(playlistSongs.playlistId, playlists.id))
      .where(
        or(
          eq(playlists.ownerId, userId),
          inArray(
            playlists.id,
            db
              .select({ playlistId: userLibraryPlaylists.playlistId })
              .from(userLibraryPlaylists)
              .where(eq(userLibraryPlaylists.userId, userId))
          )
        )
      )
      .limit(100);

    for (const track of playlistTracks) {
      const weight = 5.0;
      totalSignalWeight += weight;
      if (track.primaryGenre) {
        genreWeights.set(
          track.primaryGenre,
          (genreWeights.get(track.primaryGenre) || 0) + weight
        );
      }
      if (Array.isArray(track.moods)) {
        for (const mood of track.moods) {
          moodWeights.set(mood, (moodWeights.get(mood) || 0) + weight);
        }
      }
      if (track.bpm && track.bpm > 0) bpmValues.push(track.bpm);
      if (typeof track.energy === "number") energyValues.push(track.energy);
    }

    // B. Explicit Likes Signals (Weight 3.0)
    const likedTracks = await db
      .select({
        primaryGenre: songs.primaryGenre,
        moods: songs.moods,
        bpm: songs.bpm,
        energy: songs.energy,
      })
      .from(songLikes)
      .innerJoin(songs, eq(songLikes.songId, songs.id))
      .where(eq(songLikes.userId, userId))
      .limit(100);

    for (const track of likedTracks) {
      const weight = 3.0;
      totalSignalWeight += weight;
      if (track.primaryGenre) {
        genreWeights.set(
          track.primaryGenre,
          (genreWeights.get(track.primaryGenre) || 0) + weight
        );
      }
      if (Array.isArray(track.moods)) {
        for (const mood of track.moods) {
          moodWeights.set(mood, (moodWeights.get(mood) || 0) + weight);
        }
      }
      if (track.bpm && track.bpm > 0) bpmValues.push(track.bpm);
      if (typeof track.energy === "number") energyValues.push(track.energy);
    }

    // C. Listening Telemetry Signals (Completed plays = Weight 1.5)
    const recentHistory = await db
      .select({
        primaryGenre: songs.primaryGenre,
        moods: songs.moods,
        bpm: songs.bpm,
        energy: songs.energy,
        completed: listeningHistory.completed,
      })
      .from(listeningHistory)
      .innerJoin(songs, eq(listeningHistory.songId, songs.id))
      .where(
        and(
          eq(listeningHistory.userId, userId),
          gte(listeningHistory.playedAt, sql`NOW() - INTERVAL '60 days'`)
        )
      )
      .limit(150);

    for (const track of recentHistory) {
      const weight = track.completed ? 1.5 : 0.5;
      totalSignalWeight += weight;
      if (track.primaryGenre) {
        genreWeights.set(
          track.primaryGenre,
          (genreWeights.get(track.primaryGenre) || 0) + weight
        );
      }
      if (Array.isArray(track.moods)) {
        for (const mood of track.moods) {
          moodWeights.set(mood, (moodWeights.get(mood) || 0) + weight);
        }
      }
      if (track.bpm && track.bpm > 0) bpmValues.push(track.bpm);
      if (typeof track.energy === "number") energyValues.push(track.energy);
    }

    // Normalization & Ranking
    const topGenres = Array.from(genreWeights.entries())
      .map(([genre, raw]) => ({
        genre,
        weight: totalSignalWeight > 0 ? Number((raw / totalSignalWeight).toFixed(3)) : 0,
      }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5);

    const topMoods = Array.from(moodWeights.entries())
      .map(([mood, raw]) => ({
        mood,
        weight: totalSignalWeight > 0 ? Number((raw / totalSignalWeight).toFixed(3)) : 0,
      }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5);

    const avgBpm =
      bpmValues.length > 0
        ? Math.round(bpmValues.reduce((a, b) => a + b, 0) / bpmValues.length)
        : null;

    const avgEnergy =
      energyValues.length > 0
        ? Number(
            (energyValues.reduce((a, b) => a + b, 0) / energyValues.length).toFixed(2)
          )
        : null;

    const profile: TasteProfile = {
      topGenres,
      topMoods,
      avgBpm,
      avgEnergy,
      totalSignals: totalSignalWeight,
    };

    try {
      await redis.set(cacheKey, JSON.stringify(profile), "EX", 1800); // 30 mins TTL
    } catch {
      // non-fatal
    }

    return profile;
  }

  // =========================================================================
  // 2. HEAVY ROTATION (Repeat favorites with high completion rate)
  // =========================================================================
  async getHeavyRotation(
    userId: string,
    limit: number = 8,
    existingCtx?: RecommendationContext
  ): Promise<ScoredRecommendationTrack[]> {
    const ctx = existingCtx || (await this.resolveContext(userId));
    const cacheKey = cacheKeys.recommendations.heavyRotation(userId, ctx.mode.toLowerCase());
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as ScoredRecommendationTrack[];
      }
    } catch {}

    const rotationRows = await db
      .select({
        id: songs.id,
        title: songs.title,
        slug: songs.slug,
        artistId: songs.artistId,
        artistStageName: artistProfiles.stageName,
        artistSlug: artistProfiles.slug,
        artistVerified: artistProfiles.verified,
        albumId: songs.albumId,
        albumTitle: albums.title,
        albumSlug: albums.slug,
        albumType: albums.albumType,
        coverImageUrl: sql<string | null>`COALESCE(${songs.coverImageUrl}, ${albums.coverImageUrl})`,
        durationSeconds: songs.durationSeconds,
        audioUrl: songs.audioUrl,
        hlsManifestUrl: songs.hlsManifestUrl,
        primaryGenre: songs.primaryGenre,
        subGenre: songs.subGenre,
        moods: songs.moods,
        bpm: songs.bpm,
        energy: songs.energy,
        playsCount: songs.playsCount,
        likesCount: songs.likesCount,
        userPlays: sql<number>`count(${listeningHistory.id})::int`,
      })
      .from(listeningHistory)
      .innerJoin(songs, eq(listeningHistory.songId, songs.id))
      .innerJoin(artistProfiles, eq(songs.artistId, artistProfiles.id))
      .leftJoin(albums, eq(songs.albumId, albums.id))
      .where(
        and(
          eq(listeningHistory.userId, userId),
          eq(listeningHistory.completed, true),
          gte(listeningHistory.playedAt, sql`NOW() - INTERVAL '45 days'`),
          isNull(songs.deletedAt),
          this.getScopeCondition(songs, ctx)
        )
      )
      .groupBy(
        songs.id,
        artistProfiles.stageName,
        artistProfiles.slug,
        artistProfiles.verified,
        albums.title,
        albums.slug,
        albums.albumType,
        albums.coverImageUrl
      )
      .orderBy(desc(sql`count(${listeningHistory.id})`))
      .limit(limit);

    // Likes enrichment
    const likedSet = await this.getUserLikedSongSet(userId, rotationRows.map((r) => r.id));

    let results: ScoredRecommendationTrack[] = rotationRows.map((r) => ({
      ...r,
      coverImageUrl: this.ensureFullUrl(r.coverImageUrl),
      moods: Array.isArray(r.moods) ? r.moods : [],
      isLiked: likedSet.has(r.id),
      score: r.userPlays,
      recommendationReason: `On repeat in your rotation (${r.userPlays} spins)`,
    }));

    // Cold-start fallback: If fewer than requested, backfill with user's top liked songs
    if (results.length < limit) {
      const existingIds = new Set(results.map((t) => t.id));
      const backfillLimit = limit - results.length;

      const likedBackfill = await db
        .select({
          id: songs.id,
          title: songs.title,
          slug: songs.slug,
          artistId: songs.artistId,
          artistStageName: artistProfiles.stageName,
          artistSlug: artistProfiles.slug,
          artistVerified: artistProfiles.verified,
          albumId: songs.albumId,
          albumTitle: albums.title,
          albumSlug: albums.slug,
          albumType: albums.albumType,
          coverImageUrl: sql<string | null>`COALESCE(${songs.coverImageUrl}, ${albums.coverImageUrl})`,
          durationSeconds: songs.durationSeconds,
          audioUrl: songs.audioUrl,
          hlsManifestUrl: songs.hlsManifestUrl,
          primaryGenre: songs.primaryGenre,
          subGenre: songs.subGenre,
          moods: songs.moods,
          bpm: songs.bpm,
          energy: songs.energy,
          playsCount: songs.playsCount,
          likesCount: songs.likesCount,
        })
        .from(songLikes)
        .innerJoin(songs, eq(songLikes.songId, songs.id))
        .innerJoin(artistProfiles, eq(songs.artistId, artistProfiles.id))
        .leftJoin(albums, eq(songs.albumId, albums.id))
        .where(
          and(
            eq(songLikes.userId, userId),
            isNull(songs.deletedAt),
            existingIds.size > 0 ? notInArray(songs.id, Array.from(existingIds)) : sql`1=1`
          )
        )
        .orderBy(desc(songLikes.createdAt))
        .limit(backfillLimit);

      for (const track of likedBackfill) {
        results.push({
          ...track,
          coverImageUrl: this.ensureFullUrl(track.coverImageUrl),
          moods: Array.isArray(track.moods) ? track.moods : [],
          isLiked: true,
          recommendationReason: "From your Liked Songs library",
        });
      }
    }

    try {
      await redis.set(cacheKey, JSON.stringify(results), "EX", 600); // 10 min TTL
    } catch {}

    return results;
  }

  // =========================================================================
  // 3. PLAYLIST-ASSISTED RECOMMENDATIONS
  // A) Unheard tracks in saved playlists
  // B) Co-occurrence: tracks frequently in public playlists alongside user tracks
  // =========================================================================
  async getPlaylistAssistedRecommendations(
    userId: string,
    limit: number = 8,
    existingCtx?: RecommendationContext
  ): Promise<ScoredRecommendationTrack[]> {
    const ctx = existingCtx || (await this.resolveContext(userId));
    const cacheKey = cacheKeys.recommendations.playlistAssisted(userId);
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as ScoredRecommendationTrack[];
      }
    } catch {}

    const results: ScoredRecommendationTrack[] = [];

    // Part A: Unheard tracks inside playlists the user saved
    const unheardSavedPlaylistTracks = await db
      .select({
        id: songs.id,
        title: songs.title,
        slug: songs.slug,
        artistId: songs.artistId,
        artistStageName: artistProfiles.stageName,
        artistSlug: artistProfiles.slug,
        artistVerified: artistProfiles.verified,
        albumId: songs.albumId,
        albumTitle: albums.title,
        albumSlug: albums.slug,
        albumType: albums.albumType,
        coverImageUrl: sql<string | null>`COALESCE(${songs.coverImageUrl}, ${albums.coverImageUrl})`,
        durationSeconds: songs.durationSeconds,
        audioUrl: songs.audioUrl,
        hlsManifestUrl: songs.hlsManifestUrl,
        primaryGenre: songs.primaryGenre,
        subGenre: songs.subGenre,
        moods: songs.moods,
        bpm: songs.bpm,
        energy: songs.energy,
        playsCount: songs.playsCount,
        likesCount: songs.likesCount,
        playlistTitle: playlists.title,
      })
      .from(playlistSongs)
      .innerJoin(playlists, eq(playlistSongs.playlistId, playlists.id))
      .innerJoin(
        userLibraryPlaylists,
        and(
          eq(userLibraryPlaylists.playlistId, playlists.id),
          eq(userLibraryPlaylists.userId, userId)
        )
      )
      .innerJoin(songs, eq(playlistSongs.songId, songs.id))
      .innerJoin(artistProfiles, eq(songs.artistId, artistProfiles.id))
      .leftJoin(albums, eq(songs.albumId, albums.id))
      .where(
        and(
          isNull(songs.deletedAt),
          notInArray(
            songs.id,
            db
              .select({ songId: listeningHistory.songId })
              .from(listeningHistory)
              .where(eq(listeningHistory.userId, userId))
          )
        )
      )
      .orderBy(desc(songs.playsCount))
      .limit(limit);

    for (const track of unheardSavedPlaylistTracks) {
      results.push({
        id: track.id,
        title: track.title,
        slug: track.slug,
        artistId: track.artistId,
        artistStageName: track.artistStageName,
        artistSlug: track.artistSlug,
        artistVerified: track.artistVerified,
        albumId: track.albumId,
        albumTitle: track.albumTitle,
        albumSlug: track.albumSlug,
        albumType: track.albumType,
        coverImageUrl: this.ensureFullUrl(track.coverImageUrl),
        durationSeconds: track.durationSeconds,
        audioUrl: track.audioUrl,
        hlsManifestUrl: track.hlsManifestUrl,
        primaryGenre: track.primaryGenre,
        subGenre: track.subGenre,
        moods: Array.isArray(track.moods) ? track.moods : [],
        bpm: track.bpm,
        energy: track.energy,
        playsCount: track.playsCount,
        likesCount: track.likesCount,
        recommendationReason: `Unheard track from your saved playlist "${track.playlistTitle}"`,
      });
    }

    // Part B: Co-occurrence Discovery (Tracks that share playlists with user's top songs)
    if (results.length < limit) {
      const existingIds = new Set(results.map((r) => r.id));
      const remainingLimit = limit - results.length;

      // Find user's top 5 playlist song IDs
      const userPlaylistSongIds = await db
        .select({ songId: playlistSongs.songId })
        .from(playlistSongs)
        .innerJoin(playlists, eq(playlistSongs.playlistId, playlists.id))
        .where(eq(playlists.ownerId, userId))
        .limit(10);

      if (userPlaylistSongIds.length > 0) {
        const seedIds = userPlaylistSongIds.map((s) => s.songId);

        // Find other songs in public playlists that contain any seed song
        const coOccurringRows = await db
          .select({
            id: songs.id,
            title: songs.title,
            slug: songs.slug,
            artistId: songs.artistId,
            artistStageName: artistProfiles.stageName,
            artistSlug: artistProfiles.slug,
            artistVerified: artistProfiles.verified,
            albumId: songs.albumId,
            albumTitle: albums.title,
            albumSlug: albums.slug,
            albumType: albums.albumType,
            coverImageUrl: sql<string | null>`COALESCE(${songs.coverImageUrl}, ${albums.coverImageUrl})`,
            durationSeconds: songs.durationSeconds,
            audioUrl: songs.audioUrl,
            hlsManifestUrl: songs.hlsManifestUrl,
            primaryGenre: songs.primaryGenre,
            subGenre: songs.subGenre,
            moods: songs.moods,
            bpm: songs.bpm,
            energy: songs.energy,
            playsCount: songs.playsCount,
            likesCount: songs.likesCount,
            coOccurrenceScore: sql<number>`count(distinct ${playlistSongs.playlistId})::int`,
          })
          .from(playlistSongs)
          .innerJoin(songs, eq(playlistSongs.songId, songs.id))
          .innerJoin(artistProfiles, eq(songs.artistId, artistProfiles.id))
          .leftJoin(albums, eq(songs.albumId, albums.id))
          .where(
            and(
              isNull(songs.deletedAt),
              this.getScopeCondition(songs, ctx),
              notInArray(songs.id, [...Array.from(existingIds), ...seedIds]),
              inArray(
                playlistSongs.playlistId,
                db
                  .select({ playlistId: playlistSongs.playlistId })
                  .from(playlistSongs)
                  .where(inArray(playlistSongs.songId, seedIds))
              )
            )
          )
          .groupBy(
            songs.id,
            artistProfiles.stageName,
            artistProfiles.slug,
            artistProfiles.verified,
            albums.title,
            albums.slug,
            albums.albumType,
            albums.coverImageUrl
          )
          .orderBy(desc(sql`count(distinct ${playlistSongs.playlistId})`))
          .limit(remainingLimit);

        for (const track of coOccurringRows) {
          results.push({
            ...track,
            coverImageUrl: this.ensureFullUrl(track.coverImageUrl),
            moods: Array.isArray(track.moods) ? track.moods : [],
            score: track.coOccurrenceScore,
            recommendationReason: "Frequently curated together in community playlists",
          });
        }
      }
    }

    // Likes enrichment
    const likedSet = await this.getUserLikedSongSet(userId, results.map((r) => r.id));
    results.forEach((r) => {
      r.isLiked = likedSet.has(r.id);
    });

    try {
      await redis.set(cacheKey, JSON.stringify(results), "EX", 900); // 15 min TTL
    } catch {}

    return results;
  }

  // =========================================================================
  // 4. RECOMMENDED FOR YOU (Content-Based Taste Matching)
  // Scores candidates based on User Taste Profile (Genre, Mood, BPM)
  // =========================================================================
  async getRecommendedForYou(
    userId: string,
    limit: number = 10,
    existingCtx?: RecommendationContext
  ): Promise<ScoredRecommendationTrack[]> {
    const ctx = existingCtx || (await this.resolveContext(userId));
    const cacheKey = cacheKeys.recommendations.forYou(userId, ctx.mode.toLowerCase());
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as ScoredRecommendationTrack[];
      }
    } catch {}

    const tasteProfile = await this.getUserTasteProfile(userId);

    // Identify user's played songs in last 30 days to avoid duplicate discovery
    const playedRows = await db
      .select({ songId: listeningHistory.songId })
      .from(listeningHistory)
      .where(
        and(
          eq(listeningHistory.userId, userId),
          gte(listeningHistory.playedAt, sql`NOW() - INTERVAL '30 days'`)
        )
      )
      .limit(200);

    const playedIds = new Set(playedRows.map((r) => r.songId));

    // Identify heavily skipped artists (negative signal)
    const skippedArtists = await db
      .select({ artistId: songs.artistId })
      .from(listeningHistory)
      .innerJoin(songs, eq(listeningHistory.songId, songs.id))
      .where(
        and(
          eq(listeningHistory.userId, userId),
          eq(listeningHistory.skipped, true)
        )
      )
      .groupBy(songs.artistId)
      .having(sql`count(*) >= 3`);

    const skippedArtistIds = new Set(skippedArtists.map((a) => a.artistId));

    // Fetch candidate catalog songs
    const topGenreList = tasteProfile.topGenres.map((g) => g.genre);
    const topMoodList = tasteProfile.topMoods.map((m) => m.mood);

    const candidateRows = await db
      .select({
        id: songs.id,
        title: songs.title,
        slug: songs.slug,
        artistId: songs.artistId,
        artistStageName: artistProfiles.stageName,
        artistSlug: artistProfiles.slug,
        artistVerified: artistProfiles.verified,
        albumId: songs.albumId,
        albumTitle: albums.title,
        albumSlug: albums.slug,
        albumType: albums.albumType,
        coverImageUrl: sql<string | null>`COALESCE(${songs.coverImageUrl}, ${albums.coverImageUrl})`,
        durationSeconds: songs.durationSeconds,
        audioUrl: songs.audioUrl,
        hlsManifestUrl: songs.hlsManifestUrl,
        primaryGenre: songs.primaryGenre,
        subGenre: songs.subGenre,
        moods: songs.moods,
        bpm: songs.bpm,
        energy: songs.energy,
        playsCount: songs.playsCount,
        likesCount: songs.likesCount,
      })
      .from(songs)
      .innerJoin(artistProfiles, eq(songs.artistId, artistProfiles.id))
      .leftJoin(albums, eq(songs.albumId, albums.id))
      .where(
        and(
          isNull(songs.deletedAt),
          this.getScopeCondition(songs, ctx),
          eq(songs.processingStatus, "READY"),
          playedIds.size > 0 ? notInArray(songs.id, Array.from(playedIds)) : sql`1=1`,
          skippedArtistIds.size > 0
            ? notInArray(songs.artistId, Array.from(skippedArtistIds))
            : sql`1=1`
        )
      )
      .limit(60);

    // Scoring Algorithm:
    // Score = (Genre Weight * 4.0) + (Mood Overlap * 2.5) + (BPM Proximity * 1.5) + (Popularity * 0.5)
    const scoredCandidates: ScoredRecommendationTrack[] = candidateRows.map((song) => {
      let score = 0;
      let reason = "Curated based on your general listening profile";

      // Genre match scoring
      if (song.primaryGenre) {
        const genreMatch = tasteProfile.topGenres.find(
          (g) => g.genre.toLowerCase() === song.primaryGenre?.toLowerCase()
        );
        if (genreMatch) {
          score += genreMatch.weight * 4.0;
          reason = `Matches your preference for ${song.primaryGenre}`;
        }
      }

      // Mood match scoring
      if (Array.isArray(song.moods) && song.moods.length > 0) {
        for (const mood of song.moods) {
          const moodMatch = tasteProfile.topMoods.find(
            (m) => m.mood.toLowerCase() === mood.toLowerCase()
          );
          if (moodMatch) {
            score += moodMatch.weight * 2.5;
            reason = `Fits your ${mood} listening mood`;
          }
        }
      }

      // BPM proximity bonus (within +- 15 BPM)
      if (
        tasteProfile.avgBpm &&
        song.bpm &&
        Math.abs(song.bpm - tasteProfile.avgBpm) <= 15
      ) {
        score += 1.5;
      }

      // Platform popularity normalization bonus
      score += Math.log10(Math.max(1, song.playsCount)) * 0.5;

      return {
        ...song,
        coverImageUrl: this.ensureFullUrl(song.coverImageUrl),
        moods: Array.isArray(song.moods) ? song.moods : [],
        score: Number(score.toFixed(2)),
        isLiked: false,
        recommendationReason: reason,
      };
    });

    // Rank candidates by computed score
    scoredCandidates.sort((a, b) => (b.score || 0) - (a.score || 0));
    const finalSelection: ScoredRecommendationTrack[] = scoredCandidates.slice(0, limit);

    // Cold-start fallback: If no candidate matches (brand new user), fetch platform top cuts
    if (finalSelection.length < limit) {
      const existingIds = new Set(finalSelection.map((s) => s.id));
      const needed = limit - finalSelection.length;

      const topCuts = await db
        .select({
          id: songs.id,
          title: songs.title,
          slug: songs.slug,
          artistId: songs.artistId,
          artistStageName: artistProfiles.stageName,
          artistSlug: artistProfiles.slug,
          artistVerified: artistProfiles.verified,
          albumId: songs.albumId,
          albumTitle: albums.title,
          albumSlug: albums.slug,
          albumType: albums.albumType,
          coverImageUrl: sql<string | null>`COALESCE(${songs.coverImageUrl}, ${albums.coverImageUrl})`,
          durationSeconds: songs.durationSeconds,
          audioUrl: songs.audioUrl,
          hlsManifestUrl: songs.hlsManifestUrl,
          primaryGenre: songs.primaryGenre,
          subGenre: songs.subGenre,
          moods: songs.moods,
          bpm: songs.bpm,
          energy: songs.energy,
          playsCount: songs.playsCount,
          likesCount: songs.likesCount,
        })
        .from(songs)
        .innerJoin(artistProfiles, eq(songs.artistId, artistProfiles.id))
        .leftJoin(albums, eq(songs.albumId, albums.id))
        .where(
          and(
            isNull(songs.deletedAt),
            this.getScopeCondition(songs, ctx),
            eq(songs.processingStatus, "READY"),
            existingIds.size > 0 ? notInArray(songs.id, Array.from(existingIds)) : sql`1=1`
          )
        )
        .orderBy(desc(songs.playsCount))
        .limit(needed);

      for (const cut of topCuts) {
        finalSelection.push({
          ...cut,
          coverImageUrl: this.ensureFullUrl(cut.coverImageUrl),
          moods: Array.isArray(cut.moods) ? cut.moods : [],
          score: 1.0,
          recommendationReason: "Trending across Groovy platform",
        });
      }
    }

    // Likes enrichment
    const likedSet = await this.getUserLikedSongSet(userId, finalSelection.map((r) => r.id));
    finalSelection.forEach((r) => {
      r.isLiked = likedSet.has(r.id);
    });

    try {
      await redis.set(cacheKey, JSON.stringify(finalSelection), "EX", 600); // 10 min TTL
    } catch {}

    return finalSelection;
  }

  // =========================================================================
  // 5. ARTIST RADAR (New drops from followed artists)
  // =========================================================================
  async getArtistRadar(
    userId?: string | null,
    limit: number = 8,
    existingCtx?: RecommendationContext
  ): Promise<any[]> {
    if (!userId) return [];
    const ctx = existingCtx || (await this.resolveContext(userId));
    const cacheKey = cacheKeys.recommendations.radar(userId, ctx.mode.toLowerCase());
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {}

    // 1. Get followed artist IDs
    const followed = await db
      .select({ artistId: artistFollowers.artistId })
      .from(artistFollowers)
      .where(eq(artistFollowers.userId, userId));

    const followedIds = followed.map((f) => f.artistId);

    if (followedIds.length === 0) {
      return [];
    }

    const scopeFilter =
      ctx.mode === "MIXED"
        ? or(
            and(
              eq(albums.scope, "GLOBAL"),
              eq(albums.status, "PUBLISHED"),
              eq(albums.visibility, "PUBLIC")
            ),
            and(
              eq(albums.scope, "PERSONAL"),
              eq(albums.uploaderUserId, userId)
            )
          )
        : and(
            eq(albums.scope, "GLOBAL"),
            eq(albums.status, "PUBLISHED"),
            eq(albums.visibility, "PUBLIC")
          );

    // 2. Fetch new releases from followed roster (last 6 months)
    const releases = await db
      .select({
        id: albums.id,
        title: albums.title,
        slug: albums.slug,
        albumType: albums.albumType,
        coverImageUrl: albums.coverImageUrl,
        releaseDate: albums.releaseDate,
        publishedAt: albums.publishedAt,
        artistId: albums.artistId,
        artistStageName: artistProfiles.stageName,
        artistSlug: artistProfiles.slug,
        artistAvatarUrl: artistProfiles.avatarUrl,
        primaryGenre: albums.primaryGenre,
        totalTracks: albums.totalTracks,
      })
      .from(albums)
      .innerJoin(artistProfiles, eq(albums.artistId, artistProfiles.id))
      .where(
        and(
          inArray(albums.artistId, followedIds),
          scopeFilter,
          isNull(albums.deletedAt),
          gte(albums.releaseDate, sql`CURRENT_DATE - INTERVAL '6 months'`)
        )
      )
      .orderBy(desc(albums.releaseDate))
      .limit(limit);

    const formatted = releases.map((rel) => ({
      ...rel,
      coverImageUrl: this.ensureFullUrl(rel.coverImageUrl),
      artistAvatarUrl: this.ensureFullUrl(rel.artistAvatarUrl),
    }));

    try {
      await redis.set(cacheKey, JSON.stringify(formatted), "EX", 600); // 10 min TTL
    } catch {}

    return formatted;
  }

  // =========================================================================
  // 6. FORGOTTEN FAVORITES (Past favorites with 0 plays in last 30+ days)
  // =========================================================================
  async getForgottenFavorites(
    userId: string,
    limit: number = 8,
    existingCtx?: RecommendationContext
  ): Promise<ScoredRecommendationTrack[]> {
    const ctx = existingCtx || (await this.resolveContext(userId));
    const favorites = await db
      .select({
        id: songs.id,
        title: songs.title,
        slug: songs.slug,
        artistId: songs.artistId,
        artistStageName: artistProfiles.stageName,
        artistSlug: artistProfiles.slug,
        artistVerified: artistProfiles.verified,
        albumId: songs.albumId,
        albumTitle: albums.title,
        albumSlug: albums.slug,
        albumType: albums.albumType,
        coverImageUrl: sql<string | null>`COALESCE(${songs.coverImageUrl}, ${albums.coverImageUrl})`,
        durationSeconds: songs.durationSeconds,
        audioUrl: songs.audioUrl,
        hlsManifestUrl: songs.hlsManifestUrl,
        primaryGenre: songs.primaryGenre,
        subGenre: songs.subGenre,
        moods: songs.moods,
        bpm: songs.bpm,
        energy: songs.energy,
        playsCount: songs.playsCount,
        likesCount: songs.likesCount,
        pastPlays: sql<number>`count(${listeningHistory.id})::int`,
        latestPlay: sql<string>`max(${listeningHistory.playedAt})`,
      })
      .from(listeningHistory)
      .innerJoin(songs, eq(listeningHistory.songId, songs.id))
      .innerJoin(artistProfiles, eq(songs.artistId, artistProfiles.id))
      .leftJoin(albums, eq(songs.albumId, albums.id))
      .where(
        and(
          eq(listeningHistory.userId, userId),
          eq(listeningHistory.completed, true),
          isNull(songs.deletedAt),
          this.getScopeCondition(songs, ctx)
        )
      )
      .groupBy(
        songs.id,
        artistProfiles.stageName,
        artistProfiles.slug,
        artistProfiles.verified,
        albums.title,
        albums.slug,
        albums.albumType,
        albums.coverImageUrl
      )
      .having(
        and(
          sql`count(${listeningHistory.id}) >= 3`,
          sql`max(${listeningHistory.playedAt}) < NOW() - INTERVAL '30 days'`
        )
      )
      .orderBy(desc(sql`count(${listeningHistory.id})`))
      .limit(limit);

    const likedSet = await this.getUserLikedSongSet(userId, favorites.map((r) => r.id));

    return favorites.map((f) => ({
      ...f,
      coverImageUrl: this.ensureFullUrl(f.coverImageUrl),
      moods: Array.isArray(f.moods) ? f.moods : [],
      isLiked: likedSet.has(f.id),
      score: f.pastPlays,
      recommendationReason: `Rediscover a past favorite (${f.pastPlays} previous plays)`,
    }));
  }

  // =========================================================================
  // 7. TRACK RADIO / SMART AUTOPLAY QUEUE
  // Continuous smooth session flow based on seed song attributes & playlist co-occurrence
  // =========================================================================
  async getTrackRadio(
    seedSongId: string,
    limit: number = 15,
    ctxOrUserId?: RecommendationContext | string | null
  ): Promise<ScoredRecommendationTrack[]> {
    const ctx =
      ctxOrUserId && typeof ctxOrUserId === "object" && "mode" in ctxOrUserId
        ? ctxOrUserId
        : await this.resolveContext(typeof ctxOrUserId === "string" ? ctxOrUserId : null);

    const cacheKey = cacheKeys.recommendations.radio(
      seedSongId,
      ctx.userId,
      ctx.mode.toLowerCase()
    );
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as ScoredRecommendationTrack[];
      }
    } catch {}

    // 1. Fetch seed song
    const [seed] = await db
      .select({
        id: songs.id,
        title: songs.title,
        artistId: songs.artistId,
        primaryGenre: songs.primaryGenre,
        subGenre: songs.subGenre,
        moods: songs.moods,
        bpm: songs.bpm,
        energy: songs.energy,
      })
      .from(songs)
      .where(and(eq(songs.id, seedSongId), isNull(songs.deletedAt), this.getScopeCondition(songs, ctx)))
      .limit(1);

    if (!seed) {
      return [];
    }

    // 2. Fetch candidate songs in matching genre or mood
    const candidates = await db
      .select({
        id: songs.id,
        title: songs.title,
        slug: songs.slug,
        artistId: songs.artistId,
        artistStageName: artistProfiles.stageName,
        artistSlug: artistProfiles.slug,
        artistVerified: artistProfiles.verified,
        albumId: songs.albumId,
        albumTitle: albums.title,
        albumSlug: albums.slug,
        albumType: albums.albumType,
        coverImageUrl: sql<string | null>`COALESCE(${songs.coverImageUrl}, ${albums.coverImageUrl})`,
        durationSeconds: songs.durationSeconds,
        audioUrl: songs.audioUrl,
        hlsManifestUrl: songs.hlsManifestUrl,
        primaryGenre: songs.primaryGenre,
        subGenre: songs.subGenre,
        moods: songs.moods,
        bpm: songs.bpm,
        energy: songs.energy,
        playsCount: songs.playsCount,
        likesCount: songs.likesCount,
      })
      .from(songs)
      .innerJoin(artistProfiles, eq(songs.artistId, artistProfiles.id))
      .leftJoin(albums, eq(songs.albumId, albums.id))
      .where(
        and(
          ne(songs.id, seedSongId),
          isNull(songs.deletedAt),
          this.getScopeCondition(songs, ctx),
          eq(songs.processingStatus, "READY")
        )
      )
      .limit(60);

    // 3. Find co-occurring playlist songs
    const coOccurringPlaylistSongIds = await db
      .select({ songId: playlistSongs.songId })
      .from(playlistSongs)
      .where(
        and(
          ne(playlistSongs.songId, seedSongId),
          inArray(
            playlistSongs.playlistId,
            db
              .select({ playlistId: playlistSongs.playlistId })
              .from(playlistSongs)
              .where(eq(playlistSongs.songId, seedSongId))
          )
        )
      )
      .limit(20);

    const coOccurringSet = new Set(coOccurringPlaylistSongIds.map((s) => s.songId));

    // 4. Harmonic & sonic scoring
    const scored = candidates.map((cand) => {
      let score = 0;

      // Primary genre match
      if (cand.primaryGenre && seed.primaryGenre) {
        if (cand.primaryGenre.toLowerCase() === seed.primaryGenre.toLowerCase()) {
          score += 4.0;
        }
      }

      // Mood match
      if (Array.isArray(seed.moods) && Array.isArray(cand.moods)) {
        const overlap = cand.moods.filter((m) => seed.moods?.includes(m));
        score += overlap.length * 2.0;
      }

      // BPM proximity (+- 15 BPM)
      if (cand.bpm && seed.bpm && Math.abs(cand.bpm - seed.bpm) <= 15) {
        score += 2.0;
      }

      // Playlist co-occurrence boost
      if (coOccurringSet.has(cand.id)) {
        score += 3.5;
      }

      // Same artist control: slight boost for synergy, but avoid saturation
      if (cand.artistId === seed.artistId) {
        score += 1.0;
      }

      return {
        ...cand,
        coverImageUrl: this.ensureFullUrl(cand.coverImageUrl),
        moods: Array.isArray(cand.moods) ? cand.moods : [],
        score: Number(score.toFixed(2)),
        recommendationReason: `Sonic continuity match with ${seed.title}`,
      };
    });

    scored.sort((a, b) => b.score - a.score);
    const radioResults = scored.slice(0, limit);

    try {
      await redis.set(cacheKey, JSON.stringify(radioResults), "EX", 3600); // 1 hour TTL
    } catch {}

    return radioResults;
  }

  /**
   * Returns complete radio mix details including seed song metadata and continuous tracks.
   */
  async getRadioDetails(
    seedSongId: string,
    limit: number = 20,
    ctxOrUserId?: RecommendationContext | string | null
  ): Promise<{
    seedSong: ScoredRecommendationTrack | null;
    tracks: ScoredRecommendationTrack[];
  }> {
    const ctx =
      ctxOrUserId && typeof ctxOrUserId === "object" && "mode" in ctxOrUserId
        ? ctxOrUserId
        : await this.resolveContext(typeof ctxOrUserId === "string" ? ctxOrUserId : null);

    const [seedRow] = await db
      .select({
        id: songs.id,
        title: songs.title,
        slug: songs.slug,
        artistId: songs.artistId,
        artistStageName: artistProfiles.stageName,
        artistSlug: artistProfiles.slug,
        artistVerified: artistProfiles.verified,
        albumId: songs.albumId,
        albumTitle: albums.title,
        albumSlug: albums.slug,
        albumType: albums.albumType,
        coverImageUrl: sql<string | null>`COALESCE(${songs.coverImageUrl}, ${albums.coverImageUrl})`,
        durationSeconds: songs.durationSeconds,
        audioUrl: songs.audioUrl,
        hlsManifestUrl: songs.hlsManifestUrl,
        primaryGenre: songs.primaryGenre,
        subGenre: songs.subGenre,
        moods: songs.moods,
        bpm: songs.bpm,
        energy: songs.energy,
        playsCount: songs.playsCount,
        likesCount: songs.likesCount,
      })
      .from(songs)
      .innerJoin(artistProfiles, eq(songs.artistId, artistProfiles.id))
      .leftJoin(albums, eq(songs.albumId, albums.id))
      .where(and(eq(songs.id, seedSongId), isNull(songs.deletedAt), this.getScopeCondition(songs, ctx)))
      .limit(1);

    const seedSong = seedRow
      ? {
          ...seedRow,
          coverImageUrl: this.ensureFullUrl(seedRow.coverImageUrl),
          moods: Array.isArray(seedRow.moods) ? seedRow.moods : [],
          recommendationReason: "Seed Song for Radio",
        }
      : null;

    const tracks = await this.getTrackRadio(seedSongId, limit, ctx);

    return { seedSong, tracks };
  }


  // =========================================================================
  // =========================================================================
  // 8. CONSOLIDATED PERSONALIZED HOME FEED
  // Single fast API call returning all personalized shelves in parallel
  // =========================================================================
  async getPersonalizedHomeFeed(userId?: string | null): Promise<PersonalizedHomeFeed> {
    const ctx = await this.resolveContext(userId);
    const cacheKey = cacheKeys.recommendations.homeFeed(
      ctx.userId,
      ctx.mode.toLowerCase()
    );
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as PersonalizedHomeFeed;
      }
    } catch {}

    const [
      tasteProfile,
      newReleasesForYou,
      artistRadar,
      globalHits,
      similarArtists,
      moreLikeArtist,
      moreLikeSong,
      userPlaylists,
      radioMixes,
      heavyRotation,
      forYou,
      playlistAssisted,
      forgottenFavorites,
    ] = await Promise.all([
      ctx.userId
        ? this.getUserTasteProfile(ctx.userId)
        : Promise.resolve({
            topGenres: [],
            topMoods: [],
            avgBpm: null,
            avgEnergy: null,
            totalSignals: 0,
          }),
      this.getNewReleasesForYou(ctx.userId, 8, ctx),
      ctx.userId ? this.getArtistRadar(ctx.userId, 8, ctx) : Promise.resolve([]),
      this.getGlobalHitsForYou(ctx.userId, 8, ctx),
      this.getSimilarArtists(ctx.userId, 8, ctx),
      this.getMoreLikeTopArtist(ctx.userId, 8, ctx),
      this.getMoreLikeTopSong(ctx.userId, 8, ctx),
      ctx.userId ? this.getUserPlaylistsSummary(ctx.userId, 8) : Promise.resolve([]),
      this.getRadioMixes(ctx.userId, 5, ctx),
      ctx.userId ? this.getHeavyRotation(ctx.userId, 6, ctx) : Promise.resolve([]),
      ctx.userId ? this.getRecommendedForYou(ctx.userId, 8, ctx) : Promise.resolve([]),
      ctx.userId ? this.getPlaylistAssistedRecommendations(ctx.userId, 6, ctx) : Promise.resolve([]),
      ctx.userId ? this.getForgottenFavorites(ctx.userId, 6, ctx) : Promise.resolve([]),
    ]);

    const feed: PersonalizedHomeFeed = {
      tasteProfile,
      newReleasesForYou,
      artistRadar,
      globalHits,
      similarArtists,
      moreLikeArtist,
      moreLikeSong,
      userPlaylists,
      radioMixes,
      heavyRotation,
      forYou,
      playlistAssisted,
      forgottenFavorites,
    };

    try {
      await redis.set(cacheKey, JSON.stringify(feed), "EX", 60); // 60s TTL
    } catch {}

    return feed;
  }

  // =========================================================================
  // 9. NEW RELEASES FOR YOU (Latest released albums matching taste profile)
  // =========================================================================
  async getNewReleasesForYou(
    userId?: string | null,
    limit: number = 8,
    existingCtx?: RecommendationContext
  ): Promise<any[]> {
    const ctx = existingCtx || (await this.resolveContext(userId));
    const cacheKey = cacheKeys.recommendations.newReleases(
      ctx.userId,
      ctx.mode.toLowerCase()
    );
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch {}

    let topGenres: string[] = [];
    if (ctx.userId) {
      const tasteProfile = await this.getUserTasteProfile(ctx.userId);
      topGenres = tasteProfile.topGenres.map((g) => g.genre);
    }

    const scopeFilter =
      ctx.mode === "MIXED" && ctx.userId
        ? or(
            and(
              eq(albums.scope, "GLOBAL"),
              eq(albums.status, "PUBLISHED"),
              eq(albums.visibility, "PUBLIC")
            ),
            and(
              eq(albums.scope, "PERSONAL"),
              eq(albums.uploaderUserId, ctx.userId)
            )
          )
        : and(
            eq(albums.scope, "GLOBAL"),
            eq(albums.status, "PUBLISHED"),
            eq(albums.visibility, "PUBLIC")
          );

    let releases = await db
      .select({
        id: albums.id,
        title: albums.title,
        slug: albums.slug,
        albumType: albums.albumType,
        coverImageUrl: albums.coverImageUrl,
        releaseDate: albums.releaseDate,
        publishedAt: albums.publishedAt,
        artistId: albums.artistId,
        artistStageName: artistProfiles.stageName,
        artistSlug: artistProfiles.slug,
        artistAvatarUrl: artistProfiles.avatarUrl,
        primaryGenre: albums.primaryGenre,
        totalTracks: albums.totalTracks,
      })
      .from(albums)
      .innerJoin(artistProfiles, eq(albums.artistId, artistProfiles.id))
      .where(
        and(
          scopeFilter,
          isNull(albums.deletedAt),
          gte(albums.releaseDate, sql`CURRENT_DATE - INTERVAL '6 months'`),
          topGenres.length > 0 ? inArray(albums.primaryGenre, topGenres) : sql`1=1`
        )
      )
      .orderBy(desc(albums.releaseDate))
      .limit(limit);

    if (releases.length < limit) {
      const existingIds = new Set(releases.map((r) => r.id));
      const needed = limit - releases.length;

      const fallback = await db
        .select({
          id: albums.id,
          title: albums.title,
          slug: albums.slug,
          albumType: albums.albumType,
          coverImageUrl: albums.coverImageUrl,
          releaseDate: albums.releaseDate,
          publishedAt: albums.publishedAt,
          artistId: albums.artistId,
          artistStageName: artistProfiles.stageName,
          artistSlug: artistProfiles.slug,
          artistAvatarUrl: artistProfiles.avatarUrl,
          primaryGenre: albums.primaryGenre,
          totalTracks: albums.totalTracks,
        })
        .from(albums)
        .innerJoin(artistProfiles, eq(albums.artistId, artistProfiles.id))
        .where(
          and(
            scopeFilter,
            isNull(albums.deletedAt),
            existingIds.size > 0 ? notInArray(albums.id, Array.from(existingIds)) : sql`1=1`
          )
        )
        .orderBy(desc(albums.releaseDate))
        .limit(needed);

      releases = [...releases, ...fallback];
    }

    const formatted = releases.map((rel) => ({
      ...rel,
      coverImageUrl: this.ensureFullUrl(rel.coverImageUrl),
      artistAvatarUrl: this.ensureFullUrl(rel.artistAvatarUrl),
    }));

    try {
      await redis.set(cacheKey, JSON.stringify(formatted), "EX", 600);
    } catch {}

    return formatted;
  }

  // =========================================================================
  // 10. GLOBAL HITS MATCHING TASTE (Popular songs matching user's top genres)
  // =========================================================================
  async getGlobalHitsForYou(
    userId?: string | null,
    limit: number = 8,
    existingCtx?: RecommendationContext
  ): Promise<ScoredRecommendationTrack[]> {
    const ctx = existingCtx || (await this.resolveContext(userId));
    const cacheKey = cacheKeys.recommendations.globalHits(
      ctx.userId,
      ctx.mode.toLowerCase()
    );
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch {}

    let topGenres: string[] = [];
    if (ctx.userId) {
      const tasteProfile = await this.getUserTasteProfile(ctx.userId);
      topGenres = tasteProfile.topGenres.map((g) => g.genre);
    }

    let hitsRows = await db
      .select({
        id: songs.id,
        title: songs.title,
        slug: songs.slug,
        artistId: songs.artistId,
        artistStageName: artistProfiles.stageName,
        artistSlug: artistProfiles.slug,
        artistVerified: artistProfiles.verified,
        albumId: songs.albumId,
        albumTitle: albums.title,
        albumSlug: albums.slug,
        albumType: albums.albumType,
        coverImageUrl: sql<string | null>`COALESCE(${songs.coverImageUrl}, ${albums.coverImageUrl})`,
        durationSeconds: songs.durationSeconds,
        audioUrl: songs.audioUrl,
        hlsManifestUrl: songs.hlsManifestUrl,
        primaryGenre: songs.primaryGenre,
        subGenre: songs.subGenre,
        moods: songs.moods,
        bpm: songs.bpm,
        energy: songs.energy,
        playsCount: songs.playsCount,
        likesCount: songs.likesCount,
      })
      .from(songs)
      .innerJoin(artistProfiles, eq(songs.artistId, artistProfiles.id))
      .leftJoin(albums, eq(songs.albumId, albums.id))
      .where(
        and(
          isNull(songs.deletedAt),
          this.getScopeCondition(songs, ctx),
          eq(songs.processingStatus, "READY"),
          topGenres.length > 0 ? inArray(songs.primaryGenre, topGenres) : sql`1=1`
        )
      )
      .orderBy(desc(songs.playsCount))
      .limit(limit);

    if (hitsRows.length < limit) {
      const existingIds = new Set(hitsRows.map((r) => r.id));
      const needed = limit - hitsRows.length;

      const topCuts = await db
        .select({
          id: songs.id,
          title: songs.title,
          slug: songs.slug,
          artistId: songs.artistId,
          artistStageName: artistProfiles.stageName,
          artistSlug: artistProfiles.slug,
          artistVerified: artistProfiles.verified,
          albumId: songs.albumId,
          albumTitle: albums.title,
          albumSlug: albums.slug,
          albumType: albums.albumType,
          coverImageUrl: sql<string | null>`COALESCE(${songs.coverImageUrl}, ${albums.coverImageUrl})`,
          durationSeconds: songs.durationSeconds,
          audioUrl: songs.audioUrl,
          hlsManifestUrl: songs.hlsManifestUrl,
          primaryGenre: songs.primaryGenre,
          subGenre: songs.subGenre,
          moods: songs.moods,
          bpm: songs.bpm,
          energy: songs.energy,
          playsCount: songs.playsCount,
          likesCount: songs.likesCount,
        })
        .from(songs)
        .innerJoin(artistProfiles, eq(songs.artistId, artistProfiles.id))
        .leftJoin(albums, eq(songs.albumId, albums.id))
        .where(
          and(
            isNull(songs.deletedAt),
            this.getScopeCondition(songs, ctx),
            eq(songs.processingStatus, "READY"),
            existingIds.size > 0 ? notInArray(songs.id, Array.from(existingIds)) : sql`1=1`
          )
        )
        .orderBy(desc(songs.playsCount))
        .limit(needed);

      hitsRows = [...hitsRows, ...topCuts];
    }

    const likedSet = ctx.userId
      ? await this.getUserLikedSongSet(ctx.userId, hitsRows.map((r) => r.id))
      : new Set<string>();

    const formatted: ScoredRecommendationTrack[] = hitsRows.map((h) => ({
      ...h,
      coverImageUrl: this.ensureFullUrl(h.coverImageUrl),
      moods: Array.isArray(h.moods) ? h.moods : [],
      isLiked: likedSet.has(h.id),
      score: h.playsCount,
      recommendationReason: `Global hit in ${h.primaryGenre || "popular rotation"}`,
    }));

    try {
      await redis.set(cacheKey, JSON.stringify(formatted), "EX", 600);
    } catch {}

    return formatted;
  }

  // =========================================================================
  // 11. MORE LIKE FAVOURITE ARTISTS (Similar artists and influenced cuts)
  // =========================================================================
  async getMoreLikeTopArtist(
    userId?: string | null,
    limit: number = 8,
    existingCtx?: RecommendationContext
  ): Promise<{
    artist: { id: string; stageName: string; slug: string; avatarUrl: string | null } | null;
    tracks: ScoredRecommendationTrack[];
  } | null> {
    const ctx = existingCtx || (await this.resolveContext(userId));
    const cacheKey = cacheKeys.recommendations.moreLikeArtist(
      ctx.userId,
      ctx.mode.toLowerCase()
    );
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch {}

    let targetArtistId: string | null = null;
    if (ctx.userId) {
      const topArtistRow = await db
        .select({
          artistId: songs.artistId,
          playCount: sql<number>`count(*)::int`,
        })
        .from(listeningHistory)
        .innerJoin(songs, eq(listeningHistory.songId, songs.id))
        .where(
          and(
            eq(listeningHistory.userId, ctx.userId),
            this.getScopeCondition(songs, ctx)
          )
        )
        .groupBy(songs.artistId)
        .orderBy(desc(sql`count(*)`))
        .limit(1);

      targetArtistId = topArtistRow[0]?.artistId || null;

      if (!targetArtistId) {
        const likedArtistRow = await db
          .select({ artistId: songs.artistId })
          .from(songLikes)
          .innerJoin(songs, eq(songLikes.songId, songs.id))
          .where(
            and(
              eq(songLikes.userId, ctx.userId),
              this.getScopeCondition(songs, ctx)
            )
          )
          .limit(1);
        targetArtistId = likedArtistRow[0]?.artistId || null;
      }
    }

    if (!targetArtistId) {
      const platformTopArtist = await db
        .select({ id: artistProfiles.id })
        .from(artistProfiles)
        .where(
          and(
            eq(artistProfiles.scope, "GLOBAL"),
            eq(artistProfiles.verified, true)
          )
        )
        .orderBy(desc(artistProfiles.monthlyListeners))
        .limit(1);
      targetArtistId = platformTopArtist[0]?.id || null;
    }

    if (!targetArtistId) return null;

    const [artist] = await db
      .select({
        id: artistProfiles.id,
        stageName: artistProfiles.stageName,
        slug: artistProfiles.slug,
        avatarUrl: artistProfiles.avatarUrl,
      })
      .from(artistProfiles)
      .where(eq(artistProfiles.id, targetArtistId))
      .limit(1);

    if (!artist) return null;

    const artistGenres = await db
      .select({ primaryGenre: songs.primaryGenre })
      .from(songs)
      .where(
        and(
          eq(songs.artistId, targetArtistId),
          isNull(songs.deletedAt),
          this.getScopeCondition(songs, ctx)
        )
      )
      .limit(10);

    const genres = Array.from(
      new Set(artistGenres.map((g) => g.primaryGenre).filter(Boolean) as string[])
    );

    const similarTracks = await db
      .select({
        id: songs.id,
        title: songs.title,
        slug: songs.slug,
        artistId: songs.artistId,
        artistStageName: artistProfiles.stageName,
        artistSlug: artistProfiles.slug,
        artistVerified: artistProfiles.verified,
        albumId: songs.albumId,
        albumTitle: albums.title,
        albumSlug: albums.slug,
        albumType: albums.albumType,
        coverImageUrl: sql<string | null>`COALESCE(${songs.coverImageUrl}, ${albums.coverImageUrl})`,
        durationSeconds: songs.durationSeconds,
        audioUrl: songs.audioUrl,
        hlsManifestUrl: songs.hlsManifestUrl,
        primaryGenre: songs.primaryGenre,
        subGenre: songs.subGenre,
        moods: songs.moods,
        bpm: songs.bpm,
        energy: songs.energy,
        playsCount: songs.playsCount,
        likesCount: songs.likesCount,
      })
      .from(songs)
      .innerJoin(artistProfiles, eq(songs.artistId, artistProfiles.id))
      .leftJoin(albums, eq(songs.albumId, albums.id))
      .where(
        and(
          ne(songs.artistId, targetArtistId),
          isNull(songs.deletedAt),
          this.getScopeCondition(songs, ctx),
          eq(songs.processingStatus, "READY"),
          genres.length > 0 ? inArray(songs.primaryGenre, genres) : sql`1=1`
        )
      )
      .orderBy(desc(songs.playsCount))
      .limit(limit);

    if (similarTracks.length < limit) {
      const existingIds = new Set(similarTracks.map((t) => t.id));
      const backfill = await db
        .select({
          id: songs.id,
          title: songs.title,
          slug: songs.slug,
          artistId: songs.artistId,
          artistStageName: artistProfiles.stageName,
          artistSlug: artistProfiles.slug,
          artistVerified: artistProfiles.verified,
          albumId: songs.albumId,
          albumTitle: albums.title,
          albumSlug: albums.slug,
          albumType: albums.albumType,
          coverImageUrl: sql<string | null>`COALESCE(${songs.coverImageUrl}, ${albums.coverImageUrl})`,
          durationSeconds: songs.durationSeconds,
          audioUrl: songs.audioUrl,
          hlsManifestUrl: songs.hlsManifestUrl,
          primaryGenre: songs.primaryGenre,
          subGenre: songs.subGenre,
          moods: songs.moods,
          bpm: songs.bpm,
          energy: songs.energy,
          playsCount: songs.playsCount,
          likesCount: songs.likesCount,
        })
        .from(songs)
        .innerJoin(artistProfiles, eq(songs.artistId, artistProfiles.id))
        .leftJoin(albums, eq(songs.albumId, albums.id))
        .where(
          and(
            ne(songs.artistId, targetArtistId),
            isNull(songs.deletedAt),
            this.getScopeCondition(songs, ctx),
            eq(songs.processingStatus, "READY"),
            existingIds.size > 0 ? notInArray(songs.id, Array.from(existingIds)) : sql`1=1`
          )
        )
        .orderBy(desc(songs.playsCount))
        .limit(limit - similarTracks.length);

      similarTracks.push(...backfill);
    }

    const likedSet = ctx.userId
      ? await this.getUserLikedSongSet(ctx.userId, similarTracks.map((r) => r.id))
      : new Set<string>();

    const result = {
      artist: {
        id: artist.id,
        stageName: artist.stageName,
        slug: artist.slug,
        avatarUrl: this.ensureFullUrl(artist.avatarUrl),
      },
      tracks: similarTracks.map((t) => ({
        ...t,
        coverImageUrl: this.ensureFullUrl(t.coverImageUrl),
        moods: Array.isArray(t.moods) ? t.moods : [],
        isLiked: likedSet.has(t.id),
        recommendationReason: `Inspired by listening to ${artist.stageName}`,
      })),
    };

    try {
      await redis.set(cacheKey, JSON.stringify(result), "EX", 600);
    } catch {}

    return result;
  }

  // =========================================================================
  // 11B. SIMILAR ARTISTS (Dedicated artists shelf: Artists similar to top artist)
  // Recommends actual artist profiles (circular avatar, stageName, slug, verified, monthlyListeners)
  // Clicking an artist navigates directly to /artists/$idOrSlug
  // =========================================================================
  async getSimilarArtists(
    userId?: string | null,
    limit: number = 8,
    existingCtx?: RecommendationContext
  ): Promise<{
    seedArtist: { id: string; stageName: string; slug: string; avatarUrl: string | null } | null;
    artists: SimilarArtistCard[];
  } | null> {
    const ctx = existingCtx || (await this.resolveContext(userId));
    const cacheKey = cacheKeys.recommendations.similarArtists(
      ctx.userId,
      ctx.mode.toLowerCase()
    );
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch {}

    let targetArtistId: string | null = null;
    if (ctx.userId) {
      const topArtistRow = await db
        .select({
          artistId: songs.artistId,
          playCount: sql<number>`count(*)::int`,
        })
        .from(listeningHistory)
        .innerJoin(songs, eq(listeningHistory.songId, songs.id))
        .where(
          and(
            eq(listeningHistory.userId, ctx.userId),
            this.getScopeCondition(songs, ctx)
          )
        )
        .groupBy(songs.artistId)
        .orderBy(desc(sql`count(*)`))
        .limit(1);

      targetArtistId = topArtistRow[0]?.artistId || null;

      if (!targetArtistId) {
        const likedArtistRow = await db
          .select({ artistId: songs.artistId })
          .from(songLikes)
          .innerJoin(songs, eq(songLikes.songId, songs.id))
          .where(
            and(
              eq(songLikes.userId, ctx.userId),
              this.getScopeCondition(songs, ctx)
            )
          )
          .limit(1);
        targetArtistId = likedArtistRow[0]?.artistId || null;
      }
    }

    if (!targetArtistId) {
      const platformTopArtist = await db
        .select({ id: artistProfiles.id })
        .from(artistProfiles)
        .where(
          and(
            eq(artistProfiles.scope, "GLOBAL"),
            eq(artistProfiles.verified, true)
          )
        )
        .orderBy(desc(artistProfiles.monthlyListeners))
        .limit(1);
      targetArtistId = platformTopArtist[0]?.id || null;
    }

    if (!targetArtistId) return null;

    const [seedArtist] = await db
      .select({
        id: artistProfiles.id,
        stageName: artistProfiles.stageName,
        slug: artistProfiles.slug,
        avatarUrl: artistProfiles.avatarUrl,
      })
      .from(artistProfiles)
      .where(eq(artistProfiles.id, targetArtistId))
      .limit(1);

    if (!seedArtist) return null;

    const artistGenres = await db
      .select({ primaryGenre: songs.primaryGenre })
      .from(songs)
      .where(
        and(
          eq(songs.artistId, targetArtistId),
          isNull(songs.deletedAt),
          this.getScopeCondition(songs, ctx)
        )
      )
      .limit(10);

    const genres = Array.from(
      new Set(artistGenres.map((g) => g.primaryGenre).filter(Boolean) as string[])
    );

    const similarArtistsRows = await db
      .select({
        id: artistProfiles.id,
        stageName: artistProfiles.stageName,
        slug: artistProfiles.slug,
        avatarUrl: artistProfiles.avatarUrl,
        verified: artistProfiles.verified,
        monthlyListeners: artistProfiles.monthlyListeners,
        scope: artistProfiles.scope,
      })
      .from(artistProfiles)
      .where(
        and(
          ne(artistProfiles.id, targetArtistId),
          this.getScopeCondition(artistProfiles, ctx),
          genres.length > 0
            ? inArray(
                artistProfiles.id,
                db
                  .select({ artistId: songs.artistId })
                  .from(songs)
                  .where(
                    and(
                      inArray(songs.primaryGenre, genres),
                      isNull(songs.deletedAt),
                      this.getScopeCondition(songs, ctx)
                    )
                  )
              )
            : sql`1=1`
        )
      )
      .orderBy(desc(artistProfiles.monthlyListeners))
      .limit(limit);

    let finalArtists = [...similarArtistsRows];
    if (finalArtists.length < limit) {
      const existingIds = new Set(finalArtists.map((a) => a.id));
      existingIds.add(targetArtistId);

      const backfill = await db
        .select({
          id: artistProfiles.id,
          stageName: artistProfiles.stageName,
          slug: artistProfiles.slug,
          avatarUrl: artistProfiles.avatarUrl,
          verified: artistProfiles.verified,
          monthlyListeners: artistProfiles.monthlyListeners,
          scope: artistProfiles.scope,
        })
        .from(artistProfiles)
        .where(
          and(
            notInArray(artistProfiles.id, Array.from(existingIds)),
            this.getScopeCondition(artistProfiles, ctx)
          )
        )
        .orderBy(desc(artistProfiles.monthlyListeners))
        .limit(limit - finalArtists.length);

      finalArtists = [...finalArtists, ...backfill];
    }

    const artistIds = finalArtists.map((a) => a.id);
    const artistGenreMap = new Map<string, string>();
    if (artistIds.length > 0) {
      const genreRows = await db
        .select({
          artistId: songs.artistId,
          primaryGenre: songs.primaryGenre,
        })
        .from(songs)
        .where(
          and(
            inArray(songs.artistId, artistIds),
            isNull(songs.deletedAt),
            this.getScopeCondition(songs, ctx)
          )
        )
        .limit(50);
      for (const row of genreRows) {
        if (row.primaryGenre && !artistGenreMap.has(row.artistId)) {
          artistGenreMap.set(row.artistId, row.primaryGenre);
        }
      }
    }

    const cards: SimilarArtistCard[] = finalArtists.map((a) => ({
      id: a.id,
      stageName: a.stageName,
      slug: a.slug,
      avatarUrl: this.ensureFullUrl(a.avatarUrl),
      verified: a.verified,
      monthlyListeners: a.monthlyListeners,
      primaryGenre: artistGenreMap.get(a.id) || null,
      scope: a.scope,
    }));

    const result = {
      seedArtist: {
        id: seedArtist.id,
        stageName: seedArtist.stageName,
        slug: seedArtist.slug,
        avatarUrl: this.ensureFullUrl(seedArtist.avatarUrl),
      },
      artists: cards,
    };

    try {
      await redis.set(cacheKey, JSON.stringify(result), "EX", 600);
    } catch {}

    return result;
  }

  // =========================================================================
  // 11B. SIMILAR ARTISTS FOR ARTIST PAGE (Strictly Global Variant)
  // Used on public artist pages (/artists/$idOrSlug).
  // Strictly enforces GLOBAL scope so zero private/locker content is leaked.
  // =========================================================================
  async getSimilarArtistsForArtist(
    artistIdOrSlug: string,
    limit: number = 8
  ): Promise<{
    seedArtist: { id: string; stageName: string; slug: string; avatarUrl: string | null } | null;
    artists: SimilarArtistCard[];
  } | null> {
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      artistIdOrSlug
    );

    // 1. Fetch seed artist
    const [seedArtist] = await db
      .select({
        id: artistProfiles.id,
        stageName: artistProfiles.stageName,
        slug: artistProfiles.slug,
        avatarUrl: artistProfiles.avatarUrl,
        scope: artistProfiles.scope,
      })
      .from(artistProfiles)
      .where(
        isUUID
          ? eq(artistProfiles.id, artistIdOrSlug)
          : eq(artistProfiles.slug, artistIdOrSlug)
      )
      .limit(1);

    if (!seedArtist) return null;

    const cacheKey = cacheKeys.recommendations.artistSimilar(seedArtist.id);
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch {}

    // 2. Fetch seed artist's primary genres and subgenres from catalog songs
    const artistGenres = await db
      .select({ primaryGenre: songs.primaryGenre })
      .from(songs)
      .where(
        and(
          eq(songs.artistId, seedArtist.id),
          isNull(songs.deletedAt)
        )
      )
      .limit(20);

    const genres = Array.from(
      new Set(artistGenres.map((g) => g.primaryGenre).filter(Boolean) as string[])
    );

    // 3. Query other artists matching genres - STRICTLY GLOBAL SCOPE
    const similarArtistsRows = await db
      .select({
        id: artistProfiles.id,
        stageName: artistProfiles.stageName,
        slug: artistProfiles.slug,
        avatarUrl: artistProfiles.avatarUrl,
        verified: artistProfiles.verified,
        monthlyListeners: artistProfiles.monthlyListeners,
        scope: artistProfiles.scope,
      })
      .from(artistProfiles)
      .where(
        and(
          ne(artistProfiles.id, seedArtist.id),
          eq(artistProfiles.scope, "GLOBAL"),
          genres.length > 0
            ? inArray(
                artistProfiles.id,
                db
                  .select({ artistId: songs.artistId })
                  .from(songs)
                  .where(
                    and(
                      inArray(songs.primaryGenre, genres),
                      isNull(songs.deletedAt),
                      eq(songs.scope, "GLOBAL")
                    )
                  )
              )
            : sql`1=1`
        )
      )
      .orderBy(desc(artistProfiles.monthlyListeners))
      .limit(limit);

    let finalArtists = [...similarArtistsRows];

    // 4. Backfill with top global artists if needed
    if (finalArtists.length < limit) {
      const existingIds = new Set(finalArtists.map((a) => a.id));
      existingIds.add(seedArtist.id);

      const backfill = await db
        .select({
          id: artistProfiles.id,
          stageName: artistProfiles.stageName,
          slug: artistProfiles.slug,
          avatarUrl: artistProfiles.avatarUrl,
          verified: artistProfiles.verified,
          monthlyListeners: artistProfiles.monthlyListeners,
          scope: artistProfiles.scope,
        })
        .from(artistProfiles)
        .where(
          and(
            notInArray(artistProfiles.id, Array.from(existingIds)),
            eq(artistProfiles.scope, "GLOBAL")
          )
        )
        .orderBy(desc(artistProfiles.monthlyListeners))
        .limit(limit - finalArtists.length);

      finalArtists = [...finalArtists, ...backfill];
    }

    // 5. Enrich with primaryGenre for badges
    const artistIds = finalArtists.map((a) => a.id);
    const artistGenreMap = new Map<string, string>();
    if (artistIds.length > 0) {
      const genreRows = await db
        .select({
          artistId: songs.artistId,
          primaryGenre: songs.primaryGenre,
        })
        .from(songs)
        .where(
          and(
            inArray(songs.artistId, artistIds),
            isNull(songs.deletedAt),
            eq(songs.scope, "GLOBAL")
          )
        )
        .limit(50);
      for (const row of genreRows) {
        if (row.primaryGenre && !artistGenreMap.has(row.artistId)) {
          artistGenreMap.set(row.artistId, row.primaryGenre);
        }
      }
    }

    const cards: SimilarArtistCard[] = finalArtists.map((a) => ({
      id: a.id,
      stageName: a.stageName,
      slug: a.slug,
      avatarUrl: this.ensureFullUrl(a.avatarUrl),
      verified: a.verified,
      monthlyListeners: a.monthlyListeners,
      primaryGenre: artistGenreMap.get(a.id) || null,
      scope: a.scope,
    }));

    const result = {
      seedArtist: {
        id: seedArtist.id,
        stageName: seedArtist.stageName,
        slug: seedArtist.slug,
        avatarUrl: this.ensureFullUrl(seedArtist.avatarUrl),
      },
      artists: cards,
    };

    try {
      await redis.set(cacheKey, JSON.stringify(result), "EX", 3600); // 1 hour TTL
    } catch {}

    return result;
  }

  // =========================================================================
  // 12. MORE LIKE FAVOURITE SONGS (Sonic continuity based on top song)
  // =========================================================================
  async getMoreLikeTopSong(
    userId?: string | null,
    limit: number = 8,
    existingCtx?: RecommendationContext
  ): Promise<{
    seedSong: ScoredRecommendationTrack | null;
    tracks: ScoredRecommendationTrack[];
  } | null> {
    const ctx = existingCtx || (await this.resolveContext(userId));
    const cacheKey = cacheKeys.recommendations.moreLikeSong(
      ctx.userId,
      ctx.mode.toLowerCase()
    );
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch {}

    let seedSongId: string | null = null;
    if (ctx.userId) {
      const topSongRow = await db
        .select({
          songId: listeningHistory.songId,
          playCount: sql<number>`count(*)::int`,
        })
        .from(listeningHistory)
        .innerJoin(songs, eq(listeningHistory.songId, songs.id))
        .where(
          and(
            eq(listeningHistory.userId, ctx.userId),
            eq(listeningHistory.completed, true),
            this.getScopeCondition(songs, ctx)
          )
        )
        .groupBy(listeningHistory.songId)
        .orderBy(desc(sql`count(*)`))
        .limit(1);

      seedSongId = topSongRow[0]?.songId || null;

      if (!seedSongId) {
        const likedSongRow = await db
          .select({ songId: songLikes.songId })
          .from(songLikes)
          .innerJoin(songs, eq(songLikes.songId, songs.id))
          .where(
            and(
              eq(songLikes.userId, ctx.userId),
              this.getScopeCondition(songs, ctx)
            )
          )
          .orderBy(desc(songLikes.createdAt))
          .limit(1);
        seedSongId = likedSongRow[0]?.songId || null;
      }
    }

    if (!seedSongId) {
      const platformTopSong = await db
        .select({ id: songs.id })
        .from(songs)
        .where(
          and(
            isNull(songs.deletedAt),
            eq(songs.scope, "GLOBAL"),
            eq(songs.processingStatus, "READY")
          )
        )
        .orderBy(desc(songs.playsCount))
        .limit(1);
      seedSongId = platformTopSong[0]?.id || null;
    }

    if (!seedSongId) return null;

    const [seed] = await db
      .select({
        id: songs.id,
        title: songs.title,
        slug: songs.slug,
        artistId: songs.artistId,
        artistStageName: artistProfiles.stageName,
        artistSlug: artistProfiles.slug,
        artistVerified: artistProfiles.verified,
        albumId: songs.albumId,
        albumTitle: albums.title,
        albumSlug: albums.slug,
        albumType: albums.albumType,
        coverImageUrl: sql<string | null>`COALESCE(${songs.coverImageUrl}, ${albums.coverImageUrl})`,
        durationSeconds: songs.durationSeconds,
        audioUrl: songs.audioUrl,
        hlsManifestUrl: songs.hlsManifestUrl,
        primaryGenre: songs.primaryGenre,
        subGenre: songs.subGenre,
        moods: songs.moods,
        bpm: songs.bpm,
        energy: songs.energy,
        playsCount: songs.playsCount,
        likesCount: songs.likesCount,
      })
      .from(songs)
      .innerJoin(artistProfiles, eq(songs.artistId, artistProfiles.id))
      .leftJoin(albums, eq(songs.albumId, albums.id))
      .where(and(eq(songs.id, seedSongId), isNull(songs.deletedAt), this.getScopeCondition(songs, ctx)))
      .limit(1);

    if (!seed) return null;

    const tracks = await this.getTrackRadio(seedSongId, limit, ctx);

    const result = {
      seedSong: {
        ...seed,
        coverImageUrl: this.ensureFullUrl(seed.coverImageUrl),
        moods: Array.isArray(seed.moods) ? seed.moods : [],
        recommendationReason: "Your top favorite track",
      },
      tracks,
    };

    try {
      await redis.set(cacheKey, JSON.stringify(result), "EX", 600);
    } catch {}

    return result;
  }

  // =========================================================================
  // 13. USER SAVED OR CREATED PLAYLISTS
  // =========================================================================
  async getUserPlaylistsSummary(
    userId: string,
    limit: number = 8
  ): Promise<UserPlaylistSummary[]> {
    const cacheKey = cacheKeys.recommendations.userPlaylists(userId);
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch {}

    const playlistRows = await db
      .select({
        id: playlists.id,
        title: playlists.title,
        description: playlists.description,
        coverImageUrl: playlists.coverImageUrl,
        ownerId: playlists.ownerId,
        ownerName: users.displayName,
        totalTracks: sql<number>`(select count(*) from playlist_songs where playlist_songs.playlist_id = ${playlists.id})::int`,
      })
      .from(playlists)
      .innerJoin(users, eq(playlists.ownerId, users.id))
      .where(
        or(
          eq(playlists.ownerId, userId),
          inArray(
            playlists.id,
            db
              .select({ playlistId: userLibraryPlaylists.playlistId })
              .from(userLibraryPlaylists)
              .where(eq(userLibraryPlaylists.userId, userId))
          )
        )
      )
      .orderBy(desc(playlists.updatedAt))
      .limit(limit);

    const summaries: UserPlaylistSummary[] = playlistRows.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      coverImageUrl: this.ensureFullUrl(p.coverImageUrl),
      totalTracks: p.totalTracks || 0,
      ownerName: p.ownerName,
      isOwner: p.ownerId === userId,
    }));

    try {
      await redis.set(cacheKey, JSON.stringify(summaries), "EX", 300);
    } catch {}

    return summaries;
  }

  // =========================================================================
  // 14. RADIO MIXES (From random 5 songs of user's top songs)
  // =========================================================================
  async getRadioMixes(
    userId?: string | null,
    count: number = 5,
    existingCtx?: RecommendationContext
  ): Promise<RadioMixCard[]> {
    const ctx = existingCtx || (await this.resolveContext(userId));
    const cacheKey = cacheKeys.recommendations.radioMixes(
      ctx.userId,
      ctx.mode.toLowerCase()
    );
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch {}

    let seedPool: any[] = [];

    if (ctx.userId) {
      const historySongs = await db
        .select({
          id: songs.id,
          title: songs.title,
          artistId: songs.artistId,
          artistStageName: artistProfiles.stageName,
          primaryGenre: songs.primaryGenre,
          coverImageUrl: sql<string | null>`COALESCE(${songs.coverImageUrl}, ${albums.coverImageUrl})`,
          plays: sql<number>`count(${listeningHistory.id})::int`,
        })
        .from(listeningHistory)
        .innerJoin(songs, eq(listeningHistory.songId, songs.id))
        .innerJoin(artistProfiles, eq(songs.artistId, artistProfiles.id))
        .leftJoin(albums, eq(songs.albumId, albums.id))
        .where(
          and(
            eq(listeningHistory.userId, ctx.userId),
            isNull(songs.deletedAt),
            this.getScopeCondition(songs, ctx)
          )
        )
        .groupBy(songs.id, artistProfiles.stageName, albums.coverImageUrl)
        .orderBy(desc(sql`count(${listeningHistory.id})`))
        .limit(15);

      seedPool = [...historySongs];

      if (seedPool.length < count) {
        const existingIds = new Set(seedPool.map((s) => s.id));
        const likedSongs = await db
          .select({
            id: songs.id,
            title: songs.title,
            artistId: songs.artistId,
            artistStageName: artistProfiles.stageName,
            primaryGenre: songs.primaryGenre,
            coverImageUrl: sql<string | null>`COALESCE(${songs.coverImageUrl}, ${albums.coverImageUrl})`,
            plays: songs.playsCount,
          })
          .from(songLikes)
          .innerJoin(songs, eq(songLikes.songId, songs.id))
          .innerJoin(artistProfiles, eq(songs.artistId, artistProfiles.id))
          .leftJoin(albums, eq(songs.albumId, albums.id))
          .where(
            and(
              eq(songLikes.userId, ctx.userId),
              isNull(songs.deletedAt),
              this.getScopeCondition(songs, ctx),
              existingIds.size > 0 ? notInArray(songs.id, Array.from(existingIds)) : sql`1=1`
            )
          )
          .limit(count - seedPool.length);

        seedPool = [...seedPool, ...likedSongs];
      }
    }

    if (seedPool.length < count) {
      const existingIds = new Set(seedPool.map((s) => s.id));
      const trending = await db
        .select({
          id: songs.id,
          title: songs.title,
          artistId: songs.artistId,
          artistStageName: artistProfiles.stageName,
          primaryGenre: songs.primaryGenre,
          coverImageUrl: sql<string | null>`COALESCE(${songs.coverImageUrl}, ${albums.coverImageUrl})`,
          plays: songs.playsCount,
        })
        .from(songs)
        .innerJoin(artistProfiles, eq(songs.artistId, artistProfiles.id))
        .leftJoin(albums, eq(songs.albumId, albums.id))
        .where(
          and(
            isNull(songs.deletedAt),
            this.getScopeCondition(songs, ctx),
            eq(songs.processingStatus, "READY"),
            existingIds.size > 0 ? notInArray(songs.id, Array.from(existingIds)) : sql`1=1`
          )
        )
        .orderBy(desc(songs.playsCount))
        .limit(count - seedPool.length);

      seedPool = [...seedPool, ...trending];
    }

    const chosenSeeds = seedPool.slice(0, count);

    const mixes: RadioMixCard[] = await Promise.all(
      chosenSeeds.map(async (seed) => {
        const radioTracks = await this.getTrackRadio(seed.id, 15, ctx);
        const otherArtists = Array.from(
          new Set(
            radioTracks
              .filter((t) => t.artistStageName !== seed.artistStageName)
              .map((t) => t.artistStageName)
          )
        ).slice(0, 3);

        const subtitle =
          otherArtists.length > 0
            ? `With ${otherArtists.join(", ")}, and more`
            : "Algorithmic Radio Mix";

        return {
          id: `radio:${seed.id}`,
          seedSongId: seed.id,
          seedSongTitle: seed.title,
          seedArtistName: seed.artistStageName,
          title: `${seed.title} Radio`,
          subtitle,
          coverImageUrl: this.ensureFullUrl(seed.coverImageUrl),
          primaryGenre: seed.primaryGenre,
          trackCount: radioTracks.length,
          previewTracks: radioTracks,
        };
      })
    );

    try {
      await redis.set(cacheKey, JSON.stringify(mixes), "EX", 1800);
    } catch {}

    return mixes;
  }

  // =========================================================================
  // HELPER: Batch Like Status Lookup
  // =========================================================================
  private async getUserLikedSongSet(
    userId: string,
    songIds: string[]
  ): Promise<Set<string>> {
    if (!songIds || songIds.length === 0) return new Set();

    const likedRows = await db
      .select({ songId: songLikes.songId })
      .from(songLikes)
      .where(and(eq(songLikes.userId, userId), inArray(songLikes.songId, songIds)));

    return new Set(likedRows.map((r) => r.songId));
  }
}

