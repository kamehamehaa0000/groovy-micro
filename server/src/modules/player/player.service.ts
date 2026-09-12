import { redis } from "../../db/redis";
import { cacheKeys } from "../../lib/cache/keys";
import type {
  SavePlayerStateInput,
  PlayerStateSnapshot,
} from "./player.schemas";

export class PlayerService {
  private readonly STATE_TTL_SECONDS = 86400 * 7; // 7 days retention

  /**
   * Retrieves current cross-device player state snapshot (<1ms Redis lookup).
   */
  async getPlayerState(userId: string): Promise<PlayerStateSnapshot | null> {
    const key = cacheKeys.player.state(userId);
    const raw = await redis.get(key);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as PlayerStateSnapshot;
    } catch {
      return null;
    }
  }

  /**
   * Persists debounced playback snapshot to Redis for seamless cross-device resumption.
   */
  async savePlayerState(
    userId: string,
    input: SavePlayerStateInput
  ): Promise<PlayerStateSnapshot> {
    const key = cacheKeys.player.state(userId);

    const snapshot: PlayerStateSnapshot = {
      ...input,
      userId,
      updatedAt: new Date().toISOString(),
    };

    await redis.set(key, JSON.stringify(snapshot), "EX", this.STATE_TTL_SECONDS);

    return snapshot;
  }
}
