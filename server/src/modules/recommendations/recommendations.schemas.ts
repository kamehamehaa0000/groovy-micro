import { z } from "zod";

export const recommendationLimitQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).default(10),
});

export const radioParamsSchema = z.object({
  songId: z.string().uuid("Invalid song ID"),
});

export const playlistEnhanceParamsSchema = z.object({
  playlistId: z.string().uuid("Invalid playlist ID"),
});

export type RecommendationLimitQuery = z.infer<typeof recommendationLimitQuerySchema>;
export type RadioParams = z.infer<typeof radioParamsSchema>;
export type PlaylistEnhanceParams = z.infer<typeof playlistEnhanceParamsSchema>;
