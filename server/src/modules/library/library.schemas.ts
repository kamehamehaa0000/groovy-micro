import { z } from "zod";

export const pinItemSchema = z.object({
  itemType: z.enum([
    "LIKED_SONGS",
    "PERSONAL_COLLECTION",
    "PLAYLIST",
    "ALBUM",
    "ARTIST",
  ]),
  itemId: z.string().min(1).max(64),
});

export type PinItemInput = z.infer<typeof pinItemSchema>;
