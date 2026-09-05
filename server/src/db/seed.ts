import { db } from "./index";
import { subscriptionPlans } from "./schema";

export async function seedDefaultPlans() {
  console.log("🌱 Checking default subscription plans...");

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
