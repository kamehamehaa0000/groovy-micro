import { eq, sql, and, or, ilike, desc, count } from "drizzle-orm";
import { db } from "../../db";
import { artistProfiles, artistFollowers, users } from "../../db/schema";
import type {
  CreateArtistInput,
  UpdateArtistInput,
  RequestVerificationInput,
  AdminVerifyArtistInput,
  SearchArtistsQuery,
  AdminListArtistsQuery,
} from "./artists.schemas";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    return await db.transaction(async (tx) => {
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
  }

  /**
   * Retrieves an artist profile by either UUID or human-readable slug.
   */
  async getArtistByIdOrSlug(idOrSlug: string, currentUserId?: string) {
    const isUUID = UUID_REGEX.test(idOrSlug);

    const [artist] = await db
      .select({
        id: artistProfiles.id,
        userId: artistProfiles.userId,
        stageName: artistProfiles.stageName,
        slug: artistProfiles.slug,
        bio: artistProfiles.bio,
        bannerUrl: artistProfiles.bannerUrl,
        verified: artistProfiles.verified,
        monthlyListeners: artistProfiles.monthlyListeners,
        socialLinks: artistProfiles.socialLinks,
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

    // Get total follower count
    const [followerCountRes] = await db
      .select({ total: count() })
      .from(artistFollowers)
      .where(eq(artistFollowers.artistId, artist.id));

    const followersCount = followerCountRes?.total ?? 0;

    // Check if current user is following
    let isFollowing = false;
    if (currentUserId) {
      const [follow] = await db
        .select({ userId: artistFollowers.userId })
        .from(artistFollowers)
        .where(
          and(
            eq(artistFollowers.artistId, artist.id),
            eq(artistFollowers.userId, currentUserId)
          )
        )
        .limit(1);

      isFollowing = !!follow;
    }

    return {
      ...artist,
      followersCount,
      isFollowing,
    };
  }

  /**
   * Retrieves logged-in artist's own profile and studio telemetry.
   */
  async getMyArtistProfile(userId: string) {
    const [profile] = await db
      .select()
      .from(artistProfiles)
      .where(eq(artistProfiles.userId, userId))
      .limit(1);

    if (!profile) {
      return null;
    }

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

    const [updated] = await db
      .update(artistProfiles)
      .set({
        ...(input.stageName ? { stageName: input.stageName } : {}),
        slug: updatedSlug,
        ...(input.bio !== undefined ? { bio: input.bio } : {}),
        ...(input.bannerUrl !== undefined ? { bannerUrl: input.bannerUrl } : {}),
        ...(input.socialLinks ? { socialLinks: input.socialLinks } : {}),
        updatedAt: new Date(),
      })
      .where(eq(artistProfiles.id, profile.id))
      .returning();

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

    return {
      message: "Verification request submitted successfully",
      profile: updated,
    };
  }

  /**
   * Follow an artist.
   */
  async followArtist(userId: string, artistId: string) {
    const [artist] = await db
      .select({ id: artistProfiles.id, userId: artistProfiles.userId })
      .from(artistProfiles)
      .where(eq(artistProfiles.id, artistId))
      .limit(1);

    if (!artist) {
      throw new Error("Artist not found");
    }

    if (artist.userId === userId) {
      throw new Error("You cannot follow your own artist profile");
    }

    // Insert follow record (idempotent)
    await db
      .insert(artistFollowers)
      .values({
        userId,
        artistId,
      })
      .onConflictDoNothing();

    const [followerCountRes] = await db
      .select({ total: count() })
      .from(artistFollowers)
      .where(eq(artistFollowers.artistId, artistId));

    return {
      following: true,
      followersCount: followerCountRes?.total ?? 0,
    };
  }

  /**
   * Unfollow an artist.
   */
  async unfollowArtist(userId: string, artistId: string) {
    await db
      .delete(artistFollowers)
      .where(
        and(
          eq(artistFollowers.userId, userId),
          eq(artistFollowers.artistId, artistId)
        )
      );

    const [followerCountRes] = await db
      .select({ total: count() })
      .from(artistFollowers)
      .where(eq(artistFollowers.artistId, artistId));

    return {
      following: false,
      followersCount: followerCountRes?.total ?? 0,
    };
  }

  /**
   * Check if a listener follows an artist.
   */
  async checkIsFollowing(userId: string, artistId: string): Promise<boolean> {
    const [follow] = await db
      .select({ userId: artistFollowers.userId })
      .from(artistFollowers)
      .where(
        and(
          eq(artistFollowers.userId, userId),
          eq(artistFollowers.artistId, artistId)
        )
      )
      .limit(1);

    return !!follow;
  }

  /**
   * Search and list artists with pagination.
   */
  async searchArtists(query: SearchArtistsQuery) {
    const page = query.page;
    const limit = query.limit;
    const offset = (page - 1) * limit;

    const whereClause = query.search
      ? or(
          ilike(artistProfiles.stageName, `%${query.search}%`),
          ilike(artistProfiles.slug, `%${query.search}%`)
        )
      : undefined;

    const [totalRes] = await db
      .select({ total: count() })
      .from(artistProfiles)
      .where(whereClause);

    const total = totalRes?.total ?? 0;

    const data = await db
      .select({
        id: artistProfiles.id,
        stageName: artistProfiles.stageName,
        slug: artistProfiles.slug,
        bio: artistProfiles.bio,
        bannerUrl: artistProfiles.bannerUrl,
        verified: artistProfiles.verified,
        monthlyListeners: artistProfiles.monthlyListeners,
        createdAt: artistProfiles.createdAt,
      })
      .from(artistProfiles)
      .where(whereClause)
      .orderBy(desc(artistProfiles.monthlyListeners), desc(artistProfiles.createdAt))
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

    return updated;
  }
}
