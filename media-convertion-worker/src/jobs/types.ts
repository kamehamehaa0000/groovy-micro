import { z } from "zod";

export const MEDIA_TRANSCODE_QUEUE_NAME = "media-transcode";

export const transcodeJobPayloadSchema = z.object({
  songId: z.string().uuid("Invalid song ID"),
  rawAudioKey: z.string().min(1, "rawAudioKey is required"),
  artistId: z.string().optional(),
  title: z.string().optional(),
});

export type TranscodeJobPayload = z.infer<typeof transcodeJobPayloadSchema>;
