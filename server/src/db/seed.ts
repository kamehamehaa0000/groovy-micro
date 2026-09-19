import { db } from "./index";
import { subscriptionPlans, planFeatureDefinitions } from "./schema";

export async function seedDefaultPlans() {
  console.log("🌱 Checking default subscription plans & feature definitions...");

  const defaultFeatures = [
    {
      key: "max_bitrate_kbps",
      name: "Maximum Audio Bitrate",
      description: "Audio streaming quality cap in kbps (e.g. 128, 320, 1411)",
      valueType: "NUMERIC",
      defaultValue: 128,
      category: "streaming",
      isActive: true,
    },
    {
      key: "lossless",
      name: "Lossless Studio Audio",
      description: "Uncompressed FLAC / WAV lossless streaming",
      valueType: "BOOLEAN",
      defaultValue: false,
      category: "streaming",
      isActive: true,
    },
    {
      key: "can_host_jam",
      name: "Host Live Jam Sessions",
      description: "Ability to host collaborative synchronized listening rooms",
      valueType: "BOOLEAN",
      defaultValue: false,
      category: "jam",
      isActive: true,
    },
    {
      key: "max_jam_participants",
      name: "Maximum Jam Room Size",
      description: "Maximum concurrent participants allowed in hosted Jam rooms",
      valueType: "NUMERIC",
      defaultValue: 3,
      category: "jam",
      isActive: true,
    },
    {
      key: "ad_free",
      name: "Ad-Free Experience",
      description: "Uninterrupted playback without audio or banner sponsorships",
      valueType: "BOOLEAN",
      defaultValue: false,
      category: "general",
      isActive: true,
    },
    {
      key: "personal_collection_quota",
      name: "Personal Collection Songs Quota",
      description: "Number of songs that can be stored in Personal Collection.",
      valueType: "NUMERIC",
      defaultValue: 1000,
      category: "streaming",
      isActive: true,
    },
  ];

  for (const feat of defaultFeatures) {
    await db
      .insert(planFeatureDefinitions)
      .values(feat)
      .onConflictDoUpdate({
        target: planFeatureDefinitions.key,
        set: {
          name: feat.name,
          description: feat.description,
          valueType: feat.valueType,
          defaultValue: feat.defaultValue,
          category: feat.category,
          isActive: feat.isActive,
        },
      });
  }

  const plans = [
    {
      id: "free",
      name: "Groovy Free",
      priceCents: 0,
      currency: "USD",
      interval: "month",
      features: {
        max_bitrate_kbps: 128,
        lossless: false,
        ad_free: false,
        can_host_jam: false,
        max_jam_participants: 3,
        personal_collection_quota: 1000,
      },
      isActive: true,
    },
    {
      id: "premium_individual",
      name: "Groovy Premium",
      priceCents: 999,
      currency: "USD",
      interval: "month",
      features: {
        max_bitrate_kbps: 320,
        lossless: true,
        ad_free: true,
        can_host_jam: true,
        max_jam_participants: 15,
        personal_collection_quota: 5000,
      },
      isActive: true,
    },
    {
      id: "premium_student",
      name: "Groovy Student",
      priceCents: 499,
      currency: "USD",
      interval: "month",
      features: {
        max_bitrate_kbps: 320,
        lossless: true,
        ad_free: true,
        can_host_jam: true,
        max_jam_participants: 10,
        personal_collection_quota: 1000,
      },
      isActive: true,
    },
  ];

  for (const plan of plans) {
    await db
      .insert(subscriptionPlans)
      .values(plan)
      .onConflictDoUpdate({
        target: subscriptionPlans.id,
        set: {
          name: plan.name,
          priceCents: plan.priceCents,
          features: plan.features,
          isActive: plan.isActive,
        },
      });
  }

  console.log("✅ Default subscription plans seeded successfully!");
}

// Allow running directly via `bun run src/db/seed.ts`
if (import.meta.main) {
  seedDefaultPlans()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("❌ Seeding failed:", err);
      process.exit(1);
    });
}
