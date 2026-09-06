import {
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client } from "./storage.client";
import { UPLOAD_PRESETS, type UploadCategory } from "./storage.presets";

export class StorageService {
  private bucketName = process.env.R2_BUCKET_NAME || "groovy-media";
  private cdnBaseUrl = process.env.CDN_BASE_URL || "https://cdn.groovy.stream";

  /**
   * Generates a pre-signed PUT upload URL locked to MIME type and content length.
   */
  async generateUploadUrl(params: {
    category: UploadCategory;
    ownerId: string;
    resourceId: string;
    mimeType: string;
    fileExtension: string;
    fileSizeBytes: number;
  }) {
    const preset = UPLOAD_PRESETS[params.category];
    if (!preset) {
      throw new Error(`Invalid upload category: ${params.category}`);
    }

    // 1. Validate MIME Type
    const normalizedMime = params.mimeType.toLowerCase();
    if (!preset.allowedMimeTypes.includes(normalizedMime)) {
      throw new Error(
        `Unsupported MIME type "${params.mimeType}" for category ${params.category}. Allowed: ${preset.allowedMimeTypes.join(", ")}`
      );
    }

    // 2. Validate File Size
    if (params.fileSizeBytes > preset.maxSizeBytes) {
      const maxMb = (preset.maxSizeBytes / (1024 * 1024)).toFixed(1);
      const reqMb = (params.fileSizeBytes / (1024 * 1024)).toFixed(1);
      throw new Error(
        `File size (${reqMb}MB) exceeds the maximum allowed size of ${maxMb}MB for ${params.category}`
      );
    }

    // 3. Generate deterministic namespaced key
    const cleanExt = params.fileExtension.replace(/^\./, "").toLowerCase();
    const storageKey = preset.generateKey(
      params.ownerId,
      params.resourceId,
      cleanExt
    );

    // 4. Create PutObjectCommand locked to Content-Type & Content-Length
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: storageKey,
      ContentType: normalizedMime,
      ContentLength: params.fileSizeBytes,
      Metadata: {
        ownerId: params.ownerId,
        category: params.category,
      },
    });

    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: preset.ttlSeconds,
    });

    const publicUrl = preset.isPublic
      ? `${this.cdnBaseUrl}/${storageKey}`
      : null;

    return {
      uploadUrl,
      storageKey,
      publicUrl,
      expiresInSeconds: preset.ttlSeconds,
    };
  }

  /**
   * Verifies that the client actually finished uploading to R2 before saving to database.
   */
  async verifyObjectExists(
    storageKey: string
  ): Promise<{ sizeBytes: number; contentType: string } | null> {
    try {
      const res = await s3Client.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: storageKey,
        })
      );

      return {
        sizeBytes: res.ContentLength ?? 0,
        contentType: res.ContentType ?? "application/octet-stream",
      };
    } catch (err: any) {
      if (
        err.name === "NotFound" ||
        err.$metadata?.httpStatusCode === 404 ||
        err.name === "NoSuchKey"
      ) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Deletes an object from storage (e.g. replacing avatar or cover art).
   */
  async deleteObject(storageKey: string): Promise<void> {
    try {
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: storageKey,
        })
      );
    } catch (err: any) {
      // Ignore if key didn't exist
      if (err.name !== "NotFound" && err.name !== "NoSuchKey") {
        throw err;
      }
    }
  }

  /**
   * Constructs public CDN URL from a storage key.
   */
  getPublicUrl(storageKey: string): string {
    return `${this.cdnBaseUrl}/${storageKey}`;
  }
}
