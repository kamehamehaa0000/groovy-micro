import { z } from "zod";
import dotenv from "dotenv";
import path from "node:path";
import os from "node:os";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().default("redis://localhost:6379"),

  // Cloudflare R2 / S3
  R2_ACCOUNT_ID: z.string().min(1, "R2_ACCOUNT_ID is required"),
  R2_ACCESS_KEY_ID: z.string().min(1, "R2_ACCESS_KEY_ID is required"),
  R2_SECRET_ACCESS_KEY: z.string().min(1, "R2_SECRET_ACCESS_KEY is required"),
  R2_BUCKET_NAME: z.string().default("groovy-media"),
  CDN_BASE_URL: z.string().default("https://pub-d2ff94b6e6924c22875a6799aa101a70.r2.dev"),

  // Concurrency & Scratch tuning
  CONCURRENCY: z.coerce.number().int().positive().default(1),
  UPLOAD_CONCURRENCY: z.coerce.number().int().positive().default(10),
  TEMP_DIR: z.string().default(path.join(os.tmpdir(), "groovy-transcoder")),

  // Binaries
  FFMPEG_PATH: z.string().optional().default(""),
  FFPROBE_PATH: z.string().optional().default(""),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables for media-convertion-worker:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = {
  ...parsed.data,
  CDN_BASE_URL: parsed.data.CDN_BASE_URL.replace(/\/+$/, ""),
};
