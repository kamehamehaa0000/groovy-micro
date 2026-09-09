import { S3Client } from "@aws-sdk/client-s3";

/**
 * Creates an S3Client configured for Cloudflare R2 using runtime environment variables.
 */
export function getR2Client(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID || "dev_r2_account_id";
  const accessKeyId = process.env.R2_ACCESS_KEY_ID || "dev_r2_access_key_id";
  const secretAccessKey =
    process.env.R2_SECRET_ACCESS_KEY || "dev_r2_secret_access_key";

  const endpoint =
    accountId === "dev_r2_account_id"
      ? "https://dev-r2.groovy.internal"
      : `https://${accountId}.r2.cloudflarestorage.com`;

  return new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle: true,
  });
}

let cachedClient: S3Client | null = null;

/**
 * Reset client cache (useful during testing or when credentials change dynamically).
 */
export function resetR2ClientCache(): void {
  cachedClient = null;
}

/**
 * Proxied singleton instance so existing `s3Client.send(...)` calls continue to work seamlessly.
 */
export const s3Client: S3Client = new Proxy({} as S3Client, {
  get(_target, prop, receiver) {
    if (!cachedClient) {
      cachedClient = getR2Client();
    }
    const val = Reflect.get(cachedClient, prop, receiver);
    return typeof val === "function" ? val.bind(cachedClient) : val;
  },
});
