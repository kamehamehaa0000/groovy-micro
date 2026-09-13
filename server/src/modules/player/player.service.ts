import { eq, desc, sql } from "drizzle-orm";
import { db } from "../../db";
import { redis } from "../../db/redis";
import { listeningHistory, songs, albums, artistProfiles } from "../../db/schema";
import { cacheKeys } from "../../lib/cache/keys";
import type {
  SavePlayerStateInput,
  PlayerStateSnapshot,
  PlayerHeartbeatInput,
  PlayerHeartbeatResponse,
  ActiveDeviceSession,
  TelemetryPlayInput,
} from "./player.schemas";

export class PlayerService {
  private readonly STATE_TTL_SECONDS = 86400 * 7; // 7 days retention
  private readonly DEVICE_SESSION_TTL_SECONDS = 45; // 45s active device lease
  private readonly PRESENCE_TTL_SECONDS = 45; // 45s public presence TTL

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

  /**
   * Records active device heartbeat, enforces single-device playback (Option A),
   * and broadcasts live presence.
   */
  async recordHeartbeat(
    userId: string,
    input: PlayerHeartbeatInput
  ): Promise<PlayerHeartbeatResponse> {
    const activeDeviceKey = cacheKeys.player.activeDevice(userId);
    const rawSession = await redis.get(activeDeviceKey);
    const currentSession = rawSession
      ? (JSON.parse(rawSession) as ActiveDeviceSession)
      : null;

    const now = Date.now();

    // 1. Check if another device currently holds the active lease
    if (
      currentSession &&
      currentSession.deviceId !== input.deviceId &&
      now - currentSession.updatedAt < 35000 &&
      !input.takeover
    ) {
      return {
        status: "superseded",
        activeDevice: {
          deviceId: currentSession.deviceId,
          deviceName: currentSession.deviceName,
        },
      };
    }

    // 2. Register/refresh this device as the active lease
    const newSession: ActiveDeviceSession = {
      deviceId: input.deviceId,
      deviceName: input.deviceName,
      songId: input.songId,
      trackTitle: input.trackTitle,
      artistName: input.artistName,
      coverImageUrl: input.coverImageUrl,
      progressMs: input.progressMs,
      durationMs: input.durationMs,
      isPaused: input.isPaused,
      updatedAt: now,
    };

    await redis.set(
      activeDeviceKey,
      JSON.stringify(newSession),
      "EX",
      this.DEVICE_SESSION_TTL_SECONDS
    );

    // 3. Update public listening presence (evicted automatically if paused or after 45s)
    const presenceKey = cacheKeys.player.presence(userId);
    if (!input.isPaused && input.songId) {
      const presencePayload = {
        userId,
        songId: input.songId,
        trackTitle: input.trackTitle,
        artistName: input.artistName,
        coverImageUrl: input.coverImageUrl,
        progressMs: input.progressMs,
        durationMs: input.durationMs,
        isPaused: false,
        deviceName: input.deviceName,
        updatedAt: now,
      };
      await redis.set(
        presenceKey,
        JSON.stringify(presencePayload),
        "EX",
        this.PRESENCE_TTL_SECONDS
      );
    } else {
      await redis.del(presenceKey);
    }

    return { status: "active" };
  }

  /**
   * Retrieves current active device lease for authenticated user.
   */
  async getActiveDevice(userId: string): Promise<ActiveDeviceSession | null> {
    const key = cacheKeys.player.activeDevice(userId);
    const raw = await redis.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ActiveDeviceSession;
    } catch {
      return null;
    }
  }

  /**
   * Records qualified play telemetry (30s milestone):
   * 1. Increments high-frequency play count buffer in Redis.
   * 2. Inserts durable listening record in PostgreSQL listening_history.
   */
  async recordPlayTelemetry(
    userId: string | null,
    input: TelemetryPlayInput
  ): Promise<{ success: boolean }> {
    // 1. Atomic in-memory Redis increment
    await redis.hincrby(cacheKeys.telemetry.songPlaysBuffer(), input.songId, 1);

    // 2. Durable user history record
    if (userId) {
      await db.insert(listeningHistory).values({
        userId,
        songId: input.songId,
        durationListenedSeconds: input.durationListenedSeconds,
        completed: input.completed,
      });
    }

    return { success: true };
  }

  /**
   * Retrieves the user's recent listening history (deduplicated for distinct shelves).
   */
  async getRecentHistory(userId: string, limit: number = 20) {
    const rows = await db
      .select({
        historyId: listeningHistory.id,
        playedAt: listeningHistory.playedAt,
        durationListenedSeconds: listeningHistory.durationListenedSeconds,
        completed: listeningHistory.completed,
        song: {
          id: songs.id,
          title: songs.title,
          slug: songs.slug,
          genre: songs.genre,
          durationSeconds: songs.durationSeconds,
          isExplicit: songs.isExplicit,
          coverImageUrl: songs.coverImageUrl,
          audioUrl: songs.audioUrl,
          hlsManifestUrl: songs.hlsManifestUrl,
          rawAudioKey: songs.rawAudioKey,
          artistId: artistProfiles.id,
          artistName: artistProfiles.stageName,
          artistSlug: artistProfiles.slug,
          albumId: albums.id,
          albumTitle: albums.title,
        },
      })
      .from(listeningHistory)
      .innerJoin(songs, eq(listeningHistory.songId, songs.id))
      .innerJoin(artistProfiles, eq(songs.artistId, artistProfiles.id))
      .leftJoin(albums, eq(songs.albumId, albums.id))
      .where(eq(listeningHistory.userId, userId))
      .orderBy(desc(listeningHistory.playedAt))
      .limit(limit * 2);

    // Deduplicate so recent tracks shelf features unique songs
    const seenSongs = new Set<string>();
    const uniqueHistory = [];

    for (const row of rows) {
      if (!seenSongs.has(row.song.id)) {
        seenSongs.add(row.song.id);
        uniqueHistory.push(row);
      }
      if (uniqueHistory.length >= limit) break;
    }

    return uniqueHistory;
  }

  /**
   * Flushes buffered song play increments from Redis to PostgreSQL songs.plays_count.
   * Atomically decrements processed count from buffer so no concurrent plays are lost.
   */
  async flushPlayCountsToDatabase(): Promise<number> {
    const key = cacheKeys.telemetry.songPlaysBuffer();
    const allCounts = await redis.hgetall(key);
    if (!allCounts || Object.keys(allCounts).length === 0) return 0;

    let totalFlushed = 0;
    for (const [songId, countStr] of Object.entries(allCounts)) {
      const increment = parseInt(countStr, 10);
      if (Number.isFinite(increment) && increment > 0) {
        await redis.hincrby(key, songId, -increment);
        await db
          .update(songs)
          .set({
            playsCount: sql`${songs.playsCount} + ${increment}`,
          })
          .where(eq(songs.id, songId));
        totalFlushed += increment;
      }
    }

    return totalFlushed;
  }
}
