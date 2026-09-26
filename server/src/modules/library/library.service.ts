import {
  eq,
  and,
  desc,
  ne,
  count,
  max,
  isNull,
} from "drizzle-orm";
import { db } from "../../db";
import {
  playlists,
  playlistSongs,
  userLibraryPlaylists,
  users,
  albums,
  songs,
  artistProfiles,
  artistFollowers,
  albumLikes,
  songLikes,
  userLibraryPins,
} from "../../db/schema";
import type { PinItemInput } from "./library.schemas";

export class LibraryService {
  /**
   * Retrieves user's complete private library hub payload in a single consolidated call.
   */
  async getUserLibrary(userId: string) {
    const [
      createdPlaylists,
      savedPlaylists,
      savedReleases,
      followedArtists,
      likedSongsSummary,
      personalReleasesSummary,
      personalTracksSummary,
      userPins,
    ] = await Promise.all([
      // 1. Created Playlists
      db
        .select({
          id: playlists.id,
          title: playlists.title,
          description: playlists.description,
          coverImageUrl: playlists.coverImageUrl,
          visibility: playlists.visibility,
          isCollaborative: playlists.isCollaborative,
          ownerId: playlists.ownerId,
          ownerName: users.displayName,
          ownerAvatarUrl: users.avatarUrl,
          savesCount: playlists.savesCount,
          createdAt: playlists.createdAt,
          updatedAt: playlists.updatedAt,
          tracksCount: count(playlistSongs.id),
        })
        .from(playlists)
        .innerJoin(users, eq(playlists.ownerId, users.id))
        .leftJoin(playlistSongs, eq(playlists.id, playlistSongs.playlistId))
        .where(eq(playlists.ownerId, userId))
        .groupBy(
          playlists.id,
          users.displayName,
          users.avatarUrl,
          playlists.createdAt,
          playlists.updatedAt
        )
        .orderBy(desc(playlists.createdAt)),

      // 2. Saved Playlists (excluding own playlists)
      db
        .select({
          id: playlists.id,
          title: playlists.title,
          description: playlists.description,
          coverImageUrl: playlists.coverImageUrl,
          visibility: playlists.visibility,
          isCollaborative: playlists.isCollaborative,
          ownerId: playlists.ownerId,
          ownerName: users.displayName,
          ownerAvatarUrl: users.avatarUrl,
          savesCount: playlists.savesCount,
          savedAt: userLibraryPlaylists.savedAt,
          tracksCount: count(playlistSongs.id),
        })
        .from(userLibraryPlaylists)
        .innerJoin(playlists, eq(userLibraryPlaylists.playlistId, playlists.id))
        .innerJoin(users, eq(playlists.ownerId, users.id))
        .leftJoin(playlistSongs, eq(playlists.id, playlistSongs.playlistId))
        .where(
          and(
            eq(userLibraryPlaylists.userId, userId),
            ne(playlists.ownerId, userId)
          )
        )
        .groupBy(
          playlists.id,
          users.displayName,
          users.avatarUrl,
          userLibraryPlaylists.savedAt
        )
        .orderBy(desc(userLibraryPlaylists.savedAt)),

      // 3. Saved Releases (Albums, EPs, LPs, Singles)
      db
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
          savedAt: albumLikes.createdAt,
          tracksCount: count(songs.id),
        })
        .from(albumLikes)
        .innerJoin(albums, eq(albumLikes.albumId, albums.id))
        .innerJoin(artistProfiles, eq(albums.artistId, artistProfiles.id))
        .leftJoin(
          songs,
          and(eq(songs.albumId, albums.id), isNull(songs.deletedAt))
        )
        .where(and(eq(albumLikes.userId, userId), isNull(albums.deletedAt)))
        .groupBy(
          albums.id,
          artistProfiles.stageName,
          artistProfiles.slug,
          albumLikes.createdAt
        )
        .orderBy(desc(albumLikes.createdAt)),

      // 4. Followed Artists
      db
        .select({
          id: artistProfiles.id,
          stageName: artistProfiles.stageName,
          slug: artistProfiles.slug,
          avatarUrl: artistProfiles.avatarUrl,
          verified: artistProfiles.verified,
          followedAt: artistFollowers.createdAt,
        })
        .from(artistFollowers)
        .innerJoin(
          artistProfiles,
          eq(artistFollowers.artistId, artistProfiles.id)
        )
        .where(eq(artistFollowers.userId, userId))
        .orderBy(desc(artistFollowers.createdAt)),

      // 5. Liked Songs Summary
      db
        .select({
          total: count(),
          lastAddedAt: max(songLikes.createdAt),
        })
        .from(songLikes)
        .innerJoin(songs, eq(songLikes.songId, songs.id))
        .where(and(eq(songLikes.userId, userId), isNull(songs.deletedAt))),

      // 6a. Personal Collection Releases Summary
      db
        .select({
          total: count(),
          lastAddedAt: max(albums.createdAt),
        })
        .from(albums)
        .where(
          and(
            eq(albums.uploaderUserId, userId),
            eq(albums.scope, "PERSONAL"),
            isNull(albums.deletedAt)
          )
        ),

      // 6b. Personal Collection Tracks Summary
      db
        .select({
          total: count(),
        })
        .from(songs)
        .where(
          and(
            eq(songs.uploaderUserId, userId),
            eq(songs.scope, "PERSONAL"),
            isNull(songs.deletedAt)
          )
        ),

      // 7. User Pins
      db
        .select({
          id: userLibraryPins.id,
          itemType: userLibraryPins.itemType,
          itemId: userLibraryPins.itemId,
          pinnedAt: userLibraryPins.pinnedAt,
        })
        .from(userLibraryPins)
        .where(eq(userLibraryPins.userId, userId))
        .orderBy(desc(userLibraryPins.pinnedAt)),
    ]);

    const formattedPlaylists = [
      ...createdPlaylists.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        coverImageUrl: p.coverImageUrl,
        visibility: p.visibility,
        isCollaborative: p.isCollaborative,
        isOwner: true,
        ownerId: p.ownerId,
        ownerName: p.ownerName,
        ownerAvatarUrl: p.ownerAvatarUrl,
        savesCount: p.savesCount,
        tracksCount: Number(p.tracksCount),
        addedAt: p.createdAt.toISOString(),
      })),
      ...savedPlaylists.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        coverImageUrl: p.coverImageUrl,
        visibility: p.visibility,
        isCollaborative: p.isCollaborative,
        isOwner: false,
        ownerId: p.ownerId,
        ownerName: p.ownerName,
        ownerAvatarUrl: p.ownerAvatarUrl,
        savesCount: p.savesCount,
        tracksCount: Number(p.tracksCount),
        addedAt: p.savedAt.toISOString(),
      })),
    ];

    const formattedReleases = savedReleases.map((r) => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      coverImageUrl: r.coverImageUrl,
      albumType: r.albumType,
      releaseDate: r.releaseDate,
      artistId: r.artistId,
      artistName: r.artistName,
      artistSlug: r.artistSlug,
      savedAt: r.savedAt.toISOString(),
      tracksCount: Number(r.tracksCount),
    }));

    const formattedArtists = followedArtists.map((a) => ({
      id: a.id,
      stageName: a.stageName,
      slug: a.slug,
      avatarUrl: a.avatarUrl,
      verified: a.verified,
      followedAt: a.followedAt.toISOString(),
    }));

    const likedSongs = {
      totalTracks: Number(likedSongsSummary[0]?.total ?? 0),
      lastAddedAt: likedSongsSummary[0]?.lastAddedAt
        ? new Date(likedSongsSummary[0].lastAddedAt).toISOString()
        : null,
    };

    const personalCollection = {
      totalReleases: Number(personalReleasesSummary[0]?.total ?? 0),
      totalTracks: Number(personalTracksSummary[0]?.total ?? 0),
      lastAddedAt: personalReleasesSummary[0]?.lastAddedAt
        ? new Date(personalReleasesSummary[0].lastAddedAt).toISOString()
        : null,
    };

    const pins = userPins.map((pin) => ({
      id: pin.id,
      itemType: pin.itemType as
        | "LIKED_SONGS"
        | "PERSONAL_COLLECTION"
        | "PLAYLIST"
        | "ALBUM"
        | "ARTIST",
      itemId: pin.itemId,
      pinnedAt: pin.pinnedAt.toISOString(),
    }));

    return {
      likedSongs,
      personalCollection,
      playlists: formattedPlaylists,
      releases: formattedReleases,
      artists: formattedArtists,
      pins,
    };
  }

  /**
   * Pins an item to the top of user's library (Max 4 items).
   */
  async pinItem(userId: string, input: PinItemInput) {
    const existingPins = await db
      .select({
        id: userLibraryPins.id,
        itemType: userLibraryPins.itemType,
        itemId: userLibraryPins.itemId,
      })
      .from(userLibraryPins)
      .where(eq(userLibraryPins.userId, userId));

    const alreadyPinned = existingPins.some(
      (p) => p.itemType === input.itemType && p.itemId === input.itemId
    );

    if (alreadyPinned) {
      return { success: true, message: "Item already pinned" };
    }

    if (existingPins.length >= 6) {
      const error: any = new Error(
        "You can only pin up to 6 items to the top of your library"
      );
      error.statusCode = 400;
      throw error;
    }

    const [newPin] = await db
      .insert(userLibraryPins)
      .values({
        userId,
        itemType: input.itemType,
        itemId: input.itemId,
      })
      .returning();

    return {
      success: true,
      pin: {
        id: newPin.id,
        itemType: newPin.itemType,
        itemId: newPin.itemId,
        pinnedAt: newPin.pinnedAt.toISOString(),
      },
    };
  }

  /**
   * Unpins an item from user's library.
   */
  async unpinItem(userId: string, itemType: string, itemId: string) {
    await db
      .delete(userLibraryPins)
      .where(
        and(
          eq(userLibraryPins.userId, userId),
          eq(userLibraryPins.itemType, itemType),
          eq(userLibraryPins.itemId, itemId)
        )
      );

    return { success: true };
  }
}
