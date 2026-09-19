import { app, bootstrap, redis } from "../../index";
import { client as pgClient, db } from "../../db";
import { users, songs } from "../../db/schema";
import { eq } from "drizzle-orm";
import { StorageService } from "./storage.service";
const storageService = new StorageService();

async function main() {
  console.log("🧪 Testing uncommitted-audio cleanup endpoint and security guards...\n");

  await bootstrap({ listen: false });

  // 1. Create two test users
  const userAEmail = `uncommit_a_${Date.now()}@test.com`;
  const userBEmail = `uncommit_b_${Date.now()}@test.com`;

  const regARes = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email: userAEmail, password: "Password123!", displayName: "User A" },
  });
  const userA = JSON.parse(regARes.body).user;

  const regBRes = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email: userBEmail, password: "Password123!", displayName: "User B" },
  });
  const userB = JSON.parse(regBRes.body).user;

  await db.update(users).set({ isEmailVerified: true }).where(eq(users.id, userA.id));
  await db.update(users).set({ isEmailVerified: true }).where(eq(users.id, userB.id));

  const loginA = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: userAEmail, password: "Password123!" },
  });
  const tokenA = JSON.parse(loginA.body).accessToken;

  const loginB = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: userBEmail, password: "Password123!" },
  });
  const tokenB = JSON.parse(loginB.body).accessToken;

  console.log("✓ Users registered and logged in");

  try {
    // 2. Request upload URL for raw audio
    const uploadPresign = await storageService.generateUploadUrl({
      category: "SONG_AUDIO_RAW",
      mimeType: "audio/mpeg",
      fileSizeBytes: 1024 * 1024,
      fileExtension: "mp3",
      ownerId: userA.id,
      resourceId: `res-${Date.now()}`,
    });

    console.log("✓ Presigned upload generated with storageKey:", uploadPresign.storageKey);

    if (!uploadPresign.cleanupToken) {
      throw new Error("Presigned response did not include cleanupToken!");
    }

    // 3. Test: Call without token -> 400
    const noTokenRes = await app.inject({
      method: "DELETE",
      url: "/api/v1/storage/uncommitted-audio",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { storageKey: uploadPresign.storageKey },
    });
    console.log("✓ Missing token returns status:", noTokenRes.statusCode);
    if (noTokenRes.statusCode !== 400) throw new Error("Expected 400 for missing token");

    // 4. Test: Call with tampered token -> 403
    const badTokenRes = await app.inject({
      method: "DELETE",
      url: "/api/v1/storage/uncommitted-audio",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { storageKey: uploadPresign.storageKey, cleanupToken: "forged_token_value" },
    });
    console.log("✓ Tampered token returns status:", badTokenRes.statusCode);
    if (badTokenRes.statusCode !== 403) throw new Error("Expected 403 for tampered token");

    // 5. Test: User B attempting to delete User A's uncommitted audio using user A's key -> 403
    const userBAttackRes = await app.inject({
      method: "DELETE",
      url: "/api/v1/storage/uncommitted-audio",
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { storageKey: uploadPresign.storageKey, cleanupToken: uploadPresign.cleanupToken },
    });
    console.log("✓ IDOR cross-user attack returns status:", userBAttackRes.statusCode);
    if (userBAttackRes.statusCode !== 403) throw new Error("Expected 403 for cross-user delete attempt");

    // 6. Test: Trying to delete a key outside audio/raw/ -> 400
    const wrongPrefixRes = await app.inject({
      method: "DELETE",
      url: "/api/v1/storage/uncommitted-audio",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { storageKey: "covers/some-important-cover.jpg", cleanupToken: "dummy" },
    });
    console.log("✓ Wrong prefix returns status:", wrongPrefixRes.statusCode);
    if (wrongPrefixRes.statusCode !== 400) throw new Error("Expected 400 for wrong prefix");

    // 7. Test: Valid cleanup request for uncommitted audio -> 200
    const validRes = await app.inject({
      method: "DELETE",
      url: "/api/v1/storage/uncommitted-audio",
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { storageKey: uploadPresign.storageKey, cleanupToken: uploadPresign.cleanupToken },
    });
    console.log("✓ Valid cleanup returns status:", validRes.statusCode);
    if (validRes.statusCode !== 200) throw new Error("Expected 200 for valid cleanup");

    console.log("\n🎉 ALL UNCOMMITTED AUDIO SECURITY TESTS PASSED!");
  } finally {
    // Cleanup test users
    await db.delete(users).where(eq(users.id, userA.id));
    await db.delete(users).where(eq(users.id, userB.id));
    await app.close();
    await redis.quit();
    await pgClient.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  });
