import { ilike, or, and, isNull, desc, count, sql, eq } from "drizzle-orm";
import { db } from "../../db";
import {
  songs,
  albums,
  artistProfiles,
  playlists,
  playlistSongs,
  users,
} from "../../db/schema";
import type {
  SearchQuery,
  GlobalSearchResponse,
  SearchSongItem,
  SearchAlbumItem,
  SearchArtistItem,
  SearchPlaylistItem,
  SearchUserItem,
  TopSearchResult,
} from "./search.schemas";

export class SearchService {
  async search(
    input: SearchQuery,
    _requesterId?: string
  ): Promise<GlobalSearchResponse> {
    const rawQuery = input.q.trim();
    const limit = input.limit || 5;
    const type = input.type || "all";
    const pattern = `%${rawQuery}%`;

    const searchAll = type === "all";
    const shouldSearchSongs = searchAll || type === "songs";
    const shouldSearchAlbums = searchAll || type === "albums";
    const shouldSearchArtists = searchAll || type === "artists";
    const shouldSearchPlaylists = searchAll || type === "playlists";
    const shouldSearchUsers = searchAll || type === "users";

    let includePersonal = false;
    if (_requesterId) {
      const [userRecord] = await db
        .select({ lockerIncludeInSearch: users.lockerIncludeInSearch })
        .from(users)
        .where(eq(users.id, _requesterId))
        .limit(1);

      includePersonal = userRecord?.lockerIncludeInSearch ?? true;
    }

    const [
      songsRows,
      albumsRows,
      artistsRows,
      playlistsRows,
      usersRows,
    ] = await Promise.all([
      // 1. Songs Query
      shouldSearchSongs
        ? db
            .select({
              id: songs.id,
              title: songs.title,
              slug: songs.slug,
              durationSeconds: songs.durationSeconds,
              audioUrl: songs.audioUrl,
              coverImageUrl: sql<string | null>`COALESCE(${songs.coverImageUrl}, ${albums.coverImageUrl})`,
              isExplicit: songs.isExplicit,
              artistId: songs.artistId,
              artistName: artistProfiles.stageName,
              artistSlug: artistProfiles.slug,
              albumId: songs.albumId,
              albumTitle: albums.title,
              playsCount: songs.playsCount,
              scope: songs.scope,
            })
            .from(songs)
            .innerJoin(artistProfiles, eq(songs.artistId, artistProfiles.id))
            .leftJoin(albums, eq(songs.albumId, albums.id))
            .where(
              and(
                isNull(songs.deletedAt),
                includePersonal && _requesterId
                  ? or(
                      and(
                        eq(songs.scope, "GLOBAL"),
                        eq(songs.processingStatus, "READY")
                      ),
                      and(
                        eq(songs.scope, "PERSONAL"),
                        eq(songs.uploaderUserId, _requesterId)
                      )
                    )
                  : and(
                      eq(songs.scope, "GLOBAL"),
                      eq(songs.processingStatus, "READY")
                    ),
                or(
                  ilike(songs.title, pattern),
                  ilike(songs.slug, pattern),
                  ilike(artistProfiles.stageName, pattern)
                )
              )
            )
            .orderBy(desc(songs.playsCount))
            .limit(limit)
        : Promise.resolve([]),

      // 2. Albums Query
      shouldSearchAlbums
        ? db
            .select({
              id: albums.id,
              title: albums.title,
              slug: albums.slug,
              coverImageUrl: albums.coverImageUrl,
              albumType: albums.albumType,
              releaseDate: albums.releaseDate,
              artistId: albums.artistId,
              artistName: artistProfiles.stageName,
              artistSlug: artistProfiles.slug,
              likesCount: albums.likesCount,
              scope: albums.scope,
            })
            .from(albums)
            .innerJoin(artistProfiles, eq(albums.artistId, artistProfiles.id))
            .where(
              and(
                isNull(albums.deletedAt),
                includePersonal && _requesterId
                  ? or(
                      and(
                        eq(albums.scope, "GLOBAL"),
                        eq(albums.visibility, "PUBLIC")
                      ),
                      and(
                        eq(albums.scope, "PERSONAL"),
                        eq(albums.uploaderUserId, _requesterId)
                      )
                    )
                  : and(
                      eq(albums.scope, "GLOBAL"),
                      eq(albums.visibility, "PUBLIC")
                    ),
                or(
                  ilike(albums.title, pattern),
                  ilike(albums.slug, pattern),
                  ilike(artistProfiles.stageName, pattern)
                )
              )
            )
            .orderBy(desc(albums.likesCount))
            .limit(limit)
        : Promise.resolve([]),

      // 3. Artists Query
      shouldSearchArtists
        ? db
            .select({
              id: artistProfiles.id,
              stageName: artistProfiles.stageName,
              slug: artistProfiles.slug,
              avatarUrl: users.avatarUrl,
              bannerUrl: artistProfiles.bannerUrl,
              verified: artistProfiles.verified,
              monthlyListeners: artistProfiles.monthlyListeners,
              scope: artistProfiles.scope,
            })
            .from(artistProfiles)
            .leftJoin(users, eq(artistProfiles.userId, users.id))
            .where(
              and(
                includePersonal && _requesterId
                  ? or(
                      and(
                        eq(artistProfiles.scope, "GLOBAL"),
                        eq(users.isActive, true)
                      ),
                      and(
                        eq(artistProfiles.scope, "PERSONAL"),
                        eq(artistProfiles.ownerUserId, _requesterId)
                      )
                    )
                  : and(
                      eq(artistProfiles.scope, "GLOBAL"),
                      eq(users.isActive, true)
                    ),
                or(
                  ilike(artistProfiles.stageName, pattern),
                  ilike(artistProfiles.slug, pattern)
                )
              )
            )
            .orderBy(
              desc(artistProfiles.verified),
              desc(artistProfiles.monthlyListeners)
            )
            .limit(limit)
        : Promise.resolve([]),

      // 4. Playlists Query
      shouldSearchPlaylists
        ? db
            .select({
              id: playlists.id,
              title: playlists.title,
              description: playlists.description,
              coverImageUrl: playlists.coverImageUrl,
              savesCount: playlists.savesCount,
              ownerId: playlists.ownerId,
              ownerName: users.displayName,
              tracksCount: count(playlistSongs.id),
            })
            .from(playlists)
            .innerJoin(users, eq(playlists.ownerId, users.id))
            .leftJoin(playlistSongs, eq(playlists.id, playlistSongs.playlistId))
            .where(
              and(
                eq(playlists.visibility, "PUBLIC"),
                or(
                  ilike(playlists.title, pattern),
                  ilike(playlists.description, pattern)
                )
              )
            )
            .groupBy(playlists.id, users.displayName)
            .orderBy(desc(playlists.savesCount))
            .limit(limit)
        : Promise.resolve([]),

      // 5. Users Query
      shouldSearchUsers
        ? db
            .select({
              id: users.id,
              displayName: users.displayName,
              avatarUrl: users.avatarUrl,
              role: users.role,
              isPrivateAccount: users.isPrivateAccount,
            })
            .from(users)
            .where(
              and(
                eq(users.isActive, true),
                ilike(users.displayName, pattern)
              )
            )
            .orderBy(desc(users.createdAt))
            .limit(limit)
        : Promise.resolve([]),
    ]);

    const mappedSongs: SearchSongItem[] = (songsRows as any[]).map((s) => ({
      ...s,
      playsCount: Number(s.playsCount || 0),
      isPersonal: s.scope === "PERSONAL",
    }));

    const mappedAlbums: SearchAlbumItem[] = (albumsRows as any[]).map((a) => ({
      ...a,
      isReleased: true,
      likesCount: Number(a.likesCount || 0),
      isPersonal: a.scope === "PERSONAL",
    }));

    const mappedArtists: SearchArtistItem[] = (artistsRows as any[]).map((a) => ({
      ...a,
      monthlyListeners: Number(a.monthlyListeners || 0),
      isPersonal: a.scope === "PERSONAL",
    }));

    const mappedPlaylists: SearchPlaylistItem[] = (playlistsRows as any[]).map((p) => ({
      ...p,
      savesCount: Number(p.savesCount || 0),
      tracksCount: Number(p.tracksCount || 0),
    }));

    const mappedUsers: SearchUserItem[] = usersRows as any[];

    // Determine Top Result
    let topResult: TopSearchResult | null = null;
    const lowerQuery = rawQuery.toLowerCase();

    // Priority 1: Exact Artist Match
    const exactArtist = mappedArtists.find(
      (a) => a.stageName.toLowerCase() === lowerQuery
    );
    if (exactArtist) {
      topResult = { type: "artist", item: exactArtist };
    }

    // Priority 2: Exact Song Match
    if (!topResult) {
      const exactSong = mappedSongs.find(
        (s) => s.title.toLowerCase() === lowerQuery
      );
      if (exactSong) {
        topResult = { type: "song", item: exactSong };
      }
    }

    // Priority 3: Exact Album Match
    if (!topResult) {
      const exactAlbum = mappedAlbums.find(
        (a) => a.title.toLowerCase() === lowerQuery
      );
      if (exactAlbum) {
        topResult = { type: "album", item: exactAlbum };
      }
    }

    // Priority 4: Exact Playlist Match
    if (!topResult) {
      const exactPlaylist = mappedPlaylists.find(
        (p) => p.title.toLowerCase() === lowerQuery
      );
      if (exactPlaylist) {
        topResult = { type: "playlist", item: exactPlaylist };
      }
    }

    // Priority 5: Fallback to highest ranked first entity
    if (!topResult) {
      if (mappedArtists.length > 0) {
        topResult = { type: "artist", item: mappedArtists[0] };
      } else if (mappedSongs.length > 0) {
        topResult = { type: "song", item: mappedSongs[0] };
      } else if (mappedAlbums.length > 0) {
        topResult = { type: "album", item: mappedAlbums[0] };
      } else if (mappedPlaylists.length > 0) {
        topResult = { type: "playlist", item: mappedPlaylists[0] };
      } else if (mappedUsers.length > 0) {
        topResult = { type: "user", item: mappedUsers[0] };
      }
    }

    return {
      query: rawQuery,
      topResult,
      songs: mappedSongs,
      albums: mappedAlbums,
      artists: mappedArtists,
      playlists: mappedPlaylists,
      users: mappedUsers,
    };
  }
}
