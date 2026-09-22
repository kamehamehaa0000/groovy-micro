import { eq, and, sql, desc, asc, inArray, ilike, or, isNull, lte } from "drizzle-orm";
import crypto from "crypto";
import { db } from "../../db";
import { redis } from "../../db/redis";
import {
  playlists,
  playlistSongs,
  playlistCollaborators,
  userLibraryPlaylists,
  users,
  songs,
  albums,
  artistProfiles,
  type Playlist,
} from "../../db/schema";
import { playlistsCacheService, likesCacheService, cacheKeys, cacheManager, EMPTY_SENTINEL } from "../../lib/cache";
import type {
  CreatePlaylistInput,
  UpdatePlaylistInput,
  SearchPlaylistsQuery,
} from "./playlists.schemas";

export interface EnrichedPlaylistTrack {
  id: string;
  entryId: string;
  playlistId: string;
  position: number;
  addedAt: Date;
  addedByUserId: string;
  addedByDisplayName: string;
  addedByAvatarUrl: string | null;
  songId: string;
  title: string;
  slug: string;
  durationSeconds: number;
  audioUrl: string | null;
  hlsManifestUrl: string | null;
  isExplicit: boolean;
  coverImageUrl: string | null;
  albumId: string | null;
  albumTitle: string | null;
  albumCoverUrl: string | null;
  artistId: string;
  artistStageName: string;
  artistSlug: string;
  artistVerified: boolean;
  scope?: "GLOBAL" | "PERSONAL";
  uploaderUserId?: string | null;
  isLiked?: boolean;
  isStreamable?: boolean;
  scheduledReleaseAt?: Date | string | null;
  song?: any;
}

export interface PlaylistDetail {
  id: string;
  ownerId: string;
  ownerDisplayName: string;
  ownerAvatarUrl: string | null;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  mosaicCoverUrls: string[];
  mosaicCovers?: string[];
  visibility: "PUBLIC" | "UNLISTED" | "PRIVATE";
  isPublic: boolean;
  isCollaborative: boolean;
  collaborationToken: string | null;
  allowDuplicates: boolean;
  allowComments: boolean;
  savesCount: number;
  isSaved: boolean;
  isOwner: boolean;
  isCollaborator: boolean;
  tracksCount: number;
  totalDurationSeconds: number;
  tracks: EnrichedPlaylistTrack[];
  collaborators: any[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PlaylistSummary {
  id: string;
  ownerId: string;
  ownerDisplayName: string;
  ownerAvatarUrl: string | null;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  mosaicCoverUrls: string[];
  visibility: "PUBLIC" | "UNLISTED" | "PRIVATE";
  isPublic: boolean;
  isCollaborative: boolean;
  allowDuplicates: boolean;
  savesCount: number;
  isSaved: boolean;
  tracksCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export class PlaylistsService {
  private generateToken(prefix: string): string {
    return `${prefix}_${crypto.randomBytes(16).toString("hex")}`;
  }

  // =========================================================================
  // 1. CREATE & INITIALIZE
  // =========================================================================

  async createPlaylist(userId: string, input: CreatePlaylistInput): Promise<Playlist> {
    const visibility = input.visibility || "PUBLIC";
    const shareToken = visibility === "UNLISTED" ? this.generateToken("share") : null;

    const createdPlaylist = await db.transaction(async (tx) => {
      const [newPlaylist] = await tx
        .insert(playlists)
        .values({
          ownerId: userId,
          title: input.title,
          description: input.description ?? null,
          coverImageUrl: input.coverImageUrl ?? null,
          visibility,
          isPublic: visibility === "PUBLIC",
          isCollaborative: false,
          shareToken,
          collaborationToken: null,
          allowDuplicates: input.allowDuplicates ?? false,
          allowComments: input.allowComments ?? true,
          savesCount: 1,
        })
        .returning();

      // Automatically save playlist into creator's library
      await tx.insert(userLibraryPlaylists).values({
        userId,
        playlistId: newPlaylist.id,
      });

      if (input.initialSongIds && input.initialSongIds.length > 0) {
        // Validate song IDs exist and are released or owned by the creator
        const validSongs = await tx
          .select({
            id: songs.id,
            scope: songs.scope,
            uploaderUserId: songs.uploaderUserId,
            albumId: songs.albumId,
            albumStatus: albums.status,
            albumScheduledReleaseAt: albums.scheduledReleaseAt,
            artistUserId: artistProfiles.userId,
          })
          .from(songs)
          .innerJoin(artistProfiles, eq(songs.artistId, artistProfiles.id))
          .leftJoin(albums, eq(songs.albumId, albums.id))
          .where(and(inArray(songs.id, input.initialSongIds), isNull(songs.deletedAt)));

        const now = Date.now();
        const hasPersonalTrack = validSongs.some((s) => s.scope === "PERSONAL");
        if (hasPersonalTrack && visibility !== "PRIVATE") {
          throw new Error("Personal collection tracks can only be added to private playlists");
        }

        const addableSongs = validSongs.filter((s) => {
          if (s.scope === "PERSONAL") {
            return s.uploaderUserId === userId && visibility === "PRIVATE";
          }
          const isOwner = s.artistUserId === userId;
          const isLive =
            !s.albumId ||
            s.albumStatus === "PUBLISHED" ||
            (s.albumStatus === "SCHEDULED" &&
              s.albumScheduledReleaseAt &&
              new Date(s.albumScheduledReleaseAt).getTime() <= now);
          return isLive || isOwner;
        });

        const validSongIdSet = new Set(addableSongs.map((s) => s.id));
        const toAdd = input.allowDuplicates
          ? input.initialSongIds.filter((id) => validSongIdSet.has(id))
          : Array.from(new Set(input.initialSongIds.filter((id) => validSongIdSet.has(id))));

        if (toAdd.length > 0) {
          const rows = toAdd.map((songId, index) => ({
            playlistId: newPlaylist.id,
            songId,
            addedByUserId: userId,
            position: index,
          }));
          await tx.insert(playlistSongs).values(rows);
        }
      }

      return newPlaylist;
    });

    // Sync Redis Set for fast sync and 0ms checks
    const key = cacheKeys.social.userSavedPlaylists(userId);
    try {
      await redis.srem(key, EMPTY_SENTINEL);
      await redis.sadd(key, createdPlaylist.id);
      await redis.expire(key, 86400 * 7);
    } catch (err) {
      console.warn(`[PlaylistsService] Redis SADD failed for created playlist save:`, err);
    }

    return createdPlaylist;
  }

  // =========================================================================
  // 2. READ & DETAIL (WITH MOSAIC COVERS & PERMISSIONS)
  // =========================================================================

  async getPlaylistById(
    playlistId: string,
    currentUserId?: string,
    shareToken?: string,
    collabToken?: string
  ): Promise<PlaylistDetail> {
    const cachedData = await cacheManager.getOrSet(
      cacheKeys.social.playlist(playlistId),
      async () => {
        const [playlist] = await db
          .select({
            id: playlists.id,
            ownerId: playlists.ownerId,
            ownerDisplayName: users.displayName,
            ownerAvatarUrl: users.avatarUrl,
            title: playlists.title,
            description: playlists.description,
            coverImageUrl: playlists.coverImageUrl,
            visibility: playlists.visibility,
            isPublic: playlists.isPublic,
            isCollaborative: playlists.isCollaborative,
            shareToken: playlists.shareToken,
            collaborationToken: playlists.collaborationToken,
            allowDuplicates: playlists.allowDuplicates,
            allowComments: playlists.allowComments,
            savesCount: playlists.savesCount,
            createdAt: playlists.createdAt,
            updatedAt: playlists.updatedAt,
          })
          .from(playlists)
          .innerJoin(users, eq(playlists.ownerId, users.id))
          .where(eq(playlists.id, playlistId))
          .limit(1);

        if (!playlist) return null;

        const trackRows = await db
          .select({
            entryId: playlistSongs.id,
            position: playlistSongs.position,
            addedAt: playlistSongs.addedAt,
            addedByUserId: playlistSongs.addedByUserId,
            addedByDisplayName: users.displayName,
            addedByAvatarUrl: users.avatarUrl,
            songId: songs.id,
            title: songs.title,
            slug: songs.slug,
            durationSeconds: songs.durationSeconds,
            audioUrl: songs.audioUrl,
            hlsManifestUrl: songs.hlsManifestUrl,
            isExplicit: songs.isExplicit,
            songCoverUrl: songs.coverImageUrl,
            scope: songs.scope,
            uploaderUserId: songs.uploaderUserId,
            albumId: albums.id,
            albumTitle: albums.title,
            albumCoverUrl: albums.coverImageUrl,
            albumStatus: albums.status,
            albumScheduledReleaseAt: albums.scheduledReleaseAt,
            artistId: artistProfiles.id,
            artistUserId: artistProfiles.userId,
            artistStageName: artistProfiles.stageName,
            artistSlug: artistProfiles.slug,
            artistVerified: artistProfiles.verified,
          })
          .from(playlistSongs)
          .innerJoin(songs, eq(playlistSongs.songId, songs.id))
          .innerJoin(artistProfiles, eq(songs.artistId, artistProfiles.id))
          .leftJoin(albums, eq(songs.albumId, albums.id))
          .innerJoin(users, eq(playlistSongs.addedByUserId, users.id))
          .where(and(eq(playlistSongs.playlistId, playlistId), isNull(songs.deletedAt)))
          .orderBy(asc(playlistSongs.position));

        let collaborators: any[] = [];
        if (playlist.isCollaborative) {
          try {
            collaborators = await this.listCollaboratorsInternal(playlistId);
          } catch (err) {
            collaborators = [];
          }
        }

        return { playlist, trackRows, collaborators };
      },
      3600
    );

    if (!cachedData || !cachedData.playlist) {
      throw new Error("Playlist not found");
    }

    const { playlist, trackRows, collaborators } = cachedData;

    const isOwner = currentUserId === playlist.ownerId;
    let isCollaborator = false;

    if (currentUserId && !isOwner) {
      isCollaborator = (collaborators ?? []).some((c: any) => c.userId === currentUserId);
      if (!isCollaborator) {
        const [collab] = await db
          .select()
          .from(playlistCollaborators)
          .where(
            and(
              eq(playlistCollaborators.playlistId, playlistId),
              eq(playlistCollaborators.userId, currentUserId)
            )
          )
          .limit(1);
        isCollaborator = !!collab;
      }
    }

    const hasValidCollabToken = !!(
      playlist.isCollaborative &&
      playlist.collaborationToken &&
      collabToken &&
      playlist.collaborationToken === collabToken
    );

    // Permission Enforcement
    if (playlist.visibility === "PRIVATE" && !isOwner && !isCollaborator && !hasValidCollabToken) {
      throw new Error("This playlist is private");
    }

    if (playlist.visibility === "UNLISTED" && !isOwner && !isCollaborator && !hasValidCollabToken) {
      if (!shareToken || shareToken !== playlist.shareToken) {
        throw new Error("Invalid or missing share link token for unlisted playlist");
      }
    }

    // Construct enriched tracklist with release status gating
    const now = Date.now();
    const tracks: EnrichedPlaylistTrack[] = trackRows.map((row: any) => {
      const isArtistOwner = !!(currentUserId && row.artistUserId === currentUserId);
      const isPersonalOwner = !!(currentUserId && row.uploaderUserId === currentUserId);

      let isStreamable = false;
      let isLive = false;
      if (row.scope === "PERSONAL") {
        isStreamable = isPersonalOwner;
      } else {
        isLive =
          !row.albumId ||
          row.albumStatus === "PUBLISHED" ||
          (row.albumStatus === "SCHEDULED" &&
            row.albumScheduledReleaseAt &&
            new Date(row.albumScheduledReleaseAt).getTime() <= now);
        isStreamable = isLive || isArtistOwner;
      }

      const coverUrl = row.songCoverUrl || row.albumCoverUrl;
      const scheduledRelease = !isLive && row.albumScheduledReleaseAt ? row.albumScheduledReleaseAt : null;

      const songObj = {
        id: row.songId,
        title: row.title,
        slug: row.slug,
        durationSeconds: row.durationSeconds,
        audioUrl: isStreamable ? row.audioUrl : null,
        hlsManifestUrl: isStreamable ? row.hlsManifestUrl : null,
        isExplicit: row.isExplicit,
        coverImageUrl: coverUrl,
        albumId: row.albumId,
        albumTitle: row.albumTitle,
        albumCoverUrl: row.albumCoverUrl,
        artistId: row.artistId,
        artistStageName: row.artistStageName,
        artistSlug: row.artistSlug,
        artistVerified: row.artistVerified,
        scope: row.scope,
        uploaderUserId: row.uploaderUserId,
        isStreamable,
        scheduledReleaseAt: scheduledRelease,
        isLiked: false,
      };

      return {
        id: row.entryId,
        entryId: row.entryId,
        playlistId,
        position: row.position,
        addedAt: row.addedAt,
        addedByUserId: row.addedByUserId,
        addedByDisplayName: row.addedByDisplayName,
        addedByAvatarUrl: row.addedByAvatarUrl,
        songId: row.songId,
        title: row.title,
        slug: row.slug,
        durationSeconds: row.durationSeconds,
        audioUrl: isStreamable ? row.audioUrl : null,
        hlsManifestUrl: isStreamable ? row.hlsManifestUrl : null,
        isExplicit: row.isExplicit,
        coverImageUrl: coverUrl,
        albumId: row.albumId,
        albumTitle: row.albumTitle,
        albumCoverUrl: row.albumCoverUrl,
        artistId: row.artistId,
        artistStageName: row.artistStageName,
        artistSlug: row.artistSlug,
        artistVerified: row.artistVerified,
        scope: row.scope,
        uploaderUserId: row.uploaderUserId,
        isStreamable,
        scheduledReleaseAt: scheduledRelease,
        song: songObj,
      };
    });

    // Enrich songs with user likes (0ms Redis Set check)
    const enrichedTracksWithLikes = await likesCacheService.enrichSongsWithLikes(
      currentUserId,
      tracks.map((t) => ({ ...t, id: t.songId }))
    );

    for (let i = 0; i < tracks.length; i++) {
      const isLiked = enrichedTracksWithLikes[i]?.isLiked ?? false;
      tracks[i].isLiked = isLiked;
      if (tracks[i].song) {
        tracks[i].song.isLiked = isLiked;
      }
    }

    // Compute mosaic covers (first 4 unique covers from streamable/released tracks only)
    const mosaicCoverUrls: string[] = [];
    for (const t of tracks) {
      if (!t.isStreamable) continue;
      const cover = t.coverImageUrl || t.albumCoverUrl;
      if (cover && !mosaicCoverUrls.includes(cover)) {
        mosaicCoverUrls.push(cover);
        if (mosaicCoverUrls.length === 4) break;
      }
    }

    const isSaved = await playlistsCacheService.isPlaylistSaved(currentUserId, playlistId);
    const totalDurationSeconds = tracks.reduce((acc, t) => acc + t.durationSeconds, 0);

    return {
      id: playlist.id,
      ownerId: playlist.ownerId,
      ownerDisplayName: playlist.ownerDisplayName,
      ownerAvatarUrl: playlist.ownerAvatarUrl,
      title: playlist.title,
      description: playlist.description,
      coverImageUrl: playlist.coverImageUrl,
      mosaicCoverUrls,
      mosaicCovers: mosaicCoverUrls,
      visibility: playlist.visibility,
      isPublic: playlist.isPublic,
      isCollaborative: playlist.isCollaborative,
      collaborationToken: isOwner || isCollaborator ? playlist.collaborationToken : null,
      allowDuplicates: playlist.allowDuplicates,
      allowComments: playlist.allowComments,
      savesCount: playlist.savesCount,
      isSaved,
      isOwner,
      isCollaborator,
      tracksCount: tracks.length,
      totalDurationSeconds,
      tracks,
      collaborators,
      createdAt: playlist.createdAt,
      updatedAt: playlist.updatedAt,
    };
  }

  // =========================================================================
  // 3. SEARCH & DISCOVERY (PUBLIC PLAYLISTS)
  // =========================================================================

  async searchPublicPlaylists(
    params: SearchPlaylistsQuery,
    currentUserId?: string
  ): Promise<{ data: PlaylistSummary[]; total: number; page: number; limit: number }> {
    const { search, page, limit } = params;
    const offset = (page - 1) * limit;

    const conditions = [eq(playlists.visibility, "PUBLIC")];
    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      conditions.push(or(ilike(playlists.title, q), ilike(playlists.description, q))!);
    }

    const whereClause = and(...conditions);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(playlists)
      .where(whereClause);

    const playlistRows = await db
      .select({
        id: playlists.id,
        ownerId: playlists.ownerId,
        ownerDisplayName: users.displayName,
        ownerAvatarUrl: users.avatarUrl,
        title: playlists.title,
        description: playlists.description,
        coverImageUrl: playlists.coverImageUrl,
        visibility: playlists.visibility,
        isPublic: playlists.isPublic,
        isCollaborative: playlists.isCollaborative,
        allowDuplicates: playlists.allowDuplicates,
        savesCount: playlists.savesCount,
        createdAt: playlists.createdAt,
        updatedAt: playlists.updatedAt,
        tracksCount: sql<number>`(
          SELECT count(*)::int
          FROM playlist_songs
          INNER JOIN songs ON songs.id = playlist_songs.song_id
          WHERE playlist_songs.playlist_id = playlists.id
            AND songs.deleted_at IS NULL
            AND songs.scope = 'GLOBAL'
        )`,
      })
      .from(playlists)
      .innerJoin(users, eq(playlists.ownerId, users.id))
      .where(whereClause)
      .orderBy(desc(playlists.savesCount), desc(playlists.createdAt))
      .limit(limit)
      .offset(offset);

    // Compute mosaic covers for summaries
    const playlistIds = playlistRows.map((p) => p.id);
    const mosaicCoversMap = new Map<string, string[]>();

    if (playlistIds.length > 0) {
      const constituentCovers = await db
        .select({
          playlistId: playlistSongs.playlistId,
          coverUrl: sql<string>`COALESCE(${songs.coverImageUrl}, ${albums.coverImageUrl})`,
        })
        .from(playlistSongs)
        .innerJoin(songs, eq(playlistSongs.songId, songs.id))
        .leftJoin(albums, eq(songs.albumId, albums.id))
        .where(
          and(
            inArray(playlistSongs.playlistId, playlistIds),
            isNull(songs.deletedAt),
            eq(songs.scope, "GLOBAL"),
            sql`COALESCE(${songs.coverImageUrl}, ${albums.coverImageUrl}) IS NOT NULL`,
            or(
              isNull(albums.id),
              eq(albums.status, "PUBLISHED"),
              and(eq(albums.status, "SCHEDULED"), lte(albums.scheduledReleaseAt, sql`NOW()`))
            )
          )
        )
        .orderBy(asc(playlistSongs.position));

      for (const row of constituentCovers) {
        const existing = mosaicCoversMap.get(row.playlistId) || [];
        if (!existing.includes(row.coverUrl) && existing.length < 4) {
          existing.push(row.coverUrl);
          mosaicCoversMap.set(row.playlistId, existing);
        }
      }
    }

    const summaries: PlaylistSummary[] = playlistRows.map((p) => ({
      ...p,
      mosaicCoverUrls: mosaicCoversMap.get(p.id) || [],
      isSaved: false,
    }));

    const enriched = await playlistsCacheService.enrichPlaylistsWithSaves(summaries, currentUserId);

    return {
      data: enriched,
      total: countResult?.count ?? 0,
      page,
      limit,
    };
  }

  // =========================================================================
  // 4. USER OWNED & USER SAVED PLAYLISTS
  // =========================================================================

  async getUserPlaylists(targetUserId: string, currentUserId?: string): Promise<PlaylistSummary[]> {
    const isSelf = targetUserId === currentUserId;
    const conditions = [eq(playlists.ownerId, targetUserId)];

    if (!isSelf) {
      conditions.push(eq(playlists.visibility, "PUBLIC"));
    }

    const rows = await db
      .select({
        id: playlists.id,
        ownerId: playlists.ownerId,
        ownerDisplayName: users.displayName,
        ownerAvatarUrl: users.avatarUrl,
        title: playlists.title,
        description: playlists.description,
        coverImageUrl: playlists.coverImageUrl,
        visibility: playlists.visibility,
        isPublic: playlists.isPublic,
        isCollaborative: playlists.isCollaborative,
        allowDuplicates: playlists.allowDuplicates,
        savesCount: playlists.savesCount,
        createdAt: playlists.createdAt,
        updatedAt: playlists.updatedAt,
        tracksCount: sql<number>`(
          SELECT count(*)::int
          FROM playlist_songs
          INNER JOIN songs ON songs.id = playlist_songs.song_id
          WHERE playlist_songs.playlist_id = playlists.id
            AND songs.deleted_at IS NULL
        )`,
      })
      .from(playlists)
      .innerJoin(users, eq(playlists.ownerId, users.id))
      .where(and(...conditions))
      .orderBy(desc(playlists.updatedAt));

    const summaries: PlaylistSummary[] = rows.map((r) => ({
      ...r,
      mosaicCoverUrls: [],
      isSaved: false,
    }));

    return await playlistsCacheService.enrichPlaylistsWithSaves(summaries, currentUserId);
  }

  async getUserSavedPlaylists(userId: string): Promise<PlaylistSummary[]> {
    const rows = await db
      .select({
        id: playlists.id,
        ownerId: playlists.ownerId,
        ownerDisplayName: users.displayName,
        ownerAvatarUrl: users.avatarUrl,
        title: playlists.title,
        description: playlists.description,
        coverImageUrl: playlists.coverImageUrl,
        visibility: playlists.visibility,
        isPublic: playlists.isPublic,
        isCollaborative: playlists.isCollaborative,
        allowDuplicates: playlists.allowDuplicates,
        savesCount: playlists.savesCount,
        createdAt: playlists.createdAt,
        updatedAt: playlists.updatedAt,
        tracksCount: sql<number>`(
          SELECT count(*)::int
          FROM playlist_songs
          INNER JOIN songs ON songs.id = playlist_songs.song_id
          WHERE playlist_songs.playlist_id = playlists.id
            AND songs.deleted_at IS NULL
        )`,
      })
      .from(userLibraryPlaylists)
      .innerJoin(playlists, eq(userLibraryPlaylists.playlistId, playlists.id))
      .innerJoin(users, eq(playlists.ownerId, users.id))
      .where(eq(userLibraryPlaylists.userId, userId))
      .orderBy(desc(userLibraryPlaylists.savedAt));

    return rows.map((r) => ({
      ...r,
      mosaicCoverUrls: [],
      isSaved: true,
    }));
  }

  // =========================================================================
  // 5. UPDATE & DELETE PLAYLIST
  // =========================================================================

  async updatePlaylist(
    userId: string,
    playlistId: string,
    input: UpdatePlaylistInput
  ): Promise<Playlist> {
    const [existing] = await db
      .select()
      .from(playlists)
      .where(eq(playlists.id, playlistId))
      .limit(1);

    if (!existing) throw new Error("Playlist not found");
    if (existing.ownerId !== userId) throw new Error("Only the playlist creator can edit metadata");

    if (input.visibility !== undefined && input.visibility !== "PRIVATE") {
      const [personalTrack] = await db
        .select({ id: playlistSongs.id })
        .from(playlistSongs)
        .innerJoin(songs, eq(playlistSongs.songId, songs.id))
        .where(
          and(
            eq(playlistSongs.playlistId, playlistId),
            eq(songs.scope, "PERSONAL"),
            isNull(songs.deletedAt)
          )
        )
        .limit(1);

      if (personalTrack) {
        throw new Error("Cannot make playlist public or unlisted while it contains personal collection tracks");
      }
    }

    let shareToken = existing.shareToken;
    if (input.visibility === "UNLISTED" && !shareToken) {
      shareToken = this.generateToken("share");
    }

    const [updated] = await db
      .update(playlists)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.coverImageUrl !== undefined ? { coverImageUrl: input.coverImageUrl } : {}),
        ...(input.visibility !== undefined
          ? {
              visibility: input.visibility,
              isPublic: input.visibility === "PUBLIC",
              shareToken,
            }
          : {}),
        ...(input.allowDuplicates !== undefined ? { allowDuplicates: input.allowDuplicates } : {}),
        ...(input.allowComments !== undefined ? { allowComments: input.allowComments } : {}),
        updatedAt: new Date(),
      })
      .where(eq(playlists.id, playlistId))
      .returning();

    await playlistsCacheService.invalidatePlaylistCache(playlistId);
    return updated;
  }

  async deletePlaylist(userId: string, playlistId: string): Promise<void> {
    const [existing] = await db
      .select()
      .from(playlists)
      .where(eq(playlists.id, playlistId))
      .limit(1);

    if (!existing) throw new Error("Playlist not found");
    if (existing.ownerId !== userId) throw new Error("Only the playlist creator can delete it");

    await playlistsCacheService.cleanupUserSavedPlaylists(playlistId);
    await db.delete(playlists).where(eq(playlists.id, playlistId));
    await playlistsCacheService.invalidatePlaylistCache(playlistId);
  }

  // =========================================================================
  // 6. TRACKLIST MANAGEMENT (ADD, REMOVE, ATOMIC REORDER)
  // =========================================================================

  async addTracks(
    userId: string,
    playlistId: string,
    songIds: string[]
  ): Promise<{ addedCount: number }> {
    const [playlist] = await db
      .select()
      .from(playlists)
      .where(eq(playlists.id, playlistId))
      .limit(1);

    if (!playlist) throw new Error("Playlist not found");

    const isOwner = playlist.ownerId === userId;
    let isCollaborator = false;
    if (!isOwner && playlist.isCollaborative) {
      const [collab] = await db
        .select()
        .from(playlistCollaborators)
        .where(
          and(
            eq(playlistCollaborators.playlistId, playlistId),
            eq(playlistCollaborators.userId, userId)
          )
        )
        .limit(1);
      isCollaborator = !!collab;
    }

    if (!isOwner && !isCollaborator) {
      throw new Error("You do not have permission to add tracks to this playlist");
    }

    // Verify songs exist and are eligible to be added (released or owned by the adding artist)
    const validSongs = await db
      .select({
        id: songs.id,
        scope: songs.scope,
        uploaderUserId: songs.uploaderUserId,
        albumId: songs.albumId,
        albumStatus: albums.status,
        albumScheduledReleaseAt: albums.scheduledReleaseAt,
        artistUserId: artistProfiles.userId,
      })
      .from(songs)
      .innerJoin(artistProfiles, eq(songs.artistId, artistProfiles.id))
      .leftJoin(albums, eq(songs.albumId, albums.id))
      .where(and(inArray(songs.id, songIds), isNull(songs.deletedAt)));

    const addableSongs = validSongs.filter((s) => {
      if (s.scope === "PERSONAL") {
        return (
          playlist.visibility === "PRIVATE" &&
          !playlist.isCollaborative &&
          isOwner &&
          s.uploaderUserId === userId
        );
      }
      // Any global catalog song (published or upcoming scheduled) can be added to playlists
      return true;
    });

    const validSongIdSet = new Set(addableSongs.map((s) => s.id));
    let toAdd = songIds.filter((id) => validSongIdSet.has(id));

    if (toAdd.length === 0) {
      const hasAttemptedPersonal = validSongs.some((s) => s.scope === "PERSONAL");
      if (hasAttemptedPersonal) {
        throw new Error(
          "Personal collection tracks can only be added to private, non-collaborative playlists owned by you"
        );
      }
      throw new Error("No eligible songs found to add");
    }

    // Duplicate check if allowDuplicates is false
    if (!playlist.allowDuplicates) {
      const existingEntries = await db
        .select({ songId: playlistSongs.songId })
        .from(playlistSongs)
        .where(eq(playlistSongs.playlistId, playlistId));

      const existingSet = new Set(existingEntries.map((e) => e.songId));
      toAdd = Array.from(new Set(toAdd)).filter((id) => !existingSet.has(id));

      if (toAdd.length === 0) {
        throw new Error("Track(s) already exist in this playlist");
      }
    }

    // Determine current max position
    const [posRow] = await db
      .select({ maxPos: sql<number>`COALESCE(MAX(${playlistSongs.position}), -1)` })
      .from(playlistSongs)
      .where(eq(playlistSongs.playlistId, playlistId));

    const startPos = (posRow?.maxPos ?? -1) + 1;
    const rows = toAdd.map((songId, idx) => ({
      playlistId,
      songId,
      addedByUserId: userId,
      position: startPos + idx,
    }));

    await db.insert(playlistSongs).values(rows);
    await db.update(playlists).set({ updatedAt: new Date() }).where(eq(playlists.id, playlistId));
    await playlistsCacheService.invalidatePlaylistCache(playlistId);

    return { addedCount: toAdd.length };
  }

  async removeTrack(userId: string, playlistId: string, entryId: string): Promise<void> {
    const [playlist] = await db
      .select()
      .from(playlists)
      .where(eq(playlists.id, playlistId))
      .limit(1);

    if (!playlist) throw new Error("Playlist not found");

    const isOwner = playlist.ownerId === userId;
    let isCollaborator = false;
    if (!isOwner && playlist.isCollaborative) {
      const [collab] = await db
        .select()
        .from(playlistCollaborators)
        .where(
          and(
            eq(playlistCollaborators.playlistId, playlistId),
            eq(playlistCollaborators.userId, userId)
          )
        )
        .limit(1);
      isCollaborator = !!collab;
    }

    if (!isOwner && !isCollaborator) {
      throw new Error("You do not have permission to remove tracks from this playlist");
    }

    const [entry] = await db
      .select()
      .from(playlistSongs)
      .where(and(eq(playlistSongs.id, entryId), eq(playlistSongs.playlistId, playlistId)))
      .limit(1);

    if (!entry) throw new Error("Track entry not found in playlist");

    if (!isOwner && isCollaborator) {
      if (entry.addedByUserId !== userId) {
        throw new Error("Collaborators can only remove tracks they added themselves");
      }
    }

    await db.delete(playlistSongs).where(eq(playlistSongs.id, entryId));
    await db.update(playlists).set({ updatedAt: new Date() }).where(eq(playlists.id, playlistId));
    await playlistsCacheService.invalidatePlaylistCache(playlistId);
  }

  /**
   * Option 1: Sequential Integers (Atomic Batch Reorder in a single transaction)
   */
  async reorderTracks(
    userId: string,
    playlistId: string,
    orderedEntryIds: string[]
  ): Promise<{ reorderedCount: number }> {
    const [playlist] = await db
      .select()
      .from(playlists)
      .where(eq(playlists.id, playlistId))
      .limit(1);

    if (!playlist) throw new Error("Playlist not found");

    const isOwner = playlist.ownerId === userId;
    let isCollaborator = false;
    if (!isOwner && playlist.isCollaborative) {
      const [collab] = await db
        .select()
        .from(playlistCollaborators)
        .where(
          and(
            eq(playlistCollaborators.playlistId, playlistId),
            eq(playlistCollaborators.userId, userId)
          )
        )
        .limit(1);
      isCollaborator = !!collab;
    }

    if (!isOwner && !isCollaborator) {
      throw new Error("You do not have permission to reorder tracks in this playlist");
    }

    await db.transaction(async (tx) => {
      // Execute atomic updates with CASE statement
      const sqlChunks = [sql`CASE ${playlistSongs.id}`];
      for (let i = 0; i < orderedEntryIds.length; i++) {
        sqlChunks.push(sql`WHEN ${orderedEntryIds[i]}::uuid THEN ${i}`);
      }
      sqlChunks.push(sql`ELSE ${playlistSongs.position} END`);

      const finalCase = sql.join(sqlChunks, sql` `);

      await tx
        .update(playlistSongs)
        .set({ position: finalCase })
        .where(
          and(
            eq(playlistSongs.playlistId, playlistId),
            inArray(playlistSongs.id, orderedEntryIds)
          )
        );

      await tx
        .update(playlists)
        .set({ updatedAt: new Date() })
        .where(eq(playlists.id, playlistId));
    });

    await playlistsCacheService.invalidatePlaylistCache(playlistId);
    return { reorderedCount: orderedEntryIds.length };
  }

  // =========================================================================
  // 7. CLONING PLAYLISTS
  // =========================================================================

  async clonePlaylist(userId: string, playlistId: string, shareToken?: string): Promise<Playlist> {
    const [source] = await db
      .select()
      .from(playlists)
      .where(eq(playlists.id, playlistId))
      .limit(1);

    if (!source) throw new Error("Source playlist not found");

    const isOwner = source.ownerId === userId;

    // Strict rule: PRIVATE playlists cannot be cloned by anyone except the owner
    if (source.visibility === "PRIVATE" && !isOwner) {
      throw new Error("Private playlists can only be cloned by their creator");
    }

    if (source.visibility === "UNLISTED" && !isOwner) {
      if (!shareToken || shareToken !== source.shareToken) {
        throw new Error("Invalid or missing share token to clone unlisted playlist");
      }
    }

    const sourceTracks = await db
      .select({
        songId: playlistSongs.songId,
        position: playlistSongs.position,
        scope: songs.scope,
        uploaderUserId: songs.uploaderUserId,
      })
      .from(playlistSongs)
      .innerJoin(songs, eq(playlistSongs.songId, songs.id))
      .where(and(eq(playlistSongs.playlistId, playlistId), isNull(songs.deletedAt)))
      .orderBy(asc(playlistSongs.position));

    // Filter out personal songs: only include if scope is GLOBAL or (scope is PERSONAL and cloner is the uploader)
    const eligibleTracks = sourceTracks.filter(
      (t) => t.scope === "GLOBAL" || (t.scope === "PERSONAL" && t.uploaderUserId === userId)
    );

    const clonedPlaylist = await db.transaction(async (tx) => {
      const [cloned] = await tx
        .insert(playlists)
        .values({
          ownerId: userId,
          title: `${source.title} (Copy)`,
          description: source.description,
          coverImageUrl: source.coverImageUrl,
          visibility: "PRIVATE",
          isPublic: false,
          isCollaborative: false,
          allowDuplicates: source.allowDuplicates,
          savesCount: 0,
        })
        .returning();

      if (eligibleTracks.length > 0) {
        const rows = eligibleTracks.map((t, idx) => ({
          playlistId: cloned.id,
          songId: t.songId,
          addedByUserId: userId,
          position: idx,
        }));
        await tx.insert(playlistSongs).values(rows);
      }

      return cloned;
    });

    // Automatically bookmark/save cloned playlist into cloner's library
    const saveRes = await playlistsCacheService.savePlaylist(userId, clonedPlaylist.id);
    clonedPlaylist.savesCount = saveRes.savesCount;

    return clonedPlaylist;
  }

  // =========================================================================
  // 8. LIBRARY SAVES & FAST SYNC
  // =========================================================================

  async savePlaylist(
    userId: string,
    playlistId: string
  ): Promise<{ saved: boolean; savesCount: number }> {
    return await playlistsCacheService.savePlaylist(userId, playlistId);
  }

  async unsavePlaylist(
    userId: string,
    playlistId: string
  ): Promise<{ saved: boolean; savesCount: number }> {
    return await playlistsCacheService.unsavePlaylist(userId, playlistId);
  }

  async getUserSavedPlaylistIds(userId: string): Promise<string[]> {
    const set = await playlistsCacheService.getUserSavedPlaylistIds(userId);
    return Array.from(set);
  }

  // =========================================================================
  // 9. COLLABORATION LIFECYCLE (TOKEN & MEMBERS)
  // =========================================================================

  async enableCollaboration(
    userId: string,
    playlistId: string
  ): Promise<{ collaborationToken: string }> {
    const [playlist] = await db
      .select()
      .from(playlists)
      .where(eq(playlists.id, playlistId))
      .limit(1);

    if (!playlist) throw new Error("Playlist not found");
    if (playlist.ownerId !== userId) throw new Error("Only the playlist creator can enable collaboration");

    // Check if playlist contains any personal collection tracks
    const [personalTrack] = await db
      .select({ id: playlistSongs.id })
      .from(playlistSongs)
      .innerJoin(songs, eq(playlistSongs.songId, songs.id))
      .where(
        and(
          eq(playlistSongs.playlistId, playlistId),
          eq(songs.scope, "PERSONAL"),
          isNull(songs.deletedAt)
        )
      )
      .limit(1);

    if (personalTrack) {
      throw new Error("Cannot enable collaboration on a playlist containing personal collection tracks");
    }

    const token = this.generateToken("collab");
    await db
      .update(playlists)
      .set({
        isCollaborative: true,
        collaborationToken: token,
        updatedAt: new Date(),
      })
      .where(eq(playlists.id, playlistId));

    await playlistsCacheService.invalidatePlaylistCache(playlistId);
    return { collaborationToken: token };
  }

  async regenerateCollaborationToken(
    userId: string,
    playlistId: string
  ): Promise<{ collaborationToken: string }> {
    const [playlist] = await db
      .select()
      .from(playlists)
      .where(eq(playlists.id, playlistId))
      .limit(1);

    if (!playlist) throw new Error("Playlist not found");
    if (playlist.ownerId !== userId) throw new Error("Only the playlist creator can regenerate tokens");

    const token = this.generateToken("collab");
    await db
      .update(playlists)
      .set({
        isCollaborative: true,
        collaborationToken: token,
        updatedAt: new Date(),
      })
      .where(eq(playlists.id, playlistId));

    await playlistsCacheService.invalidatePlaylistCache(playlistId);
    return { collaborationToken: token };
  }

  async disableCollaboration(userId: string, playlistId: string): Promise<void> {
    const [playlist] = await db
      .select()
      .from(playlists)
      .where(eq(playlists.id, playlistId))
      .limit(1);

    if (!playlist) throw new Error("Playlist not found");
    if (playlist.ownerId !== userId) throw new Error("Only the playlist creator can disable collaboration");

    await db.transaction(async (tx) => {
      await tx
        .update(playlists)
        .set({
          isCollaborative: false,
          collaborationToken: null,
          updatedAt: new Date(),
        })
        .where(eq(playlists.id, playlistId));

      await tx
        .delete(playlistCollaborators)
        .where(eq(playlistCollaborators.playlistId, playlistId));
    });

    await playlistsCacheService.invalidatePlaylistCache(playlistId);
  }

  async joinCollaboration(
    userId: string,
    playlistId: string,
    token: string
  ): Promise<{ success: boolean; joined: boolean; message: string; playlistTitle: string; playlistId: string }> {
    const [playlist] = await db
      .select()
      .from(playlists)
      .where(eq(playlists.id, playlistId))
      .limit(1);

    if (!playlist) throw new Error("Playlist not found");
    if (!playlist.isCollaborative || !playlist.collaborationToken) {
      throw new Error("Collaboration is not active on this playlist");
    }

    if (playlist.collaborationToken !== token) {
      throw new Error("Invalid or expired collaboration token");
    }

    if (playlist.ownerId === userId) {
      return { success: true, joined: true, message: `You are the creator of "${playlist.title}"!`, playlistTitle: playlist.title, playlistId };
    }

    await db
      .insert(playlistCollaborators)
      .values({
        playlistId,
        userId,
      })
      .onConflictDoNothing();

    // Automatically bookmark/save collaborative playlist into joining user's library
    await playlistsCacheService.savePlaylist(userId, playlistId);
    await playlistsCacheService.invalidatePlaylistCache(playlistId);

    return { success: true, joined: true, message: `Successfully joined "${playlist.title}" as a collaborator!`, playlistTitle: playlist.title, playlistId };
  }

  async listCollaboratorsInternal(
    playlistId: string
  ): Promise<Array<{ userId: string; displayName: string; avatarUrl: string | null; joinedAt: Date; user: { id: string; displayName: string; avatarUrl: string | null } }>> {
    const rows = await db
      .select({
        userId: users.id,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        joinedAt: playlistCollaborators.joinedAt,
      })
      .from(playlistCollaborators)
      .innerJoin(users, eq(playlistCollaborators.userId, users.id))
      .where(eq(playlistCollaborators.playlistId, playlistId))
      .orderBy(desc(playlistCollaborators.joinedAt));

    return rows.map((r) => ({
      ...r,
      playlistId,
      user: {
        id: r.userId,
        displayName: r.displayName,
        avatarUrl: r.avatarUrl,
      },
    }));
  }

  async listCollaborators(
    userId: string,
    playlistId: string
  ): Promise<Array<{ userId: string; displayName: string; avatarUrl: string | null; joinedAt: Date; user: { id: string; displayName: string; avatarUrl: string | null } }>> {
    const [playlist] = await db
      .select()
      .from(playlists)
      .where(eq(playlists.id, playlistId))
      .limit(1);

    if (!playlist) throw new Error("Playlist not found");

    const isOwner = playlist.ownerId === userId;
    let isCollaborator = false;
    if (!isOwner) {
      const [collab] = await db
        .select()
        .from(playlistCollaborators)
        .where(
          and(
            eq(playlistCollaborators.playlistId, playlistId),
            eq(playlistCollaborators.userId, userId)
          )
        )
        .limit(1);
      isCollaborator = !!collab;
    }

    if (!isOwner && !isCollaborator && playlist.visibility === "PRIVATE") {
      throw new Error("Permission denied");
    }

    return await this.listCollaboratorsInternal(playlistId);
  }

  async removeCollaborator(
    ownerId: string,
    playlistId: string,
    targetUserId: string
  ): Promise<void> {
    const [playlist] = await db
      .select()
      .from(playlists)
      .where(eq(playlists.id, playlistId))
      .limit(1);

    if (!playlist) throw new Error("Playlist not found");
    if (playlist.ownerId !== ownerId) throw new Error("Only the playlist creator can remove collaborators");

    await db
      .delete(playlistCollaborators)
      .where(
        and(
          eq(playlistCollaborators.playlistId, playlistId),
          eq(playlistCollaborators.userId, targetUserId)
        )
      );

    await playlistsCacheService.invalidatePlaylistCache(playlistId);
  }
}
