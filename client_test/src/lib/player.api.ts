import { apiFetch } from "./api";
import type { PlayerStateSnapshot, StreamResolution } from "../types/player";

export const playerApi = {
  /**
   * Retrieves user's cross-device playback state snapshot from Redis (<1ms).
   */
  async getPlayerState(): Promise<{ state: PlayerStateSnapshot | null }> {
    return apiFetch<{ state: PlayerStateSnapshot | null }>("/api/v1/player/state");
  },

  /**
   * Saves debounced player state snapshot to Redis for cross-device resumption.
   */
  async savePlayerState(
    state: Omit<PlayerStateSnapshot, "userId" | "updatedAt">
  ): Promise<{ success: boolean; state: PlayerStateSnapshot }> {
    return apiFetch<{ success: boolean; state: PlayerStateSnapshot }>(
      "/api/v1/player/state",
      {
        method: "PUT",
        body: JSON.stringify(state),
      }
    );
  },

  /**
   * Resolves audio stream URL with dynamic entitlement check (FLAC / Hi-Fi vs. standard).
   */
  async getStreamUrl(
    songId: string,
    wantsLossless: boolean = false
  ): Promise<StreamResolution> {
    const query = wantsLossless ? "?quality=lossless" : "";
    return apiFetch<StreamResolution>(`/api/v1/songs/${songId}/stream${query}`);
  },
};
