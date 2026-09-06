import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { artistProfiles, playlists } from "../../db/schema";
import { StorageService } from "./storage.service";
import { requireAuth } from "../auth";
import type { UploadCategory } from "./storage.presets";

const presignedUrlSchema = z.object({
  category: z.enum([
    "USER_AVATAR",
    "ARTIST_BANNER",
    "ALBUM_COVER",
    "PLAYLIST_COVER",
    "SONG_AUDIO_RAW",
    "SONG_LYRICS",
    "ARTIST_VERIFICATION_DOC",
  ]),
  resourceId: z.string().min(1, "resourceId is required"),
  mimeType: z.string().min(1, "mimeType is required"),
  fileExtension: z.string().min(1, "fileExtension is required"),
  fileSizeBytes: z.number().int().positive("fileSizeBytes must be positive"),
});

export const storageRoutes: FastifyPluginAsync = async (fastify) => {
  const storageService = new StorageService();

  /**
   * POST /presigned-url
   * Generates a pre-signed PUT upload URL with domain authorization checks.
   */
  fastify.post(
    "/presigned-url",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parseResult = presignedUrlSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Validation failed",
          errors: parseResult.error.flatten().fieldErrors,
        });
      }

      const { category, resourceId, mimeType, fileExtension, fileSizeBytes } =
        parseResult.data;
      const user = request.user;

      // Domain-specific authorization rules
      switch (category as UploadCategory) {
        case "USER_AVATAR":
          if (resourceId !== user.id) {
            return reply.status(403).send({
              statusCode: 403,
              error: "Forbidden",
              message: "You can only upload an avatar for your own user account",
            });
          }
          break;

        case "ARTIST_BANNER":
        case "ARTIST_VERIFICATION_DOC": {
          if (user.role !== "ARTIST" && user.role !== "ADMIN") {
            return reply.status(403).send({
              statusCode: 403,
              error: "Forbidden",
              message: "Artist privileges required for this upload type",
            });
          }

          if (user.role === "ARTIST") {
            const [profile] = await db
              .select({ id: artistProfiles.id })
              .from(artistProfiles)
              .where(
                eq(artistProfiles.userId, user.id)
              )
              .limit(1);

            if (!profile || profile.id !== resourceId) {
              return reply.status(403).send({
                statusCode: 403,
                error: "Forbidden",
                message: "You do not own this artist profile",
              });
            }
          }
          break;
        }

        case "ALBUM_COVER":
        case "SONG_AUDIO_RAW":
        case "SONG_LYRICS": {
          if (user.role !== "ARTIST" && user.role !== "ADMIN") {
            return reply.status(403).send({
              statusCode: 403,
              error: "Forbidden",
              message: "Artist or Admin privileges required to upload catalog media",
            });
          }
          break;
        }

        case "PLAYLIST_COVER": {
          const [playlist] = await db
            .select({ ownerId: playlists.ownerId })
            .from(playlists)
            .where(eq(playlists.id, resourceId))
            .limit(1);

          if (!playlist || playlist.ownerId !== user.id) {
            return reply.status(403).send({
              statusCode: 403,
              error: "Forbidden",
              message: "You can only upload cover art for playlists you own",
            });
          }
          break;
        }
      }

      try {
        const result = await storageService.generateUploadUrl({
          category: category as UploadCategory,
          ownerId: user.id,
          resourceId,
          mimeType,
          fileExtension,
          fileSizeBytes,
        });

        return reply.status(200).send(result);
      } catch (err: any) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: err.message,
        });
      }
    }
  );
};
