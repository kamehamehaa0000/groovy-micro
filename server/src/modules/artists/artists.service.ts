import { eq, sql, and, or, ilike, desc, asc, count, isNull, gte, lte } from "drizzle-orm";
import { db } from "../../db";
import { artistProfiles, artistFollowers, users, albums } from "../../db/schema";
import type {
  CreateArtistInput,
  UpdateArtistInput,
  RequestVerificationInput,
  AdminVerifyArtistInput,
  SearchArtistsQuery,
  AdminListArtistsQuery,
} from "./artists.schemas";
import { cacheManager, cacheKeys, followsCacheService } from "../../lib/cache";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SELF_ARTIST_TTL_SEC = 300; // 5 minutes

/**
 * Normalizes text into a clean, URL-safe slug.
 */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Strip diacritics/accents
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "") // Remove non-alphanumeric chars
    .replace(/[\s_-]+/g, "-") // Collapse spaces/underscores to single hyphen
    .replace(/^-+|-+$/g, ""); // Trim edge hyphens
}

export class ArtistsService {
  /**
   * Generates a unique slug from a stage name, handling collisions.
   */
  async generateUniqueSlug(
    baseText: string,
    currentArtistId?: string
  ): Promise<string> {
    const baseSlug = slugify(baseText) || "artist";
    let candidate = baseSlug;
    let counter = 1;

    while (true) {
      const existing = await db
        .select({ id: artistProfiles.id })
        .from(artistProfiles)
        .where(eq(artistProfiles.slug, candidate))
        .limit(1);

      // If no collision, or collision is with the current artist being updated
      if (
        existing.length === 0 ||
        (currentArtistId && existing[0].id === currentArtistId)
      ) {
        return candidate;
      }

      counter++;
      candidate = `${baseSlug}-${counter}`;
    }
  }

  /**
   * Instantly upgrades a listener to an artist and creates their profile.
   */
  async createArtistProfile(userId: string, input: CreateArtistInput) {
    // 1. Check if user already owns an artist profile (1:1 constraint)
    const [existing] = await db
      .select({ id: artistProfiles.id })
      .from(artistProfiles)
      .where(eq(artistProfiles.userId, userId))
      .limit(1);

    if (existing) {
      throw new Error("You already have an established artist profile");
    }

    // 2. Determine unique slug
    let finalSlug: string;
    if (input.slug) {
      const formatted = slugify(input.slug);
      const isTaken = await db
        .select({ id: artistProfiles.id })
        .from(artistProfiles)
        .where(eq(artistProfiles.slug, formatted))
        .limit(1);

      if (isTaken.length > 0) {
        throw new Error(`The slug "${formatted}" is already taken`);
      }
      finalSlug = formatted;
    } else {
      finalSlug = await this.generateUniqueSlug(input.stageName);
    }

    // 3. Database transaction: Insert profile & promote user role to ARTIST
    const result = await db.transaction(async (tx) => {
      const [newProfile] = await tx
        .insert(artistProfiles)
        .values({
          userId,
          stageName: input.stageName,
          slug: finalSlug,
          bio: input.bio ?? null,
          socialLinks: input.socialLinks ?? {},
          verified: false,
          verificationStatus: "NONE",
        })
        .returning();

      // Upgrade role in users table
      const [updatedUser] = await tx
        .update(users)
        .set({
          role: "ARTIST",
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          role: users.role,
          tokenVersion: users.tokenVersion,
        });

      return {
        profile: newProfile,
        user: updatedUser,
      };
    });

    // The composite profile gains the artist pointer and the effective role flips
    // to ARTIST; the artist view also has to stop answering "no profile".
    await cacheManager.invalidateSelfArtist(userId);

    return result;
  }

  /**
   * Retrieves an artist profile by either UUID or human-readable slug.
   * Public artist metadata and follower count are cached for 10 minutes.
   * Personal sandboxed artist profiles are restricted strictly to their owner and never cached publicly.
   */
  async getArtistByIdOrSlug(idOrSlug: string, currentUserId?: string) {
    const isUUID = UUID_REGEX.test(idOrSlug);
    const cacheKey = isUUID
      ? cacheKeys.catalog.artist(idOrSlug)
      : cacheKeys.catalog.artistSlug(idOrSlug);

    // 1. Check Redis cache first
    const cached = await cacheManager.get<any>(cacheKey);
    if (cached) {
      if (cached.scope === "PERSONAL") {
        // Invalidate any personal profile mistakenly in public cache
        await cacheManager.invalidate(cacheKey);
      } else {
        const isFollowing = currentUserId
          ? await followsCacheService.isFollowingArtist(currentUserId, cached.id)
          : false;
        return {
          ...cached,
          isFollowing,
        };
      }
    }

    // 2. Fetch from DB
    const [artist] = await db
      .select({
        id: artistProfiles.id,
        userId: artistProfiles.userId,
        ownerUserId: artistProfiles.ownerUserId,
        scope: artistProfiles.scope,
        stageName: artistProfiles.stageName,
        slug: artistProfiles.slug,
        bio: artistProfiles.bio,
        bannerUrl: artistProfiles.bannerUrl,
        avatarUrl: artistProfiles.avatarUrl,
        verified: artistProfiles.verified,
        monthlyListeners: artistProfiles.monthlyListeners,
        socialLinks: artistProfiles.socialLinks,
        pinnedReleaseId: artistProfiles.pinnedReleaseId,
        pinnedComment: artistProfiles.pinnedComment,
        createdAt: artistProfiles.createdAt,
        updatedAt: artistProfiles.updatedAt,
      })
      .from(artistProfiles)
      .where(
        isUUID
          ? eq(artistProfiles.id, idOrSlug)
          : eq(artistProfiles.slug, idOrSlug)
      )
      .limit(1);

    if (!artist) {
      return null;
    }

    // 3. Privacy boundary: Personal sandboxed artists can ONLY be viewed by their owner
    if (artist.scope === "PERSONAL") {
      if (!currentUserId || artist.ownerUserId !== currentUserId) {
        return null;
      }
      return {
        ...artist,
        followersCount: 0,
        isFollowing: false,
      };
    }

    // 4. Global artist: enrich with follower count and cache
    const [followerCountRes] = await db
      .select({ total: count() })
      .from(artistFollowers)
      .where(eq(artistFollowers.artistId, artist.id));

    const result = {
      ...artist,
      followersCount: followerCountRes?.total ?? 0,
    };

    // Cache ONLY global artists in Redis
    await cacheManager.set(cacheKey, result, 600);
    if (isUUID && artist.slug) {
      await cacheManager.set(cacheKeys.catalog.artistSlug(artist.slug), result, 600);
    } else if (!isUUID && artist.id) {
      await cacheManager.set(cacheKeys.catalog.artist(artist.id), result, 600);
    }

    const isFollowing = currentUserId
      ? await followsCacheService.isFollowingArtist(currentUserId, result.id)
      : false;

    return {
      ...result,
      isFollowing,
    };
  }

  /**
   * Retrieves unified artist overview (Profile + Discography + Similar Artists) in a single high-performance operation.
   * Public core is cached in Redis (10 min TTL). Viewer-specific personalization is layered on top.
   */
  async getArtistOverview(
    idOrSlug: string,
    currentUserId?: string,
    catalogService?: any,
    recommendationsService?: any
  ) {
    const isUUID = UUID_REGEX.test(idOrSlug);
    const cacheKey = isUUID
      ? cacheKeys.catalog.artistOverview(idOrSlug)
      : cacheKeys.catalog.artistOverviewSlug(idOrSlug);

    // 1. Check Redis cache first for the public core
    const publicCached = await cacheManager.get<{
      profile: any;
      discography: any;
      similarArtists: any[];
    }>(cacheKey);

    if (publicCached) {
      if (publicCached.profile.scope === "PERSONAL") {
        if (!currentUserId || publicCached.profile.ownerUserId !== currentUserId) {
          await cacheManager.invalidate(cacheKey);
          return null;
        }
      }

      // Layer viewer personalization
      const isFollowing = currentUserId
        ? await followsCacheService.isFollowingArtist(currentUserId, publicCached.profile.id)
        : false;

      // Personalize discography if authenticated
      let personalizedDiscography = publicCached.discography;
      if (currentUserId && catalogService) {
        personalizedDiscography = await catalogService.getArtistDiscography(
          publicCached.profile.id,
          currentUserId
        );
      }

      return {
        profile: {
          ...publicCached.profile,
          isFollowing,
        },
        discography: personalizedDiscography,
        similarArtists: publicCached.similarArtists,
      };
    }

    // 2. Cache miss: Fetch artist profile first
    const profile = await this.getArtistByIdOrSlug(idOrSlug, currentUserId);
    if (!profile) {
      return null;
    }

    // 3. Concurrently fetch discography and similar artists using the resolved artist ID
    const [discography, similarResult] = await Promise.all([
      catalogService
        ? catalogService.getArtistDiscography(profile.id, currentUserId)
        : Promise.resolve(null),
      recommendationsService
        ? recommendationsService.getSimilarArtistsForArtist(profile.id, 8)
        : Promise.resolve(null),
    ]);

    const similarArtists = similarResult?.artists || [];

    // 4. Cache public core in Redis if GLOBAL artist (600s TTL)
    if (profile.scope === "GLOBAL" && discography) {
      const publicCore = {
        profile: {
          ...profile,
          isFollowing: false,
        },
        discography: {
          ...discography,
          inYourCollection: [],
        },
        similarArtists,
      };

      await cacheManager.set(cacheKey, publicCore, 600);
      if (isUUID && profile.slug) {
        await cacheManager.set(cacheKeys.catalog.artistOverviewSlug(profile.slug), publicCore, 600);
      } else if (!isUUID && profile.id) {
        await cacheManager.set(cacheKeys.catalog.artistOverview(profile.id), publicCore, 600);
      }
    }

    return {
      profile,
      discography,
      similarArtists,
    };
  }

  /**
   * Retrieves logged-in artist's own profile and studio telemetry.
   *
   * Cached per owner. The row changes only on profile edits, verification moves,
   * album pinning and new followers, and each of those invalidates the key, so the
   * TTL is a backstop. A missing profile is negative-cached briefly by the cache
   * manager, which is exactly what the studio's listener probe wants.
   */
  async getMyArtistProfile(userId: string) {
    return cacheManager.getOrSet(
      cacheKeys.profile.selfArtist(userId),
      () => this.fetchMyArtistProfile(userId),
      SELF_ARTIST_TTL_SEC
    );
  }

  /**
   * Reads the owner's artist row and follower count from PostgreSQL (cache miss).
   */
  private async fetchMyArtistProfile(userId: string) {
    const [profile] = await db
      .select()
      .from(artistProfiles)
      .where(eq(artistProfiles.userId, userId))
      .limit(1);

    if (!profile) {
      return null;
    }

    // Read-only: owning a profile is what makes someone an artist, and authorization
    // resolves that fact directly (see resolveUserRole), so this GET no longer
    // repairs the denormalized users.role column as a side effect.
    const [followerCountRes] = await db
      .select({ total: count() })
      .from(artistFollowers)
      .where(eq(artistFollowers.artistId, profile.id));

    return {
      ...profile,
      followersCount: followerCountRes?.total ?? 0,
    };
  }

  /**
   * Updates an artist profile (Bio, Stage Name, Slug, Banner, Socials).
   */
  async updateArtistProfile(userId: string, input: UpdateArtistInput) {
    const [profile] = await db
      .select()
      .from(artistProfiles)
      .where(eq(artistProfiles.userId, userId))
      .limit(1);

    if (!profile) {
      throw new Error("Artist profile not found");
    }

    // Handle slug change if provided
    let updatedSlug = profile.slug;
    if (input.slug && input.slug !== profile.slug) {
      const formatted = slugify(input.slug);
      const isTaken = await db
        .select({ id: artistProfiles.id })
        .from(artistProfiles)
        .where(
          and(
            eq(artistProfiles.slug, formatted),
            sql`${artistProfiles.id} != ${profile.id}`
          )
        )
        .limit(1);

      if (isTaken.length > 0) {
        throw new Error(`The slug "${formatted}" is already taken`);
      }
      updatedSlug = formatted;
    }

    // Handle pinned release updates
    let finalPinnedReleaseId = profile.pinnedReleaseId;
    let finalPinnedComment = profile.pinnedComment;

    if (input.pinnedReleaseId !== undefined) {
      if (input.pinnedReleaseId === null) {
        finalPinnedReleaseId = null;
        finalPinnedComment = null;
      } else {
        const [album] = await db
          .select({ id: albums.id })
          .from(albums)
          .where(
            and(
              eq(albums.id, input.pinnedReleaseId),
              eq(albums.artistId, profile.id),
              sql`${albums.deletedAt} IS NULL`
            )
          )
          .limit(1);

        if (!album) {
          throw new Error("Pinned release not found or is in trash");
        }
        finalPinnedReleaseId = album.id;
      }
    }

    if (input.pinnedComment !== undefined) {
      finalPinnedComment = input.pinnedComment;
    }

    const [updated] = await db
      .update(artistProfiles)
      .set({
        ...(input.stageName ? { stageName: input.stageName } : {}),
        slug: updatedSlug,
        ...(input.bio !== undefined ? { bio: input.bio } : {}),
        ...(input.bannerUrl !== undefined ? { bannerUrl: input.bannerUrl } : {}),
        ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
        ...(input.socialLinks ? { socialLinks: input.socialLinks } : {}),
        pinnedReleaseId: finalPinnedReleaseId,
        pinnedComment: finalPinnedComment,
        updatedAt: new Date(),
      })
      .where(eq(artistProfiles.id, profile.id))
      .returning();

    await cacheManager.invalidateArtist({
      id: updated.id,
      slug: updated.slug,
    });
    if (profile.slug && profile.slug !== updated.slug) {
      await cacheManager.invalidate(cacheKeys.catalog.artistSlug(profile.slug));
    }

    // The owner's own view (and the composite profile's stageName/slug) changed
    await cacheManager.invalidateSelfArtist(userId);

    return updated;
  }

  /**
   * Submits an artist verification request to the admin desk.
   */
  async requestVerification(userId: string, input: RequestVerificationInput) {
    const [profile] = await db
      .select({
        id: artistProfiles.id,
        verificationStatus: artistProfiles.verificationStatus,
      })
      .from(artistProfiles)
      .where(eq(artistProfiles.userId, userId))
      .limit(1);

    if (!profile) {
      throw new Error("Artist profile not found");
    }

    if (profile.verificationStatus === "VERIFIED") {
      throw new Error("Artist profile is already verified");
    }

    if (profile.verificationStatus === "PENDING") {
      throw new Error("Verification request is already under review");
    }

    const details = {
      message: input.message,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      links: input.links,
      requestedAt: new Date().toISOString(),
    };

    const [updated] = await db
      .update(artistProfiles)
      .set({
        verificationStatus: "PENDING",
        verificationDetails: details,
        rejectionReason: null,
        updatedAt: new Date(),
      })
      .where(eq(artistProfiles.id, profile.id))
      .returning();

    // The owner's own view carries verificationStatus, details and rejection reason
    await cacheManager.invalidateSelfArtist(userId);

    return {
      message: "Verification request submitted successfully",
      profile: updated,
    };
  }

  /**
   * Follow an artist.
   */
  async followArtist(userId: string, artistId: string) {
    return await followsCacheService.followArtist(userId, artistId);
  }

  /**
   * Unfollow an artist.
   */
  async unfollowArtist(userId: string, artistId: string) {
    return await followsCacheService.unfollowArtist(userId, artistId);
  }

  /**
   * Check if a listener follows an artist.
   */
  async checkIsFollowing(userId: string, artistId: string): Promise<boolean> {
    return await followsCacheService.isFollowingArtist(userId, artistId);
  }

  /**
   * Fast sync: returns list of artist IDs followed by user.
   */
  async getUserFollowingArtistIds(userId: string): Promise<string[]> {
    const set = await followsCacheService.getUserFollowingArtistIds(userId);
    return Array.from(set);
  }

  /**
   * Retrieves releases published in the past 6 months by artists followed by the user.
   * Ordered by recency (newest releaseDate and createdAt first).
   */
  async getFollowedArtistsReleases(
    userId: string,
    options: {
      page?: number;
      limit?: number;
    } = {}
  ) {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(Math.max(1, options.limit ?? 40), 100);
    const offset = (page - 1) * limit;

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const sixMonthsAgoStr = sixMonthsAgo.toISOString().split("T")[0]; // YYYY-MM-DD

    const conditions = [
      eq(artistFollowers.userId, userId),
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
      gte(albums.releaseDate, sixMonthsAgoStr),
      lte(albums.releaseDate, sql`CURRENT_DATE`),
    ];

    const rows = await db
      .select({
        id: albums.id,
        title: albums.title,
        slug: albums.slug,
        albumType: albums.albumType,
        coverImageUrl: albums.coverImageUrl,
        releaseDate: albums.releaseDate,
        totalTracks: albums.totalTracks,
        totalDurationSeconds: albums.totalDurationSeconds,
        artist: {
          id: artistProfiles.id,
          name: artistProfiles.stageName,
          slug: artistProfiles.slug,
          avatarUrl: artistProfiles.avatarUrl,
          verified: artistProfiles.verified,
        },
      })
      .from(artistFollowers)
      .innerJoin(albums, eq(artistFollowers.artistId, albums.artistId))
      .innerJoin(artistProfiles, eq(albums.artistId, artistProfiles.id))
      .where(and(...conditions))
      .orderBy(desc(albums.releaseDate), desc(albums.createdAt))
      .limit(limit + 1)
      .offset(offset);

    const hasMore = rows.length > limit;
    const releases = hasMore ? rows.slice(0, limit) : rows;

    return {
      releases,
      page,
      hasMore,
    };
  }

  /**
   * Search and list artists with pagination, scope filtering, sorting, and follow enrichment.
   */
  async searchArtists(query: SearchArtistsQuery, currentUserId?: string) {
    const page = query.page;
    const limit = query.limit;
    const offset = (page - 1) * limit;

    // 1. Determine scope isolation condition
    let scopeCondition;
    if (query.scope === "PERSONAL") {
      if (!currentUserId) {
        return {
          data: [],
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 0,
          },
        };
      }
      scopeCondition = and(
        eq(artistProfiles.scope, "PERSONAL"),
        eq(artistProfiles.ownerUserId, currentUserId)
      );
    } else if (query.scope === "ALL") {
      if (currentUserId) {
        scopeCondition = or(
          eq(artistProfiles.scope, "GLOBAL"),
          and(
            eq(artistProfiles.scope, "PERSONAL"),
            eq(artistProfiles.ownerUserId, currentUserId)
          )
        );
      } else {
        scopeCondition = eq(artistProfiles.scope, "GLOBAL");
      }
    } else {
      // Default: GLOBAL
      scopeCondition = eq(artistProfiles.scope, "GLOBAL");
    }

    const searchCondition = query.search
      ? or(
          ilike(artistProfiles.stageName, `%${query.search}%`),
          ilike(artistProfiles.slug, `%${query.search}%`)
        )
      : undefined;

    const conditions = [scopeCondition];
    if (searchCondition) {
      conditions.push(searchCondition);
    }
    const whereClause = and(...conditions);

    const [totalRes] = await db
      .select({ total: count() })
      .from(artistProfiles)
      .where(whereClause);

    const total = totalRes?.total ?? 0;

    // 2. Determine sort ordering
    let orderByClause;
    if (query.sort === "name") {
      orderByClause = [asc(artistProfiles.stageName)];
    } else if (query.sort === "recent") {
      orderByClause = [desc(artistProfiles.createdAt)];
    } else if (query.sort === "followers") {
      const followersCountExpr = sql<number>`(SELECT COUNT(*) FROM artist_followers WHERE artist_followers.artist_id = ${artistProfiles.id})`;
      orderByClause = [
        desc(followersCountExpr),
        desc(artistProfiles.monthlyListeners),
        desc(artistProfiles.createdAt),
      ];
    } else {
      // Default: listeners
      orderByClause = [
        desc(artistProfiles.monthlyListeners),
        desc(artistProfiles.createdAt),
      ];
    }

    const rows = await db
      .select({
        id: artistProfiles.id,
        stageName: artistProfiles.stageName,
        slug: artistProfiles.slug,
        bio: artistProfiles.bio,
        bannerUrl: artistProfiles.bannerUrl,
        avatarUrl: artistProfiles.avatarUrl,
        verified: artistProfiles.verified,
        monthlyListeners: artistProfiles.monthlyListeners,
        scope: artistProfiles.scope,
        ownerUserId: artistProfiles.ownerUserId,
        createdAt: artistProfiles.createdAt,
      })
      .from(artistProfiles)
      .where(whereClause)
      .orderBy(...orderByClause)
      .limit(limit)
      .offset(offset);

    const data = await followsCacheService.enrichArtistsWithFollowing(
      currentUserId,
      rows
    );

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
   * Admin: List artist profiles filtered by verification status.
   */
  async adminListArtists(query: AdminListArtistsQuery) {
    const page = query.page;
    const limit = query.limit;
    const offset = (page - 1) * limit;

    const conditions = [];

    if (query.status && query.status !== "ALL") {
      conditions.push(eq(artistProfiles.verificationStatus, query.status));
    }

    if (query.search) {
      conditions.push(
        or(
          ilike(artistProfiles.stageName, `%${query.search}%`),
          ilike(artistProfiles.slug, `%${query.search}%`),
          ilike(users.email, `%${query.search}%`)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalRes] = await db
      .select({ total: count() })
      .from(artistProfiles)
      .innerJoin(users, eq(artistProfiles.userId, users.id))
      .where(whereClause);

    const total = totalRes?.total ?? 0;

    const rows = await db
      .select({
        id: artistProfiles.id,
        userId: artistProfiles.userId,
        ownerEmail: users.email,
        ownerDisplayName: users.displayName,
        stageName: artistProfiles.stageName,
        slug: artistProfiles.slug,
        bio: artistProfiles.bio,
        bannerUrl: artistProfiles.bannerUrl,
        avatarUrl: artistProfiles.avatarUrl,
        verified: artistProfiles.verified,
        verificationStatus: artistProfiles.verificationStatus,
        verificationDetails: artistProfiles.verificationDetails,
        rejectionReason: artistProfiles.rejectionReason,
        monthlyListeners: artistProfiles.monthlyListeners,
        socialLinks: artistProfiles.socialLinks,
        createdAt: artistProfiles.createdAt,
        updatedAt: artistProfiles.updatedAt,
      })
      .from(artistProfiles)
      .innerJoin(users, eq(artistProfiles.userId, users.id))
      .where(whereClause)
      .orderBy(desc(artistProfiles.updatedAt))
      .limit(limit)
      .offset(offset);

    return {
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Admin: Review and Approve or Reject verification.
   */
  async adminReviewVerification(
    artistId: string,
    input: AdminVerifyArtistInput
  ) {
    const [artist] = await db
      .select({ id: artistProfiles.id })
      .from(artistProfiles)
      .where(eq(artistProfiles.id, artistId))
      .limit(1);

    if (!artist) {
      throw new Error("Artist profile not found");
    }

    const isApprove = input.status === "VERIFIED";

    const [updated] = await db
      .update(artistProfiles)
      .set({
        verified: isApprove,
        verificationStatus: input.status,
        rejectionReason: isApprove ? null : input.reason,
        updatedAt: new Date(),
      })
      .where(eq(artistProfiles.id, artistId))
      .returning();

    await cacheManager.invalidateArtist({
      id: updated.id,
      slug: updated.slug,
    });

    // Verification flips the `verified` flag the owner sees in both own views.
    // Vault-owned rows have no user, and they are never reachable via /artists/me.
    if (updated.userId) {
      await cacheManager.invalidateSelfArtist(updated.userId);
    }

    return updated;
  }
}
