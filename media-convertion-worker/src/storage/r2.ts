import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import pLimit from "p-limit";
import { config } from "../config";

export const s3Client = new S3Client({
  region: "auto",
  endpoint:
    config.R2_ENDPOINT ??
    `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  // Custom endpoints (local emulators) require path-style addressing.
  forcePathStyle: Boolean(config.R2_ENDPOINT),
  credentials: {
    accessKeyId: config.R2_ACCESS_KEY_ID,
    secretAccessKey: config.R2_SECRET_ACCESS_KEY,
  },
});

export interface TransferOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Downloads a raw object from Cloudflare R2 to a local destination path.
 */
export async function downloadRawAudio(
  rawKey: string,
  localDestinationPath: string,
  options: TransferOptions = {}
): Promise<void> {
  const dir = path.dirname(localDestinationPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const res = await s3Client.send(
    new GetObjectCommand({
      Bucket: config.R2_BUCKET_NAME,
      Key: rawKey,
    }),
    {
      abortSignal: options.signal,
      requestTimeout: options.timeoutMs ?? config.DOWNLOAD_TIMEOUT_MS,
    }
  );

  if (!res.Body) {
    throw new Error(`S3 GetObjectCommand returned empty body for key: ${rawKey}`);
  }

  const writeStream = fs.createWriteStream(localDestinationPath);
  await pipeline(res.Body as NodeJS.ReadableStream, writeStream, {
    signal: options.signal,
  });
}

/**
 * Recursively scans a directory and collects all relative file paths.
 */
function getFilesRecursively(dir: string, baseDir: string = dir): string[] {
  let results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(getFilesRecursively(fullPath, baseDir));
    } else {
      results.push(path.relative(baseDir, fullPath).replace(/\\/g, "/"));
    }
  }

  return results;
}

/**
 * Uploads all files from a local directory (e.g. HLS output) to R2 under an S3 key prefix,
 * utilizing concurrent worker pools (p-limit) and setting immutable cache headers for media segments.
 */
export async function uploadHlsDirectory(
  localDir: string,
  s3Prefix: string,
  options: TransferOptions = {}
): Promise<{ uploadedKeys: string[] }> {
  const cleanPrefix = s3Prefix.replace(/^\/+|\/+$/g, "");
  const relativeFiles = getFilesRecursively(localDir);

  if (relativeFiles.length === 0) {
    throw new Error(`No files found to upload in directory: ${localDir}`);
  }

  const limit = pLimit(config.UPLOAD_CONCURRENCY);
  const uploadedKeys: string[] = [];

  const uploadPromises = relativeFiles.map((relFile) =>
    limit(async () => {
      const fullPath = path.join(localDir, relFile);
      const s3Key = `${cleanPrefix}/${relFile}`;

      let contentType = "application/octet-stream";
      let cacheControl = "public, max-age=86400";

      if (relFile.endsWith(".m3u8")) {
        contentType = "application/vnd.apple.mpegurl";
        cacheControl = "public, max-age=86400";
      } else if (relFile.endsWith(".ts")) {
        contentType = "video/MP2T";
        cacheControl = "public, max-age=31536000, immutable";
      } else if (relFile.endsWith(".json")) {
        contentType = "application/json";
        cacheControl = "public, max-age=86400";
      }

      // Read the segment into memory and send it with an explicit
      // Content-Length.
      //
      // NOTE: the body is deliberately a Buffer rather than a Readable.
      // A streaming body makes the AWS SDK emit `Transfer-Encoding: chunked`
      // (it never propagates ContentLength to the header for streams), and
      // R2 rejects chunked PutObject requests. Segments are 95-240 KB, so
      // buffering costs nothing; the async read keeps the event loop free.
      const fileBuffer = await fs.promises.readFile(fullPath);

      await s3Client.send(
        new PutObjectCommand({
          Bucket: config.R2_BUCKET_NAME,
          Key: s3Key,
          Body: fileBuffer,
          ContentLength: fileBuffer.length,
          ContentType: contentType,
          CacheControl: cacheControl,
        }),
        {
          abortSignal: options.signal,
          requestTimeout: options.timeoutMs ?? config.UPLOAD_TIMEOUT_MS,
        }
      );

      uploadedKeys.push(s3Key);
    })
  );

  await Promise.all(uploadPromises);

  return { uploadedKeys };
}
