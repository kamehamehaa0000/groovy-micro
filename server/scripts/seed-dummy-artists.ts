import { db } from "../src/db";
import { users } from "../src/db/schema/users";
import { artistProfiles } from "../src/db/schema/artists";
import { songs, albums } from "../src/db/schema/catalog";
import { hashPassword } from "../src/modules/auth/auth.hasher";
import { redis } from "../src/db/redis";
import { eq } from "drizzle-orm";

interface DummyArtistData {
  displayName: string;
  email: string;
  stageName: string;
  slug: string;
  primaryGenre: string;
  subGenre: string;
  bio: string;
  verified: boolean;
  verificationStatus: "VERIFIED" | "PENDING" | "NONE";
  monthlyListeners: number;
  avatarUrl: string;
  trackTitle: string;
  trackSlug: string;
}

const DUMMY_ARTISTS: DummyArtistData[] = [
  {
    displayName: "Lyra Vance",
    email: "lyra.vance@groovy.fm",
    stageName: "Lyra & The Drift",
    slug: "lyra-and-the-drift",
    primaryGenre: "Indie",
    subGenre: "Indie Folk",
    bio: "Acoustic fingerpicking meets shimmering synthesizer swells from the Pacific Northwest.",
    verified: true,
    verificationStatus: "VERIFIED",
    monthlyListeners: 142500,
    avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&h=500&fit=crop",
    trackTitle: "Golden Thread",
    trackSlug: "golden-thread",
  },
  {
    displayName: "Kaelen Moss",
    email: "kaelen.moss@groovy.fm",
    stageName: "Kaelen Moss",
    slug: "kaelen-moss",
    primaryGenre: "Ambient",
    subGenre: "Neo-Classical",
    bio: "Felted upright piano, analogue tape loops, and modular atmospheric soundscapes.",
    verified: false,
    verificationStatus: "NONE",
    monthlyListeners: 18900,
    avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=500&h=500&fit=crop",
    trackTitle: "Submerged Hymn",
    trackSlug: "submerged-hymn",
  },
  {
    displayName: "Aria Chen",
    email: "aria.chen@groovy.fm",
    stageName: "Solaris Pulse",
    slug: "solaris-pulse",
    primaryGenre: "Electronic",
    subGenre: "Synthwave",
    bio: "Neon arpeggios, retro-futuristic basslines, and late-night highway aesthetics.",
    verified: true,
    verificationStatus: "VERIFIED",
    monthlyListeners: 285400,
    avatarUrl: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=500&h=500&fit=crop",
    trackTitle: "Cyber Mirage",
    trackSlug: "cyber-mirage",
  },
  {
    displayName: "Darius King",
    email: "darius.king@groovy.fm",
    stageName: "Velvet District",
    slug: "velvet-district",
    primaryGenre: "R&B",
    subGenre: "Neo-Soul",
    bio: "Warm Rhodes chords, vintage drum machines, and honey-glazed falsettos.",
    verified: true,
    verificationStatus: "VERIFIED",
    monthlyListeners: 318000,
    avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=500&h=500&fit=crop",
    trackTitle: "Midnight Silk",
    trackSlug: "midnight-silk",
  },
  {
    displayName: "Maya Lin",
    email: "maya.lin@groovy.fm",
    stageName: "Paper Satellite",
    slug: "paper-satellite",
    primaryGenre: "Lo-Fi",
    subGenre: "Chillhop",
    bio: "Dusty vinyl crackle, mellow jazzy guitar chops, and introspective study beats.",
    verified: false,
    verificationStatus: "PENDING",
    monthlyListeners: 92300,
    avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=500&h=500&fit=crop",
    trackTitle: "Rainy Window",
    trackSlug: "rainy-window",
  },
  {
    displayName: "Rowan Sterling",
    email: "rowan.sterling@groovy.fm",
    stageName: "The Static Hours",
    slug: "the-static-hours",
    primaryGenre: "Rock",
    subGenre: "Post-Punk",
    bio: "Angular guitars, driving motorik basslines, and brooding baritone vocals.",
    verified: true,
    verificationStatus: "VERIFIED",
    monthlyListeners: 76400,
    avatarUrl: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=500&h=500&fit=crop",
    trackTitle: "Fading Beacon",
    trackSlug: "fading-beacon",
  },
  {
    displayName: "Chloe Dupont",
    email: "chloe.dupont@groovy.fm",
    stageName: "Pastel Mirage",
    slug: "pastel-mirage",
    primaryGenre: "Pop",
    subGenre: "Dream Pop",
    bio: "Shimmering chorus guitars, ethereal vocal harmonies, and pastel synth washes.",
    verified: true,
    verificationStatus: "VERIFIED",
    monthlyListeners: 198500,
    avatarUrl: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=500&h=500&fit=crop",
    trackTitle: "Sugar Horizon",
    trackSlug: "sugar-horizon",
  },
  {
    displayName: "Elijah Woods",
    email: "elijah.woods@groovy.fm",
    stageName: "Elijah & The Pines",
    slug: "elijah-and-the-pines",
    primaryGenre: "Indie",
    subGenre: "Americana",
    bio: "Heartland storytelling, slide guitar, and warm analog harmonies recorded in a barn.",
    verified: false,
    verificationStatus: "NONE",
    monthlyListeners: 42100,
    avatarUrl: "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=500&h=500&fit=crop",
    trackTitle: "Copper River",
    trackSlug: "copper-river",
  },
  {
    displayName: "Sora Tanaka",
    email: "sora.tanaka@groovy.fm",
    stageName: "Neon Bloom",
    slug: "neon-bloom",
    primaryGenre: "Electronic",
    subGenre: "Future Garage",
    bio: "Skippy syncopated percussion, pitched vocal fragments, and sub-bass depths.",
    verified: true,
    verificationStatus: "VERIFIED",
    monthlyListeners: 164000,
    avatarUrl: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=500&h=500&fit=crop",
    trackTitle: "Tokyo Drizzle",
    trackSlug: "tokyo-drizzle",
  },
  {
    displayName: "Zane Al-Mansoor",
    email: "zane.mansoor@groovy.fm",
    stageName: "Mirage Collective",
    slug: "mirage-collective",
    primaryGenre: "Ambient",
    subGenre: "World Fusion",
    bio: "Oud melodies woven into deep ambient dub spaces, field recordings, and organic percussion.",
    verified: false,
    verificationStatus: "VERIFIED",
    monthlyListeners: 58900,
    avatarUrl: "https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?w=500&h=500&fit=crop",
    trackTitle: "Oasis Mirage",
    trackSlug: "oasis-mirage",
  },
];

async function seedDummyArtists() {
  console.log("🌱 Seeding 10 dummy users with diverse artist profiles...");

  const defaultPassword = "Password123!";
  const passwordHash = await hashPassword(defaultPassword);

  let createdCount = 0;

  for (const item of DUMMY_ARTISTS) {
    // 1. Check if user already exists
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, item.email));

    let userId = existingUser?.id;

    if (!userId) {
      const [newUser] = await db
        .insert(users)
        .values({
          email: item.email,
          displayName: item.displayName,
          passwordHash,
          avatarUrl: item.avatarUrl,
          role: "ARTIST",
          isEmailVerified: true,
          isActive: true,
        })
        .returning({ id: users.id });
      userId = newUser.id;
      console.log(`  + Created user: ${item.displayName} (${item.email})`);
    } else {
      console.log(`  ~ User already exists: ${item.email}`);
    }

    // 2. Check if artist profile already exists
    const [existingArtist] = await db
      .select({ id: artistProfiles.id })
      .from(artistProfiles)
      .where(eq(artistProfiles.slug, item.slug));

    let artistId = existingArtist?.id;

    if (!artistId) {
      const [newArtist] = await db
        .insert(artistProfiles)
        .values({
          userId,
          ownerUserId: userId,
          scope: "GLOBAL",
          stageName: item.stageName,
          slug: item.slug,
          bio: item.bio,
          avatarUrl: item.avatarUrl,
          verified: item.verified,
          verificationStatus: item.verificationStatus,
          monthlyListeners: item.monthlyListeners,
        })
        .returning({ id: artistProfiles.id });
      artistId = newArtist.id;
      createdCount++;
      console.log(`  + Created artist profile: ${item.stageName} [${item.primaryGenre}]`);
    } else {
      console.log(`  ~ Artist profile already exists: ${item.stageName}`);
    }

    // 3. Create a sample track for this artist so primaryGenre resolves in recommendations
    const [existingSong] = await db
      .select({ id: songs.id })
      .from(songs)
      .where(eq(songs.slug, item.trackSlug));

    if (!existingSong) {
      await db.insert(songs).values({
        artistId,
        title: item.trackTitle,
        slug: item.trackSlug,
        genre: item.primaryGenre,
        primaryGenre: item.primaryGenre,
        subGenre: item.subGenre,
        durationSeconds: 215,
        processingStatus: "READY",
        scope: "GLOBAL",
        uploaderUserId: userId,
        coverImageUrl: item.avatarUrl,
        playsCount: Math.floor(item.monthlyListeners * 0.4),
        likesCount: Math.floor(item.monthlyListeners * 0.05),
      });
      console.log(`  + Created track "${item.trackTitle}" for ${item.stageName}`);
    }
  }

  // 4. Invalidate Redis recommendation caches
  try {
    const keys = await redis.keys("recommendations:*");
    if (keys && keys.length > 0) {
      await redis.del(...keys);
      console.log(`🧹 Flushed ${keys.length} stale recommendation cache keys in Redis.`);
    }
  } catch (err) {
    console.warn("Could not flush Redis cache:", err);
  }

  console.log(`✅ Finished seeding! Added ${createdCount} new artist profiles.`);
  process.exit(0);
}

seedDummyArtists().catch((err) => {
  console.error("❌ Seeding failed:", err);
  process.exit(1);
});
