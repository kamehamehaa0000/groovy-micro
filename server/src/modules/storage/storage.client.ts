import { S3Client } from "@aws-sdk/client-s3";

const accountId = process.env.R2_ACCOUNT_ID || "dev_r2_account_id";
const accessKeyId = process.env.R2_ACCESS_KEY_ID || "dev_r2_access_key_id";
const secretAccessKey =
  process.env.R2_SECRET_ACCESS_KEY || "dev_r2_secret_access_key";

const endpoint =
  accountId === "dev_r2_account_id"
    ? "https://dev-r2.groovy.internal"
    : `https://${accountId}.r2.cloudflarestorage.com`;

export const s3Client = new S3Client({
  region: "auto",
  endpoint,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
  forcePathStyle: true,
});
