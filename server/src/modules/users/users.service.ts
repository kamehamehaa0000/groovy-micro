import { eq, and, count, desc, isNull, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { db } from '../../db'
import {
  users,
  playlists,
  playlistSongs,
  userLibraryPlaylists,
  userLibraryAlbums,
  releasePresaves,
  songLikes,
  songs,
  albums,
  artistProfiles,
  userFollows,
} from '../../db/schema'
import { redis } from '../../index'
import { hashPassword, verifyPassword } from '../auth/auth.hasher'
import {
  ACCESS_TOKEN_TTL_SEC,
  REFRESH_TOKEN_TTL_SEC,
  generateTokenIdentifiers,
} from '../auth/auth.utils'
import type {
  AccessTokenPayload,
  RefreshTokenPayload,
  UserRole,
} from '../auth/auth.schemas'
import { cacheKeys } from '../../lib/cache/keys'
import { SocialService } from '../social/social.service'
import type { RelationshipStatus } from '../social/social.schemas'
import type {
  UpdateProfileInput,
  UpdatePasswordInput,
  UpdatePrivacySettingsInput,
  UserProfileResponse,
  UserLibraryResponse,
  SharedPlaylistItem,
  SharedAlbumItem,
} from './users.schemas'

export class UsersService {
  private fastify: FastifyInstance
  private socialService = new SocialService()

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify
  }

  /**
   * Updates user display name and/or avatar URL.
   */
  async updateProfile(userId: string, input: UpdateProfileInput) {
    const updateData: Partial<typeof users.$inferInsert> = {
      updatedAt: new Date(),
    }

    if (input.displayName !== undefined) {
      updateData.displayName = input.displayName
    }

    if (input.avatarUrl !== undefined) {
      updateData.avatarUrl = input.avatarUrl
    }

    const [updatedUser] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        role: users.role,
        isEmailVerified: users.isEmailVerified,
        updatedAt: users.updatedAt,
      })

    if (!updatedUser) {
      throw this.fastify.httpErrors.notFound('User not found')
    }

    return updatedUser
  }

  /**
   * Updates user password with Argon2id and handles session revocation.
   */
  async updatePassword(userId: string, input: UpdatePasswordInput) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    if (!user) {
      throw this.fastify.httpErrors.notFound('User not found')
    }

    // 1. If account has existing password, verify current password
    if (user.passwordHash) {
      if (!input.currentPassword) {
        throw this.fastify.httpErrors.badRequest(
          'Current password is required to change password',
        )
      }

      const isCurrentValid = await verifyPassword(
        input.currentPassword,
        user.passwordHash,
      )

      if (!isCurrentValid) {
        throw this.fastify.httpErrors.unauthorized(
          'Current password does not match',
        )
      }
    }

    // 2. Hash new password with Argon2id
    const newHash = await hashPassword(input.newPassword)

    // 3. Increment token_version if revoking other sessions (security default)
    const newTokenVersion = input.revokeOtherSessions
      ? user.tokenVersion + 1
      : user.tokenVersion

    await db
      .update(users)
      .set({
        passwordHash: newHash,
        tokenVersion: newTokenVersion,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))

    let tokens: { accessToken: string; refreshToken: string } | null = null

    if (input.revokeOtherSessions) {
      // Sync to Redis fast-lookup cache
      await redis.set(
        cacheKeys.auth.tokenVersion(userId),
        newTokenVersion.toString(),
        'EX',
        REFRESH_TOKEN_TTL_SEC,
      )

      // Issue fresh tokens for the current device
      const { familyId, jti } = generateTokenIdentifiers()

      const accessPayload: AccessTokenPayload = {
        sub: user.id,
        email: user.email,
        role: user.role as UserRole,
        tokenVersion: newTokenVersion,
      }

      const refreshPayload: RefreshTokenPayload = {
        sub: user.id,
        familyId,
        jti,
        tokenVersion: newTokenVersion,
      }

      const accessToken = this.fastify.jwt.sign(accessPayload, {
        expiresIn: ACCESS_TOKEN_TTL_SEC,
      })

      const refreshToken = this.fastify.jwt.sign(refreshPayload, {
        expiresIn: REFRESH_TOKEN_TTL_SEC,
      })

      await redis.set(
        `session:${familyId}:${jti}`,
        'active',
        'EX',
        REFRESH_TOKEN_TTL_SEC,
      )

      tokens = { accessToken, refreshToken }
    }

    return {
      message: input.revokeOtherSessions
        ? 'Password changed successfully. All other devices have been logged out.'
        : 'Password changed successfully.',
      tokens,
    }
  }

  /**
   * Updates user privacy preferences (private account, listening activity privacy, library privacy).
   */
  async updatePrivacySettings(
    userId: string,
    input: UpdatePrivacySettingsInput,
  ) {
    const updateData: Partial<typeof users.$inferInsert> = {
      updatedAt: new Date(),
    }

    if (input.isPrivateAccount !== undefined) {
      updateData.isPrivateAccount = input.isPrivateAccount
    }
    if (input.listeningActivityPrivacy !== undefined) {
      updateData.listeningActivityPrivacy = input.listeningActivityPrivacy
      if (input.listeningActivityPrivacy === 'OFF') {
        await redis.del(cacheKeys.player.presence(userId))
      }
    }
    if (input.libraryPrivacy !== undefined) {
      updateData.libraryPrivacy = input.libraryPrivacy
    }
    if (input.lockerIncludeInSearch !== undefined) {
      updateData.lockerIncludeInSearch = input.lockerIncludeInSearch
    }
    if (input.lockerIncludeInHome !== undefined) {
      updateData.lockerIncludeInHome = input.lockerIncludeInHome
    }
    if (input.lockerIncludeInRecentlyPlayed !== undefined) {
      updateData.lockerIncludeInRecentlyPlayed = input.lockerIncludeInRecentlyPlayed
    }
    if (input.lockerLinkToGlobalArtists !== undefined) {
      updateData.lockerLinkToGlobalArtists = input.lockerLinkToGlobalArtists
    }

    const [updatedUser] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        isPrivateAccount: users.isPrivateAccount,
        listeningActivityPrivacy: users.listeningActivityPrivacy,
        libraryPrivacy: users.libraryPrivacy,
        lockerIncludeInSearch: users.lockerIncludeInSearch,
        lockerIncludeInHome: users.lockerIncludeInHome,
        lockerIncludeInRecentlyPlayed: users.lockerIncludeInRecentlyPlayed,
        lockerLinkToGlobalArtists: users.lockerLinkToGlobalArtists,
        updatedAt: users.updatedAt,
      })

    return updatedUser
  }

  /**
   * Retrieves public user profile details, social stats, and viewer relationship.
   */
  async getUserProfile(
    targetUserId: string,
    requesterId?: string,
  ): Promise<UserProfileResponse> {
    const [user] = await db
      .select({
        id: users.id,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        role: users.role,
        isPrivateAccount: users.isPrivateAccount,
        libraryPrivacy: users.libraryPrivacy,
        isActive: users.isActive,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1)

    if (!user || !user.isActive) {
      throw this.fastify.httpErrors.notFound('User not found')
    }

    // Followers count (ACCEPTED follows only)
    const [followersRes] = await db
      .select({ count: count() })
      .from(userFollows)
      .where(
        and(
          eq(userFollows.followingId, targetUserId),
          eq(userFollows.status, 'ACCEPTED'),
        ),
      )
    const followersCount = Number(followersRes?.count || 0)

    // Following count (ACCEPTED follows only)
    const [followingRes] = await db
      .select({ count: count() })
      .from(userFollows)
      .where(
        and(
          eq(userFollows.followerId, targetUserId),
          eq(userFollows.status, 'ACCEPTED'),
        ),
      )
    const followingCount = Number(followingRes?.count || 0)

    // Public playlists count
    const [playlistsRes] = await db
      .select({ count: count() })
      .from(playlists)
      .where(
        and(
          eq(playlists.ownerId, targetUserId),
          eq(playlists.visibility, 'PUBLIC'),
        ),
      )
    const publicPlaylistsCount = Number(playlistsRes?.count || 0)

    // Relationship status
    let relationship: RelationshipStatus = 'NONE'
    if (requesterId) {
      if (requesterId === targetUserId) {
        relationship = 'SELF'
      } else {
        relationship = await this.socialService.getRelationshipStatus(
          requesterId,
          targetUserId,
        )
      }
    }

    return {
      user: {
        id: user.id,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        role: user.role,
        isPrivateAccount: user.isPrivateAccount,
        libraryPrivacy: user.libraryPrivacy,
        followersCount,
        followingCount,
        publicPlaylistsCount,
        createdAt: user.createdAt,
      },
      relationship,
    }
  }

  /**
   * Retrieves user's public or shared library respecting libraryPrivacy:
   * - PUBLIC: accessible to anyone (including anonymous)
   * - FOLLOWERS_ONLY: accessible to accepted followers & owner
   * - PRIVATE: accessible only to owner
   */
  async getUserLibrary(
    targetUserId: string,
    requesterId?: string,
  ): Promise<UserLibraryResponse> {
    const [user] = await db
      .select({
        id: users.id,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        libraryPrivacy: users.libraryPrivacy,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1)

    if (!user || !user.isActive) {
      throw this.fastify.httpErrors.notFound('User not found')
    }

    const isOwner = requesterId === targetUserId

    // Enforce privacy gating if requester is not owner
    if (!isOwner) {
      if (user.libraryPrivacy === 'PRIVATE') {
        const err: any = this.fastify.httpErrors.forbidden(
          "This user's library is private.",
        )
        err.libraryPrivacy = 'PRIVATE'
        throw err
      }

      if (user.libraryPrivacy === 'FOLLOWERS_ONLY') {
        if (!requesterId) {
          const err: any = this.fastify.httpErrors.forbidden(
            "This user's library is visible to followers only.",
          )
          err.libraryPrivacy = 'FOLLOWERS_ONLY'
          throw err
        }

        const [followRecord] = await db
          .select()
          .from(userFollows)
          .where(
            and(
              eq(userFollows.followerId, requesterId),
              eq(userFollows.followingId, targetUserId),
              eq(userFollows.status, 'ACCEPTED'),
            ),
          )
          .limit(1)

        if (!followRecord) {
          const err: any = this.fastify.httpErrors.forbidden(
            "This user's library is visible to followers only.",
          )
          err.libraryPrivacy = 'FOLLOWERS_ONLY'
          throw err
        }
      }
    }

    // Access granted -> Query library collections in parallel
    const [
      createdPlaylistsRows,
      savedPlaylistsRows,
      savedAlbumsRows,
      presavedReleasesRows,
      likedSongsCountRes,
      likedSongsRows,
    ] = await Promise.all([
      // 1. Created Playlists (PUBLIC)
      db
        .select({
          id: playlists.id,
          title: playlists.title,
          description: playlists.description,
          coverImageUrl: playlists.coverImageUrl,
          visibility: playlists.visibility,
          isCollaborative: playlists.isCollaborative,
          savesCount: playlists.savesCount,
          createdAt: playlists.createdAt,
          updatedAt: playlists.updatedAt,
          tracksCount: count(playlistSongs.id),
        })
        .from(playlists)
        .leftJoin(playlistSongs, eq(playlists.id, playlistSongs.playlistId))
        .where(
          and(
            eq(playlists.ownerId, targetUserId),
            eq(playlists.visibility, 'PUBLIC'),
          ),
        )
        .groupBy(playlists.id)
        .orderBy(desc(playlists.createdAt)),

      // 2. Saved Playlists (PUBLIC)
      db
        .select({
          id: playlists.id,
          title: playlists.title,
          description: playlists.description,
          coverImageUrl: playlists.coverImageUrl,
          visibility: playlists.visibility,
          isCollaborative: playlists.isCollaborative,
          savesCount: playlists.savesCount,
          ownerId: playlists.ownerId,
          ownerName: users.displayName,
          ownerAvatarUrl: users.avatarUrl,
          savedAt: userLibraryPlaylists.savedAt,
          createdAt: playlists.createdAt,
          tracksCount: count(playlistSongs.id),
        })
        .from(userLibraryPlaylists)
        .innerJoin(playlists, eq(userLibraryPlaylists.playlistId, playlists.id))
        .innerJoin(users, eq(playlists.ownerId, users.id))
        .leftJoin(playlistSongs, eq(playlists.id, playlistSongs.playlistId))
        .where(
          and(
            eq(userLibraryPlaylists.userId, targetUserId),
            eq(playlists.visibility, 'PUBLIC'),
          ),
        )
        .groupBy(
          playlists.id,
          users.displayName,
          users.avatarUrl,
          userLibraryPlaylists.savedAt,
        )
        .orderBy(desc(userLibraryPlaylists.savedAt)),

      // 3. Saved Albums (PUBLIC)
      db
        .select({
          id: albums.id,
          title: albums.title,
          slug: albums.slug,
          coverImageUrl: albums.coverImageUrl,
          type: albums.albumType,
          releaseDate: albums.releaseDate,
          artistId: albums.artistId,
          artistName: artistProfiles.stageName,
          artistSlug: artistProfiles.slug,
          savedAt: userLibraryAlbums.savedAt,
        })
        .from(userLibraryAlbums)
        .innerJoin(albums, eq(userLibraryAlbums.albumId, albums.id))
        .innerJoin(artistProfiles, eq(albums.artistId, artistProfiles.id))
        .where(
          and(
            eq(userLibraryAlbums.userId, targetUserId),
            eq(albums.visibility, 'PUBLIC'),
            isNull(albums.deletedAt),
          ),
        )
        .orderBy(desc(userLibraryAlbums.savedAt)),

      // 4. Pre-saved Releases
      db
        .select({
          id: albums.id,
          title: albums.title,
          slug: albums.slug,
          coverImageUrl: albums.coverImageUrl,
          type: albums.albumType,
          releaseDate: albums.releaseDate,
          artistId: albums.artistId,
          artistName: artistProfiles.stageName,
          artistSlug: artistProfiles.slug,
          savedAt: releasePresaves.createdAt,
        })
        .from(releasePresaves)
        .innerJoin(albums, eq(releasePresaves.albumId, albums.id))
        .innerJoin(artistProfiles, eq(albums.artistId, artistProfiles.id))
        .where(
          and(
            eq(releasePresaves.userId, targetUserId),
            isNull(albums.deletedAt),
          ),
        )
        .orderBy(desc(releasePresaves.createdAt)),

      // 5. Liked songs total count
      db
        .select({ count: count() })
        .from(songLikes)
        .innerJoin(songs, eq(songLikes.songId, songs.id))
        .where(
          and(eq(songLikes.userId, targetUserId), isNull(songs.deletedAt)),
        ),

      // 6. Recent Liked Songs (top 30)
      db
        .select({
          id: songs.id,
          title: songs.title,
          slug: songs.slug,
          coverImageUrl: sql<
            string | null
          >`COALESCE(${songs.coverImageUrl}, ${albums.coverImageUrl})`,
          durationSeconds: songs.durationSeconds,
          audioUrl: songs.audioUrl,
          isExplicit: songs.isExplicit,
          artistId: songs.artistId,
          artistName: artistProfiles.stageName,
          artistSlug: artistProfiles.slug,
          likedAt: songLikes.createdAt,
        })
        .from(songLikes)
        .innerJoin(songs, eq(songLikes.songId, songs.id))
        .innerJoin(artistProfiles, eq(songs.artistId, artistProfiles.id))
        .leftJoin(albums, eq(songs.albumId, albums.id))
        .where(and(eq(songLikes.userId, targetUserId), isNull(songs.deletedAt)))
        .orderBy(desc(songLikes.createdAt))
        .limit(30),
    ])

    const createdPlaylists: SharedPlaylistItem[] = createdPlaylistsRows.map(
      (p) => ({
        ...p,
        tracksCount: Number(p.tracksCount || 0),
      }),
    )

    const savedPlaylists: SharedPlaylistItem[] = savedPlaylistsRows.map(
      (p) => ({
        ...p,
        tracksCount: Number(p.tracksCount || 0),
      }),
    )

    const savedAlbums: SharedAlbumItem[] = savedAlbumsRows.map((a) => ({
      ...a,
      isReleased: true,
    }))

    const presavedReleases: SharedAlbumItem[] = presavedReleasesRows.map(
      (a) => ({
        ...a,
        isReleased: false,
      }),
    )

    const likedSongs = {
      totalCount: Number(likedSongsCountRes[0]?.count || 0),
      items: likedSongsRows,
    }

    return {
      user: {
        id: user.id,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        libraryPrivacy: user.libraryPrivacy,
      },
      createdPlaylists,
      savedPlaylists,
      savedAlbums,
      presavedReleases,
      likedSongs,
    }
  }
}
