import path from "path";
import dotenv from "dotenv";

// Load from server/.env regardless of execution cwd
dotenv.config({ path: path.resolve(import.meta.dir, "../../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), "server/.env") });

import { HeadBucketCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { s3Client, getR2Client } from "./storage.client";
import { StorageService } from "./storage.service";

async function runStorageDiagnostic() {
  console.log("\n========================================================");
  console.log("   Cloudflare R2 Storage Diagnostic & Health Check      ");
  console.log("========================================================\n");

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME || "groovy-media";
  const cdnBaseUrl = process.env.CDN_BASE_URL || "https://cdn.groovy.stream";

  const isConfigured =
    accountId &&
    accountId !== "dev_r2_account_id" &&
    accessKeyId &&
    accessKeyId !== "dev_r2_access_key_id" &&
    secretAccessKey &&
    secretAccessKey !== "dev_r2_secret_access_key";

  console.log("1. Environment Variables Check:");
  console.log(
    `   - R2_ACCOUNT_ID:        ${
      accountId
        ? accountId === "dev_r2_account_id"
          ? "⚠️ (Using default placeholder: dev_r2_account_id)"
          : `✓ (${accountId.slice(0, 6)}...${accountId.slice(-4)})`
        : "✗ (Missing)"
    }`
  );
  console.log(
    `   - R2_ACCESS_KEY_ID:     ${
      accessKeyId
        ? accessKeyId === "dev_r2_access_key_id"
          ? "⚠️ (Using default placeholder: dev_r2_access_key_id)"
          : `✓ (${accessKeyId.slice(0, 6)}...${accessKeyId.slice(-4)})`
        : "✗ (Missing)"
    }`
  );
  console.log(
    `   - R2_SECRET_ACCESS_KEY: ${
      secretAccessKey
        ? secretAccessKey === "dev_r2_secret_access_key"
          ? "⚠️ (Using default placeholder)"
          : "✓ (Configured)"
        : "✗ (Missing)"
    }`
  );
  console.log(`   - R2_BUCKET_NAME:       ✓ "${bucketName}"`);
  console.log(`   - CDN_BASE_URL:         ✓ "${cdnBaseUrl}"\n`);

  if (!isConfigured) {
    console.log("⚠️  STATUS: Real Cloudflare R2 credentials not detected in .env.");
    console.log(
      "   To connect to live Cloudflare R2, configure the following in server/.env:\n" +
      "   R2_ACCOUNT_ID=<32-char Cloudflare Account ID>\n" +
      "   R2_ACCESS_KEY_ID=<R2 API Token Access Key ID>\n" +
      "   R2_SECRET_ACCESS_KEY=<R2 API Token Secret Access Key>\n" +
      "   R2_BUCKET_NAME=<Your R2 Bucket Name>\n" +
      "   CDN_BASE_URL=<Public R2.dev or Custom Domain URL>\n"
    );
    return;
  }

  console.log("2. Testing Cloudflare R2 Bucket Connectivity:");
  try {
    const client = getR2Client();
    console.log(`   Pinging bucket "${bucketName}" via S3 HeadBucket...`);
    await client.send(new HeadBucketCommand({ Bucket: bucketName }));
    console.log("   ✓ Bucket exists and credentials have valid access permissions!\n");

    console.log("3. Testing ListObjects Query:");
    const listRes = await client.send(
      new ListObjectsV2Command({ Bucket: bucketName, MaxKeys: 5 })
    );
    console.log(`   ✓ Bucket query successful. Key count: ${listRes.KeyCount ?? 0}\n`);

    console.log("4. Testing Pre-signed Upload URL Generation:");
    const storageService = new StorageService();
    const presigned = await storageService.generateUploadUrl({
      category: "USER_AVATAR",
      ownerId: "usr_diagnostic_test",
      resourceId: "usr_diagnostic_test",
      mimeType: "image/webp",
      fileExtension: "webp",
      fileSizeBytes: 1024 * 50, // 50 KB
    });

    console.log("   ✓ Generated signed PUT upload URL:");
    console.log(`     - Target Storage Key: ${presigned.storageKey}`);
    console.log(`     - Public Media URL:   ${presigned.publicUrl}`);
    console.log(`     - Presigned URL TTL:  ${presigned.expiresInSeconds}s`);
    console.log(`     - Endpoint Host:      ${new URL(presigned.uploadUrl).hostname}\n`);

    console.log("========================================================");
    console.log("   🎉 Cloudflare R2 is 100% OPERATIONAL & READY!        ");
    console.log("========================================================\n");
  } catch (err: any) {
    console.error("\n❌ R2 Connection Error:");
    console.error(`   Message: ${err.message}`);
    if (err.name) console.error(`   Code/Name: ${err.name}`);
    if (err.$metadata?.httpStatusCode) {
      console.error(`   HTTP Status: ${err.$metadata.httpStatusCode}`);
    }
    console.log("\nCommon Fixes:");
    console.log(" - If 403 Forbidden / InvalidAccessKeyId: Verify R2 Token was created with 'Object Read & Write' permission.");
    console.log(" - If 404 NotFound / NoSuchBucket: Check spelling of R2_BUCKET_NAME.");
    console.log(" - If CORS error in browser: Ensure CORS Policy is saved under Bucket > Settings > CORS Policy.\n");
  }
}

if (import.meta.main) {
  runStorageDiagnostic().catch(console.error);
}
