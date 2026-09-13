import { app, redis, bootstrap } from "../../index";
import { client as pgClient, db } from "../../db";
import {
  users,
  userSubscriptions,
  subscriptionPlans,
  planFeatureDefinitions,
  outboxEvents,
} from "../../db/schema";
import { eq } from "drizzle-orm";
import { AuthService } from "../auth/auth.service";
import { requireAuth } from "../auth/auth.guards";
import { requireEntitlement, attachEntitlements } from "./subscriptions.guards";

// Register test routes BEFORE bootstrap() freezes routing table
app.get(
  "/test/entitled/lossless",
  { preHandler: [requireAuth, requireEntitlement("lossless")] },
  async (_req, reply) => {
    return reply.status(200).send({ allowed: true, message: "Lossless access granted" });
  }
);

app.get(
  "/test/entitled/jam-host",
  { preHandler: [requireAuth, requireEntitlement("can_host_jam")] },
  async (_req, reply) => {
    return reply.status(200).send({ allowed: true, message: "Jam hosting granted" });
  }
);

app.get(
  "/test/entitled/jam-size-10",
  { preHandler: [requireAuth, requireEntitlement("max_jam_participants", 10)] },
  async (_req, reply) => {
    return reply.status(200).send({ allowed: true, message: "Large Jam room size granted" });
  }
);

app.get(
  "/test/entitled/attached-features",
  { preHandler: [requireAuth, attachEntitlements] },
  async (req, reply) => {
    return reply.status(200).send({
      planId: (req.user as any).planId,
      entitlements: (req.user as any).entitlements,
    });
  }
);

async function createTestUser(displayName: string, role: "ADMIN" | "LISTENER" | "ARTIST" = "LISTENER") {
  const email = `test_${Date.now()}_${Math.random().toString(36).substring(2, 7)}@groovy.test`;
  const [user] = await db
    .insert(users)
    .values({
      email,
      passwordHash: "mock_hash",
      displayName,
      role,
      isEmailVerified: true,
      isActive: true,
      tokenVersion: 0,
    })
    .returning();

  await db
    .insert(userSubscriptions)
    .values({
      userId: user.id,
      planId: "free",
      status: "active",
    })
    .onConflictDoNothing();

  const authService = new AuthService(app);
  const tokens = await authService.issueTokenPair({
    id: user.id,
    email: user.email,
    role: user.role,
    tokenVersion: user.tokenVersion,
  });

  return { user, tokens };
}

async function runTests() {
  console.log("🧪 Starting Comprehensive Subscription & Dynamic Entitlements Tests...\n");

  await bootstrap({ listen: false });

  let adminUserId = "";
  let listenerUserId = "";
  let newFeatureKey = "";
  let customPlanId = "";

  try {
    // 1. Setup Admin User & Listener User
    const admin = await createTestUser("Entitlement Admin", "ADMIN");
    const adminToken = admin.tokens.accessToken;
    adminUserId = admin.user.id;

    const listener = await createTestUser("Free Listener", "LISTENER");
    const listenerToken = listener.tokens.accessToken;
    listenerUserId = listener.user.id;
    // =========================================================================
    // 1. DYNAMIC FEATURE CATALOG (ADMIN)
    // =========================================================================
    console.log("1️⃣ Testing Admin Feature Catalog Listing...");
    const featListRes = await app.inject({
      method: "GET",
      url: "/api/v1/admin/subscriptions/features",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    if (featListRes.statusCode !== 200) {
      throw new Error(`Failed to list features: ${featListRes.body}`);
    }
    const featList = JSON.parse(featListRes.body).features;
    const keys = featList.map((f: any) => f.key);
    console.log("   ✅ Active Catalog Feature Keys:", keys);
    if (
      !keys.includes("max_bitrate_kbps") ||
      !keys.includes("lossless") ||
      !keys.includes("can_host_jam") ||
      !keys.includes("max_jam_participants") ||
      !keys.includes("ad_free")
    ) {
      throw new Error("Missing required baseline features in catalog!");
    }

    console.log("\n2️⃣ Testing Dynamic Feature Creation by Admin...");
    newFeatureKey = `early_access_${Date.now()}`;
    const createFeatRes = await app.inject({
      method: "POST",
      url: "/api/v1/admin/subscriptions/features",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        key: newFeatureKey,
        name: "Early Access Master Drops",
        description: "Listen to master cuts 48 hours prior to official catalog drop",
        valueType: "BOOLEAN",
        defaultValue: false,
        category: "music",
      },
    });

    if (createFeatRes.statusCode !== 201) {
      throw new Error(`Failed to create feature: ${createFeatRes.body}`);
    }
    console.log(`   ✅ Dynamic feature '${newFeatureKey}' registered in catalog!`);

    // Update feature definition
    const updateFeatRes = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/subscriptions/features/${newFeatureKey}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        description: "Updated description for early access drops",
      },
    });
    if (updateFeatRes.statusCode !== 200) {
      throw new Error(`Failed to update feature: ${updateFeatRes.body}`);
    }
    console.log("   ✅ Feature definition description updated successfully");

    // Non-admin blocked
    const unauthFeatRes = await app.inject({
      method: "POST",
      url: "/api/v1/admin/subscriptions/features",
      headers: { authorization: `Bearer ${listenerToken}` },
      payload: {
        key: "unauthorized_feature",
        name: "Unauthorized",
        valueType: "BOOLEAN",
        defaultValue: false,
      },
    });
    if (unauthFeatRes.statusCode !== 403) {
      throw new Error("Expected 403 Forbidden for non-admin on feature catalog!");
    }
    console.log("   ✅ Status 403 Forbidden: Non-admin cannot register features");

    // =========================================================================
    // 2. SUBSCRIPTION PLANS (ADMIN & PUBLIC)
    // =========================================================================
    console.log("\n3️⃣ Testing Public Listing of Plans & Feature Perks...");
    const pubPlansRes = await app.inject({
      method: "GET",
      url: "/api/v1/subscriptions/plans",
    });
    if (pubPlansRes.statusCode !== 200) {
      throw new Error(`Public plans lookup failed: ${pubPlansRes.body}`);
    }
    const pubPlans = JSON.parse(pubPlansRes.body).plans;
    console.log("   ✅ Public Plans:", pubPlans.map((p: any) => p.id));

    const pubFeatRes = await app.inject({
      method: "GET",
      url: "/api/v1/subscriptions/features",
    });
    if (pubFeatRes.statusCode !== 200) {
      throw new Error(`Public features lookup failed: ${pubFeatRes.body}`);
    }
    console.log("   ✅ Public Feature Catalog returned successfully");

    console.log("\n4️⃣ Testing Admin Plan Creation with Dynamic Features...");
    customPlanId = `hifi_family_${Date.now()}`;
    const createPlanRes = await app.inject({
      method: "POST",
      url: "/api/v1/admin/subscriptions/plans",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        id: customPlanId,
        name: "Groovy HiFi Family",
        priceCents: 1999,
        currency: "USD",
        interval: "month",
        features: {
          max_bitrate_kbps: 1411,
          lossless: true,
          can_host_jam: true,
          max_jam_participants: 25,
          ad_free: true,
          [newFeatureKey]: true,
        },
        isActive: true,
      },
    });
    if (createPlanRes.statusCode !== 201) {
      throw new Error(`Failed to create custom plan: ${createPlanRes.body}`);
    }
    console.log(`   ✅ Custom plan '${customPlanId}' created with dynamic feature values!`);

    // =========================================================================
    // 3. USER ENTITLEMENTS & FASTIFY GUARD ENFORCEMENT
    // =========================================================================
    console.log("\n5️⃣ Testing Default Free User Entitlements Evaluation...");
    const meRes = await app.inject({
      method: "GET",
      url: "/api/v1/subscriptions/me",
      headers: { authorization: `Bearer ${listenerToken}` },
    });
    if (meRes.statusCode !== 200) {
      throw new Error(`Failed to get /me entitlements: ${meRes.body}`);
    }
    const meData = JSON.parse(meRes.body);
    console.log("   ✅ Active Plan ID:", meData.planId);
    console.log("   ✅ Free Bitrate:", meData.features.max_bitrate_kbps);
    console.log("   ✅ Free Lossless:", meData.features.lossless);
    console.log("   ✅ Dynamic Feature Fallback (default value):", meData.features[newFeatureKey]);

    if (meData.planId !== "free") throw new Error("Expected default plan to be 'free'!");
    if (meData.features.max_bitrate_kbps !== 128) throw new Error("Expected free bitrate to be 128!");
    if (meData.features.lossless !== false) throw new Error("Expected free lossless to be false!");
    if (meData.features[newFeatureKey] !== false) throw new Error("Expected omitted feature to fallback to false!");

    console.log("\n6️⃣ Testing requireEntitlement Guards on Protected Routes (Free User)...");
    const losslessBlocked = await app.inject({
      method: "GET",
      url: "/test/entitled/lossless",
      headers: { authorization: `Bearer ${listenerToken}` },
    });
    if (losslessBlocked.statusCode !== 403) {
      throw new Error(`Expected 403 Forbidden for lossless on free tier, got: ${losslessBlocked.statusCode}`);
    }
    const lossBlockBody = JSON.parse(losslessBlocked.body);
    if (lossBlockBody.code !== "ENTITLEMENT_REQUIRED" || lossBlockBody.requiredFeature !== "lossless") {
      throw new Error(`Unexpected 403 response structure: ${losslessBlocked.body}`);
    }
    console.log("   ✅ Status 403 Forbidden: requireEntitlement('lossless') blocked Free user");

    const jamBlocked = await app.inject({
      method: "GET",
      url: "/test/entitled/jam-host",
      headers: { authorization: `Bearer ${listenerToken}` },
    });
    if (jamBlocked.statusCode !== 403) {
      throw new Error("Expected 403 Forbidden for can_host_jam on free tier!");
    }
    console.log("   ✅ Status 403 Forbidden: requireEntitlement('can_host_jam') blocked Free user");

    const jamSizeBlocked = await app.inject({
      method: "GET",
      url: "/test/entitled/jam-size-10",
      headers: { authorization: `Bearer ${listenerToken}` },
    });
    if (jamSizeBlocked.statusCode !== 403) {
      throw new Error("Expected 403 Forbidden for max_jam_participants >= 10 on free tier!");
    }
    console.log("   ✅ Status 403 Forbidden: requireEntitlement('max_jam_participants', 10) blocked Free user (limit: 3)");

    // =========================================================================
    // 4. MOCK UPGRADE & INSTANT FEATURE UNLOCKING
    // =========================================================================
    console.log("\n7️⃣ Testing Mock Upgrade to 'premium_individual'...");
    const upgradeRes = await app.inject({
      method: "POST",
      url: "/api/v1/subscriptions/upgrade",
      headers: { authorization: `Bearer ${listenerToken}` },
      payload: {
        planId: "premium_individual",
      },
    });

    if (upgradeRes.statusCode !== 200) {
      throw new Error(`Upgrade failed: ${upgradeRes.body}`);
    }
    const upData = JSON.parse(upgradeRes.body).subscription;
    console.log("   ✅ Upgraded Plan:", upData.planId);
    console.log("   ✅ Premium Bitrate:", upData.features.max_bitrate_kbps);
    console.log("   ✅ Premium Lossless:", upData.features.lossless);
    console.log("   ✅ Premium Jam Host:", upData.features.can_host_jam);
    console.log("   ✅ Premium Jam Size:", upData.features.max_jam_participants);

    if (upData.features.lossless !== true) throw new Error("Lossless not unlocked on premium!");
    if (upData.features.max_bitrate_kbps !== 320) throw new Error("320kbps not unlocked on premium!");

    // Verify outbox event
    const [outboxEvent] = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.aggregateId, listenerUserId))
      .orderBy(outboxEvents.createdAt)
      .limit(1);

    if (!outboxEvent || outboxEvent.eventType !== "USER_SUBSCRIPTION_CHANGED") {
      throw new Error("Expected USER_SUBSCRIPTION_CHANGED outbox event!");
    }
    console.log("   ✅ Transactional outbox event 'USER_SUBSCRIPTION_CHANGED' captured");

    console.log("\n8️⃣ Testing Gated Routes for Upgraded Premium User...");
    const losslessAllowed = await app.inject({
      method: "GET",
      url: "/test/entitled/lossless",
      headers: { authorization: `Bearer ${listenerToken}` },
    });
    if (losslessAllowed.statusCode !== 200) {
      throw new Error(`Expected 200 OK for lossless on premium, got: ${losslessAllowed.body}`);
    }
    console.log("   ✅ Status 200 OK: requireEntitlement('lossless') granted for Premium user!");

    const jamAllowed = await app.inject({
      method: "GET",
      url: "/test/entitled/jam-host",
      headers: { authorization: `Bearer ${listenerToken}` },
    });
    if (jamAllowed.statusCode !== 200) {
      throw new Error("Expected 200 OK for can_host_jam on premium!");
    }
    console.log("   ✅ Status 200 OK: requireEntitlement('can_host_jam') granted for Premium user!");

    const jamSizeAllowed = await app.inject({
      method: "GET",
      url: "/test/entitled/jam-size-10",
      headers: { authorization: `Bearer ${listenerToken}` },
    });
    if (jamSizeAllowed.statusCode !== 200) {
      throw new Error("Expected 200 OK for max_jam_participants >= 10 on premium!");
    }
    console.log("   ✅ Status 200 OK: requireEntitlement('max_jam_participants', 10) granted for Premium user (limit: 15)!");

    // Test attachEntitlements hook
    const attachedRes = await app.inject({
      method: "GET",
      url: "/test/entitled/attached-features",
      headers: { authorization: `Bearer ${listenerToken}` },
    });
    const attachedData = JSON.parse(attachedRes.body);
    if (attachedData.planId !== "premium_individual" || attachedData.entitlements.max_bitrate_kbps !== 320) {
      throw new Error(`attachEntitlements failed: ${attachedRes.body}`);
    }
    console.log("   ✅ attachEntitlements preHandler attached user entitlements to request.user");

    // =========================================================================
    // 5. CANCELLATION & DOWNGRADE
    // =========================================================================
    console.log("\n9️⃣ Testing Subscription Cancellation & Downgrade...");
    const cancelRes = await app.inject({
      method: "POST",
      url: "/api/v1/subscriptions/cancel",
      headers: { authorization: `Bearer ${listenerToken}` },
    });
    if (cancelRes.statusCode !== 200) {
      throw new Error(`Cancel failed: ${cancelRes.body}`);
    }
    const cancelData = JSON.parse(cancelRes.body).subscription;
    if (cancelData.cancelAtPeriodEnd !== true) {
      throw new Error("Expected cancelAtPeriodEnd to be true!");
    }
    console.log("   ✅ Subscription set to cancel at end of current period");

    // Downgrade back to Free
    const downRes = await app.inject({
      method: "POST",
      url: "/api/v1/subscriptions/upgrade",
      headers: { authorization: `Bearer ${listenerToken}` },
      payload: {
        planId: "free",
      },
    });
    if (downRes.statusCode !== 200) {
      throw new Error(`Downgrade failed: ${downRes.body}`);
    }
    console.log("   ✅ Downgrade to 'free' completed successfully");

    // Re-verify that user is blocked again
    const reBlockLossless = await app.inject({
      method: "GET",
      url: "/test/entitled/lossless",
      headers: { authorization: `Bearer ${listenerToken}` },
    });
    if (reBlockLossless.statusCode !== 403) {
      throw new Error("Expected 403 after downgrade back to free!");
    }
    console.log("   ✅ Status 403 Forbidden: Lossless access revoked immediately after downgrade");

    console.log("\n🎉 ALL SUBSCRIPTION & DYNAMIC ENTITLEMENTS TESTS PASSED! 🚀\n");
  } finally {
    console.log("🧹 Cleaning up subscription test records...");
    if (customPlanId) {
      await db.delete(subscriptionPlans).where(eq(subscriptionPlans.id, customPlanId));
    }
    if (newFeatureKey) {
      await db.delete(planFeatureDefinitions).where(eq(planFeatureDefinitions.key, newFeatureKey));
    }
    if (listenerUserId) {
      await db.delete(outboxEvents).where(eq(outboxEvents.aggregateId, listenerUserId));
      await db.delete(users).where(eq(users.id, listenerUserId));
    }
    if (adminUserId) {
      await db.delete(outboxEvents).where(eq(outboxEvents.aggregateId, adminUserId));
      await db.delete(users).where(eq(users.id, adminUserId));
    }
    await app.close();
    await redis.quit();
    await pgClient.end();
  }
}

runTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Subscription test suite failed:", err);
    process.exit(1);
  });
