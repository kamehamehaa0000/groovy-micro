import { eq, desc, sql, and, or, isNull, lt } from "drizzle-orm";
import { db } from "../../db";
import { redis } from "../../db/redis";
import { listeningHistory, songs, albums, artistProfiles, users, userFollows } from "../../db/schema";
import { cacheKeys } from "../../lib/cache/keys";
import { cacheManager } from "../../lib/cache";
import type {
  SavePlayerStateInput,
  PlayerStateSnapshot,
  PlayerHeartbeatInput,
  PlayerHeartbeatResponse,
  ActiveDeviceSession,
  TelemetryPlayInput,
  PlayerSession,
  PlayerDevice,
  PlayerDeviceView,
  PlayerSessionView,
  SessionCommandInput,
  PlayerCommandResult,
  SessionTransferInput,
  TransferConfirmInput,
  PlayerTransferResult,
  PendingTransfer,
  TransferRevertReason,
} from "./player.schemas";
import {
  ONLINE_WINDOW_MS,
  MAX_DEVICES_PER_ACCOUNT,
  COMMAND_DEDUPE_TTL_SECONDS,
  TRANSFER_TTL_SECONDS,
  isServerAppliedCommand,
} from "./player.schemas";
import { publishPlayerEvent } from "./player.events";

/**
 * How long a Speaker's most recent report keeps it in charge.
 *
 * Only *reports* count — the 15s heartbeat, the 10s needle tick, or the moment a
 * handshake was created — so a device that has gone away stops owning the room
 * after this window and anyone else may take over (design doc rule B6). Same
 * length as the old single-device lease it replaces as the source of truth.
 */
const SPEAKER_HOLD_MS = 35_000;

export class PlayerService {
  private readonly STATE_TTL_SECONDS = 86400 * 7; // 7 days retention
  private readonly DEVICE_SESSION_TTL_SECONDS = 45; // 45s active device lease
  private readonly PRESENCE_TTL_SECONDS = 45; // 45s public presence TTL
  private readonly SESSION_TTL_SECONDS = 86400 * 7; // Groovy Connect session retention
  private readonly QUEUE_TTL_SECONDS = 86400 * 7; // Groovy Connect queue retention
  private readonly DEVICE_REGISTRY_PRUNE_MS = 86400 * 30 * 1000; // forget devices after 30 idle days

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
    const now = Date.now();
    const key = cacheKeys.player.state(userId);

    const snapshot: PlayerStateSnapshot = {
      ...input,
      userId,
      updatedAt: new Date(now).toISOString(),
    };

    // 1. LEGACY mirror: keeps `GET /state` and older clients working unchanged
    //    while the Groovy Connect session takes over as the canonical store.
    await redis.set(key, JSON.stringify(snapshot), "EX", this.STATE_TTL_SECONDS);

    // 2. Groovy Connect session: content (track + context) and the needle.
    //    `isPlaying` is deliberately left to the heartbeat, which is the only
    //    thing that actually knows whether audio is flowing.
    const session = (await this.getSession(userId)) ?? this.emptySession(userId, now);
    session.playback.track = (input.currentTrack as PlayerSession["playback"]["track"]) ?? null;
    session.playback.positionMs = Math.round((input.playbackPosition ?? 0) * 1000);
    session.playback.positionUpdatedAt = now;
    session.playback.durationMs = (input.currentTrack?.durationSeconds ?? 0) * 1000;
    session.context = {
      uri: input.contextUri ?? null,
      title: input.contextTitle ?? null,
      index: input.contextIndex ?? 0,
      shuffle: input.isShuffle ?? false,
      repeat: input.repeatMode ?? "off",
    };
    session.revision += 1;
    await this.writeSession(session);

    // 3. The queue is split out so the 10s position tick stays a tiny write.
    await redis.set(
      cacheKeys.player.queue(userId),
      JSON.stringify({
        userQueue: input.userQueue,
        contextQueue: input.contextQueue,
        contextIndex: input.contextIndex,
        revision: session.revision,
      }),
      "EX",
      this.QUEUE_TTL_SECONDS
    );

    // 4. Tell every other device on the account what is now playing, so a
    //    Remote's "Playing on {device}" strip and mini-player stay truthful
    //    without polling (design doc §6).
    await this.publishSessionState(userId, session);

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
    const rawLease = await redis.get(activeDeviceKey);
    const currentLease = rawLease
      ? (JSON.parse(rawLease) as ActiveDeviceSession)
      : null;

    const now = Date.now();
    const instanceId = input.instanceId || input.deviceId;

    // 1. Work out who owns playback right now.
    //
    // The Listen Session is the source of truth for "who is playing" (design
    // doc §4). The older `active_device` lease is only consulted when the
    // session has no Speaker at all: a *transfer* moves the session but never
    // touches the lease, so trusting the lease first would let the previous
    // device veto the new Speaker — which is exactly what made a pushed
    // transfer go silent on both devices.
    const session = await this.getSession(userId);
    const holder = session?.speaker ?? null;
    const holderIsMe =
      !!holder &&
      holder.deviceId === input.deviceId &&
      holder.instanceId === instanceId;

    if (!holderIsMe && !input.takeover) {
      // A Speaker — or a handshake's unconfirmed target — that reported in
      // recently still owns the room. An explicit takeover skips straight past
      // both checks; that is the "Play here" gesture (rules A2 / B7).
      if (holder && now - holder.lastSeenAt < SPEAKER_HOLD_MS) {
        return {
          status: "superseded",
          activeDevice: {
            deviceId: holder.deviceId,
            deviceName: holder.deviceName,
          },
        };
      }

      // No session Speaker yet (an account that predates Groovy Connect, or one
      // whose Speaker already released): fall back to the legacy lease so
      // single-device playback is still enforced.
      if (
        !holder &&
        currentLease &&
        currentLease.deviceId !== input.deviceId &&
        now - currentLease.updatedAt < SPEAKER_HOLD_MS
      ) {
        return {
          status: "superseded",
          activeDevice: {
            deviceId: currentLease.deviceId,
            deviceName: currentLease.deviceName,
          },
        };
      }
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

    // 2b. Groovy Connect: register the device, then mirror the Speaker and the
    //     needle into the Listen Session so other devices can see who is
    //     playing and where. The lease written above is now only a legacy
    //     mirror — the session decided in step 1 who is allowed to report.
    await this.recordDevicePresence(userId, {
      deviceId: input.deviceId,
      deviceName: input.deviceName,
      instanceId,
      unlocked: input.unlocked,
    });

    await this.markSpeaker(userId, {
      deviceId: input.deviceId,
      instanceId,
      deviceName: input.deviceName,
      positionMs: input.progressMs,
      durationMs: input.durationMs ?? 0,
      isPlaying: !input.isPaused,
      takeover: input.takeover,
    });

    // 3. Update public listening presence (evicted automatically if paused, after 45s, or if privacy is OFF)
    // 3. Update public listening presence (evicted automatically if paused, after 45s, or if privacy is OFF)
    const presenceKey = cacheKeys.player.presence(userId);
    if (!input.isPaused && input.songId) {
      // Check user privacy setting
      const [userRecord] = await db
        .select({
          listeningActivityPrivacy: users.listeningActivityPrivacy,
          lockerIncludeInRecentlyPlayed: users.lockerIncludeInRecentlyPlayed,
        })
        .from(users)
        .where(eq(users.id, userId));

      let shouldSuppressPresence =
        userRecord && userRecord.listeningActivityPrivacy === "OFF";

      // If user opted out of showing personal locker songs in recently played / friend activity
      if (!shouldSuppressPresence && userRecord?.lockerIncludeInRecentlyPlayed === false) {
        const [songRecord] = await db
          .select({ scope: songs.scope })
          .from(songs)
          .where(eq(songs.id, input.songId))
          .limit(1);

        if (songRecord?.scope === "PERSONAL") {
          shouldSuppressPresence = true;
        }
      }

      if (shouldSuppressPresence) {
        await redis.del(presenceKey);
      } else {
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
      }
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
    // 1. Atomic in-memory Redis increment (only if play qualifies)
    if (input.countPlay !== false) {
      await redis.hincrby(cacheKeys.telemetry.songPlaysBuffer(), input.songId, 1);
    }

    // 2. Durable user history record
    if (userId) {
      await db.insert(listeningHistory).values({
        userId,
        songId: input.songId,
        durationListenedSeconds: input.durationListenedSeconds,
        completed: input.completed,
        skipped: input.skipped ?? false,
        skipDurationSeconds: input.skipDurationSeconds ?? null,
      });
    }

    return { success: true };
  }

  /**
   * Retrieves the user's recent listening history (deduplicated for distinct shelves).
   */
  async getRecentHistory(userId: string, limit: number = 20) {
    const [userRecord] = await db
      .select({ lockerIncludeInRecentlyPlayed: users.lockerIncludeInRecentlyPlayed })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const includePersonal = userRecord?.lockerIncludeInRecentlyPlayed ?? true;

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
          primaryGenre: songs.primaryGenre,
          subGenre: songs.subGenre,
          moods: songs.moods,
          tags: songs.tags,
          bpm: songs.bpm,
          musicalKey: songs.musicalKey,
          energy: songs.energy,
          durationSeconds: songs.durationSeconds,
          isExplicit: songs.isExplicit,
          coverImageUrl: songs.coverImageUrl,
          audioUrl: songs.audioUrl,
          hlsManifestUrl: songs.hlsManifestUrl,
          rawAudioKey: songs.rawAudioKey,
          scope: songs.scope,
          artistId: artistProfiles.id,
          artistName: artistProfiles.stageName,
          artistSlug: artistProfiles.slug,
          albumId: albums.id,
          albumTitle: albums.title,
          albumSlug: albums.slug,
          albumType: albums.albumType,
          albumCoverImageUrl: albums.coverImageUrl,
        },
      })
      .from(listeningHistory)
      .innerJoin(songs, eq(listeningHistory.songId, songs.id))
      .innerJoin(artistProfiles, eq(songs.artistId, artistProfiles.id))
      .leftJoin(albums, eq(songs.albumId, albums.id))
      .where(
        and(
          eq(listeningHistory.userId, userId),
          eq(listeningHistory.skipped, false),
          isNull(songs.deletedAt),
          includePersonal
            ? or(
                eq(songs.scope, "GLOBAL"),
                and(eq(songs.scope, "PERSONAL"), eq(songs.uploaderUserId, userId))
              )
            : eq(songs.scope, "GLOBAL")
        )
      )
      .orderBy(desc(listeningHistory.playedAt))
      .limit(limit * 5);

    // Deduplicate by release (album if associated, otherwise standalone song)
    const seenReleases = new Set<string>();
    const uniqueHistory = [];

    for (const row of rows) {
      const releaseKey = row.song.albumId
        ? `album:${row.song.albumId}`
        : `song:${row.song.id}`;

      if (!seenReleases.has(releaseKey)) {
        seenReleases.add(releaseKey);
        uniqueHistory.push(row);
      }
      if (uniqueHistory.length >= limit) break;
    }

    return uniqueHistory;
  }

  /**
   * Retrieves paginated chronological listening history for the user.
   * Efficient keyset cursor pagination on (userId, playedAt).
   */
  async getHistory(
    userId: string,
    options: {
      cursor?: string;
      limit?: number;
      filter?: "all" | "completed" | "personal";
    } = {}
  ) {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
    const cursor = options.cursor ? new Date(options.cursor) : null;
    const filter = options.filter ?? "all";

    const [userRecord] = await db
      .select({ lockerIncludeInRecentlyPlayed: users.lockerIncludeInRecentlyPlayed })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const includePersonal = userRecord?.lockerIncludeInRecentlyPlayed ?? true;

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
          primaryGenre: songs.primaryGenre,
          subGenre: songs.subGenre,
          durationSeconds: songs.durationSeconds,
          isExplicit: songs.isExplicit,
          coverImageUrl: songs.coverImageUrl,
          audioUrl: songs.audioUrl,
          hlsManifestUrl: songs.hlsManifestUrl,
          rawAudioKey: songs.rawAudioKey,
          scope: songs.scope,
          artistId: artistProfiles.id,
          artistName: artistProfiles.stageName,
          artistSlug: artistProfiles.slug,
          albumId: albums.id,
          albumTitle: albums.title,
          albumSlug: albums.slug,
          albumType: albums.albumType,
          albumCoverImageUrl: albums.coverImageUrl,
          albumReleaseDate: albums.releaseDate,
        },
      })
      .from(listeningHistory)
      .innerJoin(songs, eq(listeningHistory.songId, songs.id))
      .innerJoin(artistProfiles, eq(songs.artistId, artistProfiles.id))
      .leftJoin(albums, eq(songs.albumId, albums.id))
      .where(
        and(
          eq(listeningHistory.userId, userId),
          eq(listeningHistory.skipped, false),
          isNull(songs.deletedAt),
          cursor && !isNaN(cursor.getTime())
            ? lt(listeningHistory.playedAt, cursor)
            : undefined,
          filter === "completed"
            ? eq(listeningHistory.completed, true)
            : undefined,
          filter === "personal"
            ? and(eq(songs.scope, "PERSONAL"), eq(songs.uploaderUserId, userId))
            : includePersonal
              ? or(
                  eq(songs.scope, "GLOBAL"),
                  and(eq(songs.scope, "PERSONAL"), eq(songs.uploaderUserId, userId))
                )
              : eq(songs.scope, "GLOBAL")
        )
      )
      .orderBy(desc(listeningHistory.playedAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && items.length > 0
        ? items[items.length - 1].playedAt.toISOString()
        : null;

    return {
      items,
      nextCursor,
      hasMore,
    };
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
        const remaining = await redis.hincrby(key, songId, -increment);
        if (remaining <= 0) {
          await redis.hdel(key, songId);
        }
        await db
          .update(songs)
          .set({
            playsCount: sql`${songs.playsCount} + ${increment}`,
          })
          .where(eq(songs.id, songId));

        // Invalidate song cache so UI updates immediately with fresh playsCount
        await cacheManager.invalidate(cacheKeys.catalog.song(songId));
        totalFlushed += increment;
      }
    }

    return totalFlushed;
  }

  /**
   * Retrieves live listening presence for friends & followed users based on privacy permissions.
   */
  async getFriendsActivity(userId: string) {
    // 1. Find all users that the current user follows with ACCEPTED status
    const following = await db
      .select({
        targetId: userFollows.followingId,
      })
      .from(userFollows)
      .where(
        and(
          eq(userFollows.followerId, userId),
          eq(userFollows.status, "ACCEPTED")
        )
      );

    if (following.length === 0) return [];
    const followingIds = following.map((f) => f.targetId);

    // 2. Query their profiles and check if they also follow current user back (mutual)
    const candidates = await db
      .select({
        id: users.id,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        listeningActivityPrivacy: users.listeningActivityPrivacy,
        followsBackStatus: userFollows.status,
      })
      .from(users)
      .leftJoin(
        userFollows,
        and(
          eq(userFollows.followerId, users.id),
          eq(userFollows.followingId, userId),
          eq(userFollows.status, "ACCEPTED")
        )
      )
      .where(or(...followingIds.map((id) => eq(users.id, id))));

    // 3. Filter by privacy settings:
    // - OFF: never visible
    // - FOLLOWERS: visible because current user is an accepted follower!
    // - FRIENDS_ONLY: visible only if mutual accepted follow (followsBackStatus is ACCEPTED)
    const visibleUsers = candidates.filter((u) => {
      if (u.listeningActivityPrivacy === "OFF") return false;
      if (u.listeningActivityPrivacy === "FOLLOWERS") return true;
      if (u.listeningActivityPrivacy === "FRIENDS_ONLY" && u.followsBackStatus === "ACCEPTED") return true;
      return false;
    });

    if (visibleUsers.length === 0) return [];

    // 4. Batch query their presence keys from Redis (MGET)
    const presenceKeys = visibleUsers.map((u) => cacheKeys.player.presence(u.id));
    const presenceStrings = await redis.mget(...presenceKeys);

    // 5. Build active activity results
    const activities = [];
    for (let i = 0; i < visibleUsers.length; i++) {
      const u = visibleUsers[i];
      const raw = presenceStrings[i];
      if (!raw) continue;

      try {
        const presence = JSON.parse(raw);
        if (!presence.isPaused && presence.songId) {
          activities.push({
            user: {
              id: u.id,
              displayName: u.displayName,
              avatarUrl: u.avatarUrl,
              isMutualFriend: u.followsBackStatus === "ACCEPTED",
            },
            activity: {
              songId: presence.songId,
              trackTitle: presence.trackTitle,
              artistName: presence.artistName,
              coverImageUrl: presence.coverImageUrl,
              progressMs: presence.progressMs,
              durationMs: presence.durationMs,
              deviceName: presence.deviceName,
              updatedAt: presence.updatedAt,
            },
          });
        }
      } catch {
        // Skip corrupt entry
      }
    }

    return activities;
  }

  /* ────────────────────────────────────────────────────────────────────────
   * Groovy Connect — Listen Session & device registry
   * See docs/CROSS_DEVICE_PLAYBACK_DESIGN.md §4–§6.
   * ──────────────────────────────────────────────────────────────────────── */

  /** A blank session, used whenever an account has never played. */
  private emptySession(userId: string, now = Date.now()): PlayerSession {
    return {
      userId,
      revision: 0,
      speaker: null,
      playback: {
        track: null,
        positionMs: 0,
        positionUpdatedAt: now,
        isPlaying: false,
        durationMs: 0,
      },
      context: { uri: null, title: null, index: 0, shuffle: false, repeat: "off" },
      updatedAt: now,
    };
  }

  private async readSession(userId: string): Promise<PlayerSession | null> {
    const raw = await redis.get(cacheKeys.player.session(userId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as PlayerSession;
    } catch {
      return null;
    }
  }

  private async writeSession(session: PlayerSession): Promise<void> {
    session.updatedAt = Date.now();
    await redis.set(
      cacheKeys.player.session(session.userId),
      JSON.stringify(session),
      "EX",
      this.SESSION_TTL_SECONDS
    );
  }

  /**
   * Reads the Listen Session, hydrating it from the legacy `state` snapshot on
   * first contact so pre-Connect accounts keep their track and queue.
   * See docs/CROSS_DEVICE_PLAYBACK_DESIGN.md §8.
   */
  async getSession(userId: string): Promise<PlayerSession | null> {
    const existing = await this.readSession(userId);
    if (existing) return existing;

    const legacyRaw = await redis.get(cacheKeys.player.state(userId));
    if (!legacyRaw) return null;

    try {
      const legacy = JSON.parse(legacyRaw) as PlayerStateSnapshot;
      const now = Date.now();
      const session = this.emptySession(userId, now);

      session.playback = {
        track: (legacy.currentTrack as PlayerSession["playback"]["track"]) ?? null,
        positionMs: Math.round((legacy.playbackPosition ?? 0) * 1000),
        positionUpdatedAt: now,
        isPlaying: false,
        durationMs: (legacy.currentTrack?.durationSeconds ?? 0) * 1000,
      };
      session.context = {
        uri: legacy.contextUri ?? null,
        title: legacy.contextTitle ?? null,
        index: legacy.contextIndex ?? 0,
        shuffle: legacy.isShuffle ?? false,
        repeat: legacy.repeatMode ?? "off",
      };

      await this.writeSession(session);
      await redis.set(
        cacheKeys.player.queue(userId),
        JSON.stringify({
          userQueue: legacy.userQueue ?? [],
          contextQueue: legacy.contextQueue ?? [],
          contextIndex: legacy.contextIndex ?? 0,
          revision: session.revision,
        }),
        "EX",
        this.QUEUE_TTL_SECONDS
      );

      return session;
    } catch {
      return null;
    }
  }

  /**
   * The needle right now. Remotes interpolate from the *server-stamped* anchor
   * instead of trusting a client clock (design doc principle 1).
   */
  getLivePositionMs(session: PlayerSession, now = Date.now()): number {
    const { positionMs, positionUpdatedAt, isPlaying, durationMs } = session.playback;
    if (!isPlaying) return positionMs;
    const live = positionMs + Math.max(0, now - positionUpdatedAt);
    return durationMs > 0 ? Math.min(live, durationMs) : live;
  }

  private isSpeaker(
    session: PlayerSession,
    deviceId: string,
    instanceId?: string
  ): boolean {
    if (!session.speaker || session.speaker.deviceId !== deviceId) return false;
    if (!instanceId) return true;
    return session.speaker.instanceId === instanceId;
  }

  /**
   * Broadcasts a *logical* session change to every device on the account.
   *
   * Deliberately viewer-independent: each client decides for itself whether the
   * Speaker is *it*, so a single publish serves every device (design doc §6).
   * Cheap by design — the caller already holds the session, so this costs one
   * `ZSCORE` for the Speaker's liveness and nothing else.
   */
  private async publishSessionState(
    userId: string,
    session: PlayerSession
  ): Promise<void> {
    const now = Date.now();
    let speakerOnline = false;
    if (session.speaker) {
      const score = await redis.zscore(
        cacheKeys.player.online(userId),
        `${session.speaker.deviceId}|${session.speaker.instanceId}`
      );
      speakerOnline = !!score && now - Number(score) < ONLINE_WINDOW_MS;
    }

    await publishPlayerEvent(userId, {
      type: "SESSION_STATE",
      session,
      livePositionMs: this.getLivePositionMs(session, now),
      speakerOnline,
      serverTime: now,
    });
  }

  /**
   * Registers/refreshes a device in the private liveness set and the durable
   * device registry. This is the job the old `presence` key wrongly shared with
   * friends-activity — see design doc principle 2.
   */
  async recordDevicePresence(
    userId: string,
    input: {
      deviceId: string;
      instanceId: string;
      deviceName?: string | null;
      platform?: string | null;
      unlocked?: boolean;
    }
  ): Promise<PlayerDevice> {
    const now = Date.now();
    const member = `${input.deviceId}|${input.instanceId}`;

    const onlineKey = cacheKeys.player.online(userId);
    // Read the previous score *before* refreshing it: the online flips are the
    // only presence samples worth telling other devices about, so the routine
    // 30s ping stays a single write (design doc principle 5).
    const previousScore = await redis.zscore(onlineKey, member);
    const wasOnline =
      !!previousScore && now - Number(previousScore) < ONLINE_WINDOW_MS;

    await redis.zadd(onlineKey, now, member);
    await redis.zremrangebyscore(
      onlineKey,
      "-inf",
      now - this.DEVICE_REGISTRY_PRUNE_MS
    );

    const devicesKey = cacheKeys.player.devices(userId);
    const raw = await redis.hget(devicesKey, input.deviceId);
    let entry: PlayerDevice | null = null;
    if (raw) {
      try {
        entry = JSON.parse(raw) as PlayerDevice;
      } catch {
        entry = null;
      }
    }
    const isNewDevice = entry === null;

    if (!entry) {
      const count = await redis.hlen(devicesKey);
      if (count >= MAX_DEVICES_PER_ACCOUNT) {
        await this.pruneOldestDevice(userId, devicesKey);
      }
      entry = {
        deviceId: input.deviceId,
        deviceName: input.deviceName || "Unknown device",
        platform: input.platform ?? null,
        firstSeenAt: now,
        lastSeenAt: now,
      };
    } else {
      entry.lastSeenAt = now;
      if (input.deviceName) entry.deviceName = input.deviceName;
      if (input.platform) entry.platform = input.platform;
    }

    await redis.hset(devicesKey, input.deviceId, JSON.stringify(entry));

    if (input.unlocked !== undefined) {
      await this.setAudioUnlocked(userId, input.deviceId, input.instanceId, input.unlocked);
    }

    // A new row, or a device returning from offline, changes the Devices panel
    // for everyone else. An already-online device pinging again does not.
    if (isNewDevice || !wasOnline) {
      await publishPlayerEvent(userId, {
        type: "DEVICES_CHANGED",
        devices: await this.listDevices(userId),
      });
    }

    return entry;
  }

  /**
   * Whether a tab has ever successfully started audio. Gates push transfers,
   * because browsers block autoplay without a user gesture (rule A10).
   */
  async setAudioUnlocked(
    userId: string,
    deviceId: string,
    instanceId: string,
    unlocked: boolean
  ): Promise<void> {
    const key = cacheKeys.player.unlocked(userId);
    const field = `${deviceId}|${instanceId}`;
    if (unlocked) {
      await redis.hset(key, field, "1");
      await redis.expire(key, this.SESSION_TTL_SECONDS);
    } else {
      await redis.hdel(key, field);
    }
  }

  async hasAudioUnlocked(
    userId: string,
    deviceId: string,
    instanceId: string
  ): Promise<boolean> {
    const value = await redis.hget(
      cacheKeys.player.unlocked(userId),
      `${deviceId}|${instanceId}`
    );
    return value === "1";
  }

  private async pruneOldestDevice(
    userId: string,
    devicesKey: string
  ): Promise<void> {
    const all = await redis.hgetall(devicesKey);
    const entries = Object.values(all)
      .map((v) => {
        try {
          return JSON.parse(v) as PlayerDevice;
        } catch {
          return null;
        }
      })
      .filter((d): d is PlayerDevice => d !== null)
      .sort((a, b) => a.lastSeenAt - b.lastSeenAt);

    const oldest = entries[0];
    if (oldest) await this.forgetDevice(userId, oldest.deviceId);
  }

  /** Removes a device from both the registry and the liveness set. */
  async forgetDevice(userId: string, deviceId: string): Promise<void> {
    await redis.hdel(cacheKeys.player.devices(userId), deviceId);

    const onlineKey = cacheKeys.player.online(userId);
    const members = await redis.zrange(onlineKey, 0, -1);
    const stale = members.filter((m) => m.split("|")[0] === deviceId);
    if (stale.length > 0) await redis.zrem(onlineKey, ...stale);

    await publishPlayerEvent(userId, {
      type: "DEVICES_CHANGED",
      devices: await this.listDevices(userId),
    });
  }

  /** The Devices panel: registry joined with live presence and Speaker state. */
  async listDevices(
    userId: string,
    session?: PlayerSession | null
  ): Promise<PlayerDeviceView[]> {
    const devicesKey = cacheKeys.player.devices(userId);
    const raw = await redis.hgetall(devicesKey);
    const now = Date.now();

    const onlineMembers = await redis.zrangebyscore(
      cacheKeys.player.online(userId),
      `(${now - ONLINE_WINDOW_MS}`,
      "+inf"
    );
    const onlineDeviceIds = new Set(
      onlineMembers.map((member) => member.split("|")[0])
    );

    const activeSession = session === undefined ? await this.getSession(userId) : session;
    const speakerDeviceId = activeSession?.speaker?.deviceId ?? null;

    const devices: PlayerDeviceView[] = [];
    for (const value of Object.values(raw)) {
      try {
        const device = JSON.parse(value) as PlayerDevice;
        devices.push({
          ...device,
          online: onlineDeviceIds.has(device.deviceId),
          isSpeaker: device.deviceId === speakerDeviceId,
        });
      } catch {
        // Skip corrupt registry entry
      }
    }

    // Speaker first, then online, then most recently seen.
    devices.sort((a, b) => {
      if (a.isSpeaker !== b.isSpeaker) return a.isSpeaker ? -1 : 1;
      if (a.online !== b.online) return a.online ? -1 : 1;
      return b.lastSeenAt - a.lastSeenAt;
    });

    return devices;
  }

  /** Mirrors the winning device into the session as the Speaker + needle. */
  async markSpeaker(
    userId: string,
    input: {
      deviceId: string;
      instanceId: string;
      deviceName: string;
      positionMs: number;
      durationMs: number;
      isPlaying: boolean;
      /** An explicit user action may end an in-flight handshake (rule A2). */
      takeover?: boolean;
    }
  ): Promise<PlayerSession> {
    const now = Date.now();
    const session = (await this.getSession(userId)) ?? this.emptySession(userId, now);

    // A handshake in flight owns the role until it resolves: a routine heartbeat
    // from some other device must not steal it (rule A9). The pending target
    // reporting as the Speaker, or an authorised takeover, ends the handshake.
    if (session.speaker && !session.speaker.confirmed) {
      const isPendingTarget =
        session.speaker.deviceId === input.deviceId &&
        session.speaker.instanceId === input.instanceId;
      if (isPendingTarget || input.takeover) {
        await this.clearPendingTransfer(userId);
      } else {
        return session;
      }
    }

    const previousSpeaker = session.speaker;
    const speakerChanged =
      !session.speaker ||
      session.speaker.deviceId !== input.deviceId ||
      session.speaker.instanceId !== input.instanceId;
    const playStateChanged = session.playback.isPlaying !== input.isPlaying;
    const seeked =
      Math.abs(Math.round(input.positionMs) - this.getLivePositionMs(session, now)) > 1500;

    session.speaker = {
      deviceId: input.deviceId,
      instanceId: input.instanceId,
      deviceName: input.deviceName,
      confirmed: true,
      lastSeenAt: now,
    };
    session.playback.positionMs = Math.max(0, Math.round(input.positionMs));
    session.playback.positionUpdatedAt = now;
    session.playback.isPlaying = input.isPlaying;
    if (input.durationMs > 0) session.playback.durationMs = Math.round(input.durationMs);

    // Only a *logical* change bumps the revision. Routine liveness samples and
    // steady-playback ticks refresh the anchor without churning the revision, so
    // `expectedRevision` checks stay meaningful (design doc principle 5).
    const logicalChange = speakerChanged || playStateChanged || seeked;
    if (logicalChange) session.revision += 1;

    await this.writeSession(session);

    // Broadcast only on a logical change — this is also what keeps the 15s
    // heartbeat from fanning a full session out to every device.
    if (logicalChange) {
      await this.publishSessionState(userId, session);

      // Targeted stand-down: the *previous* Speaker alone needs to react now,
      // and it needs to know who took over (rules A4 / C1). SPEAKER_LOST is the
      // step-3 replacement for waiting on a rejected needle tick.
      if (previousSpeaker && speakerChanged) {
        await publishPlayerEvent(userId, {
          type: "SPEAKER_LOST",
          deviceId: previousSpeaker.deviceId,
          instanceId: previousSpeaker.instanceId,
          newSpeaker: session.speaker,
        });
      }
    }

    return session;
  }

  /** The 10s needle tick from the Speaker. Only the Speaker may write it. */
  async updateSpeakerPosition(
    userId: string,
    input: { deviceId: string; instanceId: string; positionMs: number; isPlaying: boolean }
  ): Promise<{ updated: boolean; session: PlayerSession | null }> {
    const session = await this.getSession(userId);
    if (!session) return { updated: false, session: null };
    if (!this.isSpeaker(session, input.deviceId, input.instanceId)) {
      return { updated: false, session };
    }

    const now = Date.now();
    const playStateChanged = session.playback.isPlaying !== input.isPlaying;
    const seeked =
      Math.abs(Math.round(input.positionMs) - this.getLivePositionMs(session, now)) > 1500;

    session.playback.positionMs = Math.max(0, Math.round(input.positionMs));
    session.playback.positionUpdatedAt = now;
    session.playback.isPlaying = input.isPlaying;
    if (session.speaker) session.speaker.lastSeenAt = now;
    if (seeked || playStateChanged) session.revision += 1;

    await this.writeSession(session);

    // The needle tick is the one high-frequency event, so it gets a tiny
    // payload: Remotes re-anchor their own interpolation from these numbers
    // instead of fetching the whole session (design doc B2).
    await publishPlayerEvent(userId, {
      type: "POSITION",
      positionMs: session.playback.positionMs,
      positionUpdatedAt: session.playback.positionUpdatedAt,
      isPlaying: session.playback.isPlaying,
      revision: session.revision,
    });

    return { updated: true, session };
  }

  /**
   * The Speaker letting go (tab close). Freezes the needle at its live position
   * and detaches the Speaker so any Remote can pick playback up exactly there.
   */
  async releaseSpeaker(
    userId: string,
    input: { deviceId: string; instanceId: string }
  ): Promise<{ released: boolean; session: PlayerSession | null }> {
    const session = await this.getSession(userId);
    if (!session) return { released: false, session: null };
    if (!this.isSpeaker(session, input.deviceId, input.instanceId)) {
      return { released: false, session };
    }

    const now = Date.now();
    session.playback.positionMs = this.getLivePositionMs(session, now);
    session.playback.positionUpdatedAt = now;
    session.playback.isPlaying = false;
    session.speaker = null;
    session.revision += 1;

    await this.writeSession(session);

    await this.publishSessionState(userId, session);
    await publishPlayerEvent(userId, {
      type: "SPEAKER_LOST",
      deviceId: input.deviceId,
      instanceId: input.instanceId,
      newSpeaker: null,
    });

    return { released: true, session };
  }

  /**
   * Takes a command from a Remote and either applies it (play/pause/seek/stop)
   * or relays it to the Speaker, which owns the queue (design doc §6.4).
   *
   * Three properties matter here:
   * - the Speaker is the only device allowed to *produce* audio, so a command
   *   from the Speaker itself is refused loudly rather than silently ignored;
   * - `commandId` makes a retry or a double tap a no-op (rule A8), so flaky
   *   networks can't cost you two skips;
   * - a command aimed at an unreachable Speaker fails immediately, which is
   *   what lets the client say "Can't reach {device}" instead of hanging (B3).
   */
  async sendCommand(
    userId: string,
    input: SessionCommandInput
  ): Promise<PlayerCommandResult> {
    const session = await this.getSession(userId);
    if (!session) return { ok: false, reason: "NO_SESSION" };

    // A Live Jam is deliberately *not* modelled here. The jam has its own
    // service, its own channel and its own host, and the device that is in one
    // suspends Connect itself (see `isInJam` in the client's connect store).
    // Connect has no way to observe a jam, so a guard here could only ever
    // pretend to be one.
    const speaker = session.speaker;
    if (!speaker) return { ok: false, reason: "NO_SPEAKER" };

    // Mid-handshake the Speaker role is only *promised*, not owned: relaying a
    // command now could start audio on a device that has not confirmed yet
    // (rule A9). The session is in a defined state again within ~30s at most.
    if (!speaker.confirmed) return { ok: false, reason: "NO_SPEAKER" };

    // Rule B1: the Speaker acts locally, it does not command itself.
    if (this.isSpeaker(session, input.deviceId, input.instanceId)) {
      return { ok: false, reason: "IS_SPEAKER", speaker };
    }

    // Idempotency (rule A8): the first arrival wins, a retry is a no-op. The
    // key is deliberately short-lived — it only has to cover network retries.
    const dedupeKey = cacheKeys.player.command(userId, input.commandId);
    const firstArrival = await redis.set(
      dedupeKey,
      "1",
      "EX",
      COMMAND_DEDUPE_TTL_SECONDS,
      "NX"
    );
    if (firstArrival === null) {
      return { ok: true, duplicate: true, speaker };
    }

    // Fail fast when the Speaker isn't reachable (rule B3 / failure table).
    // Releasing the dedupe key keeps a genuinely failed command retryable.
    if (!(await this.isDeviceOnline(userId, speaker.deviceId, speaker.instanceId))) {
      await redis.del(dedupeKey);
      return { ok: false, reason: "SPEAKER_OFFLINE", speaker };
    }

    const now = Date.now();
    const applied = this.applyServerSideCommand(session, input, now);
    if (applied) {
      await this.writeSession(session);
      // Remotes converge straight from the broadcast; the Speaker gets the
      // COMMAND below so its audio follows, rather than racing the broadcast.
      await this.publishSessionState(userId, session);
    }

    await publishPlayerEvent(userId, {
      type: "COMMAND",
      deviceId: speaker.deviceId,
      instanceId: speaker.instanceId,
      commandId: input.commandId,
      command: input.type,
      payload: input.payload ?? null,
    });

    return { ok: true, speaker: session.speaker };
  }

  /**
   * Moves the needle (and, for `PLAY_TRACK`, the content) for the command types
   * the server owns, so every Remote sees the new state at the same time instead
   * of waiting for the Speaker to finish playing catch-up. Returns true when the
   * session actually changed.
   *
   * These are the transport actions that are *pure state* from the session's
   * point of view; the rest (next, shuffle, queue edits) need the Speaker's
   * queue, so they are relayed untouched.
   */
  private applyServerSideCommand(
    session: PlayerSession,
    input: SessionCommandInput,
    now: number
  ): boolean {
    if (!isServerAppliedCommand(input.type)) return false;

    const { playback } = session;

    if (input.type === "SEEK") {
      const target = Math.max(0, Math.round(input.payload?.positionMs ?? 0));
      playback.positionMs =
        playback.durationMs > 0 ? Math.min(target, playback.durationMs) : target;
      playback.positionUpdatedAt = now;
      session.revision += 1;
      return true;
    }

    // Rule B7 (Spotify semantics): a Remote picking a song means "play it on the
    // Speaker". The server owns *what* is playing, so it moves the track, the
    // context and the needle to the top of the new song, and every Remote
    // converges from the broadcast below. The Speaker still receives the
    // COMMAND, which is what actually swaps its audio and its queue.
    if (input.type === "PLAY_TRACK") {
      const track = input.payload?.track ?? null;
      if (!track) return false;
      playback.track = track;
      playback.positionMs = 0;
      playback.positionUpdatedAt = now;
      playback.durationMs = (track.durationSeconds ?? 0) * 1000;
      playback.isPlaying = true;
      session.context = {
        uri: input.payload?.contextUri ?? null,
        title: input.payload?.contextTitle ?? null,
        index: input.payload?.contextIndex ?? 0,
        // Shuffle and repeat are session settings, not part of the tap.
        shuffle: session.context.shuffle,
        repeat: session.context.repeat,
      };
      session.revision += 1;
      return true;
    }

    // PLAY, PAUSE and STOP are all "the needle is now (not) moving". Pausing
    // and stopping freeze it, so convert the live position to a stored one.
    if (input.type === "PLAY") {
      if (input.payload?.positionMs !== undefined) {
        playback.positionMs = Math.max(0, Math.round(input.payload.positionMs));
        playback.positionUpdatedAt = now;
      }
      if (playback.isPlaying) return false;
      playback.isPlaying = true;
      session.revision += 1;
      return true;
    }

    if (!playback.isPlaying) return false;
    playback.positionMs = this.getLivePositionMs(session, now);
    playback.positionUpdatedAt = now;
    playback.isPlaying = false;
    session.revision += 1;
    return true;
  }

  /** Is this exact tab currently within the private liveness window? */
  private async isDeviceOnline(
    userId: string,
    deviceId: string,
    instanceId: string
  ): Promise<boolean> {
    const score = await redis.zscore(
      cacheKeys.player.online(userId),
      `${deviceId}|${instanceId}`
    );
    return !!score && Date.now() - Number(score) < ONLINE_WINDOW_MS;
  }

  /**
   * Refreshes *only* the liveness score. Used by the SSE route to hold a
   * background tab open: the browser throttles that tab's own `setInterval`,
   * but an open stream is not throttled, so the server pulses on its behalf
   * (design doc principle 6).
   */
  async touchDevicePresence(
    userId: string,
    deviceId: string,
    instanceId: string
  ): Promise<void> {
    await redis.zadd(
      cacheKeys.player.online(userId),
      Date.now(),
      `${deviceId}|${instanceId}`
    );
  }

  /**
   * Stands the session down when the Speaker's stream dropped and did not come
   * back within the grace window (design doc failure table / rule R7): the
   * needle is frozen where it was so any Remote can resume from exactly there.
   *
   * The identity check is what makes this safe. If another device already took
   * over, or this tab reconnected and re-registered as Speaker, this is a no-op.
   */
  async detachSpeakerOnDisconnect(
    userId: string,
    deviceId: string,
    instanceId: string
  ): Promise<boolean> {
    const session = await this.getSession(userId);
    if (!session || !this.isSpeaker(session, deviceId, instanceId)) return false;

    // If it was the *target* of a handshake that never answered, the push simply
    // failed. Hand the needle back to the device that was muted for it (rule A9)
    // rather than parking playback for a tap that will never come.
    if (session.speaker && !session.speaker.confirmed) {
      const transfer = await this.readPendingTransfer(userId);
      if (
        transfer &&
        transfer.to.deviceId === deviceId &&
        transfer.to.instanceId === instanceId
      ) {
        await this.revertTransfer(userId, transfer, "OFFLINE");
        return true;
      }
    }

    const now = Date.now();
    session.playback.positionMs = this.getLivePositionMs(session, now);
    session.playback.positionUpdatedAt = now;
    session.playback.isPlaying = false;
    session.speaker = null;
    session.revision += 1;
    await this.writeSession(session);

    await this.publishSessionState(userId, session);
    await publishPlayerEvent(userId, {
      type: "SPEAKER_LOST",
      deviceId,
      instanceId,
      newSpeaker: null,
    });

    return true;
  }

  /* ────────────────────────────────────────────────────────────────────────
   * Groovy Connect — push transfer (confirm-then-move)
   *
   * "Play on {device}" is the one direction the devices themselves cannot do
   * alone: the target has to consent before it starts making sound, because
   * browsers block autoplay and because two rooms of sound is the one thing the
   * feature must never do. So the server takes a *ticket*, mutes the old
   * Speaker immediately, and only moves the role when the target confirms
   * (design doc §6.5, rules A6–A10).
   * ──────────────────────────────────────────────────────────────────────── */

  /** The in-flight transfer ticket for this account, if any. */
  private async readPendingTransfer(userId: string): Promise<PendingTransfer | null> {
    const raw = await redis.get(cacheKeys.player.transfer(userId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as PendingTransfer;
    } catch {
      return null;
    }
  }

  private async storePendingTransfer(
    userId: string,
    transfer: PendingTransfer
  ): Promise<void> {
    // The record outlives the logical window by a few seconds so the revert can
    // still read it back and hand the needle over cleanly.
    const ttlSeconds = Math.ceil(transferTtlMs / 1000) + 10;
    await redis.set(
      cacheKeys.player.transfer(userId),
      JSON.stringify(transfer),
      "EX",
      ttlSeconds
    );

    // A prompt, in-process revert on timeout (rule A9). `unref`ed like the SSE
    // grace timers so it never holds the process open.
    const existing = transferTimers.get(userId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      transferTimers.delete(userId);
      void this.revertTransfer(userId, transfer, "TIMEOUT").catch(() => {});
    }, Math.max(0, transfer.expiresAt - Date.now()));
    (timer as { unref?: () => void }).unref?.();
    transferTimers.set(userId, timer);
  }

  private async clearPendingTransfer(userId: string): Promise<void> {
    const timer = transferTimers.get(userId);
    if (timer) {
      clearTimeout(timer);
      transferTimers.delete(userId);
    }
    await redis.del(cacheKeys.player.transfer(userId));
  }

  /**
   * The Devices panel lists one row per **browser** (rule R10), but the Speaker
   * role is per **tab**. So a push to "Chrome on Windows" has to pick the tab
   * that will actually play: the tab that is already the Speaker, otherwise the
   * one that was seen most recently.
   */
  private async resolveTargetInstance(
    userId: string,
    deviceId: string
  ): Promise<string | null> {
    const onlineKey = cacheKeys.player.online(userId);
    const members = await redis.zrange(onlineKey, 0, -1);
    const candidates = members.filter((m) => m.split("|")[0] === deviceId);
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0].split("|")[1] ?? null;

    const session = await this.getSession(userId);
    if (session?.speaker && session.speaker.deviceId === deviceId) {
      const speakerMember = `${deviceId}|${session.speaker.instanceId}`;
      if (candidates.includes(speakerMember)) return session.speaker.instanceId;
    }

    let bestInstance: string | null = null;
    let bestScore = -1;
    for (const member of candidates) {
      const score = Number((await redis.zscore(onlineKey, member)) ?? 0);
      if (score > bestScore) {
        bestScore = score;
        bestInstance = member.split("|")[1] ?? null;
      }
    }
    return bestInstance;
  }

  /**
   * Starts a push handshake. The old Speaker is muted *now* and the target is
   * offered the playback; the role only really moves when the target confirms,
   * so there is never a moment with two rooms of sound (rule A9).
   */
  async requestTransfer(
    userId: string,
    input: SessionTransferInput
  ): Promise<PlayerTransferResult> {
    const session = await this.getSession(userId);
    if (!session) return { ok: false, reason: "NO_SESSION" };

    // Nothing to move yet.
    if (!session.playback.track) return { ok: false, reason: "NO_TRACK" };

    // Rule A8: the same ticket can only ever move the playback once, so a double
    // tap or a retried request is a no-op rather than a second handshake.
    const existing = await this.readPendingTransfer(userId);
    if (existing && existing.transferId === input.transferId) {
      return {
        ok: true,
        duplicate: true,
        transferId: existing.transferId,
        expiresAt: existing.expiresAt,
        needsGesture: existing.needsGesture,
        target: existing.to,
        speaker: session.speaker,
      };
    }

    if (
      input.expectedRevision !== undefined &&
      input.expectedRevision !== session.revision
    ) {
      return { ok: false, reason: "STALE_STATE", speaker: session.speaker };
    }

    const targetInstanceId = await this.resolveTargetInstance(
      userId,
      input.targetDeviceId
    );
    if (!targetInstanceId) {
      // Registered but not seen recently: refuse with copy, never silently
      // queue it (rule A6).
      return { ok: false, reason: "TARGET_OFFLINE" };
    }

    if (!(await this.isDeviceOnline(userId, input.targetDeviceId, targetInstanceId))) {
      return { ok: false, reason: "TARGET_OFFLINE" };
    }

    const rawDevice = await redis.hget(
      cacheKeys.player.devices(userId),
      input.targetDeviceId
    );
    let targetDevice: PlayerDevice | null = null;
    if (rawDevice) {
      try {
        targetDevice = JSON.parse(rawDevice) as PlayerDevice;
      } catch {
        targetDevice = null;
      }
    }
    if (!targetDevice) return { ok: false, reason: "NO_DEVICE" };

    const target = {
      deviceId: input.targetDeviceId,
      instanceId: targetInstanceId,
      deviceName: targetDevice.deviceName,
    };

    // Pushing to the device that already owns the room changes nothing.
    if (
      this.isSpeaker(session, target.deviceId, target.instanceId) &&
      session.speaker?.confirmed
    ) {
      return {
        ok: true,
        duplicate: true,
        target,
        speaker: session.speaker,
      };
    }

    // A new push supersedes an unanswered one instead of stranding it. The old
    // Speaker is *not* resumed here: the new handshake is about to mute it again.
    if (existing) {
      await this.revertTransfer(userId, existing, "SUPERSEDED", { resume: false });
    }

    const now = Date.now();
    const needsGesture = !(await this.hasAudioUnlocked(
      userId,
      target.deviceId,
      target.instanceId
    ));
    const frozenPositionMs = this.getLivePositionMs(session, now);
    const wasPlaying = session.playback.isPlaying;
    const from = session.speaker;

    const transfer: PendingTransfer = {
      transferId: input.transferId,
      requestedBy: { deviceId: input.deviceId, instanceId: input.instanceId },
      from,
      to: target,
      frozenPositionMs,
      wasPlaying,
      needsGesture,
      createdAt: now,
      expiresAt: now + transferTtlMs,
    };

    // The old Speaker goes quiet immediately and the needle freezes exactly
    // where it was, so the target can resume without a gap (rules A3 / A9).
    session.playback.positionMs = frozenPositionMs;
    session.playback.positionUpdatedAt = now;
    session.playback.isPlaying = false;
    session.speaker = {
      deviceId: target.deviceId,
      instanceId: target.instanceId,
      deviceName: target.deviceName,
      confirmed: false,
      lastSeenAt: now,
    };
    session.revision += 1;
    await this.writeSession(session);
    await this.storePendingTransfer(userId, transfer);

    await this.publishSessionState(userId, session);

    // Targeted stand-down: the old Speaker alone has to stop now (rule A4).
    if (
      from &&
      (from.deviceId !== target.deviceId || from.instanceId !== target.instanceId)
    ) {
      await publishPlayerEvent(userId, {
        type: "SPEAKER_LOST",
        deviceId: from.deviceId,
        instanceId: from.instanceId,
        newSpeaker: session.speaker,
      });
    }

    await publishPlayerEvent(userId, {
      type: "TRANSFER_OFFER",
      deviceId: target.deviceId,
      instanceId: target.instanceId,
      transferId: transfer.transferId,
      track: session.playback.track,
      positionMs: frozenPositionMs,
      positionUpdatedAt: now,
      isPlaying: wasPlaying,
      expiresAt: transfer.expiresAt,
      needsGesture,
      fromDeviceName: from?.deviceName ?? null,
    });

    return {
      ok: true,
      transferId: transfer.transferId,
      expiresAt: transfer.expiresAt,
      needsGesture,
      target,
      speaker: session.speaker,
    };
  }

  /**
   * The target answering the offer: "I started it there" or "not now".
   *
   * Confirming anchors the session on where the target *actually* started
   * (`positionMs`), which is what keeps the needle honest across the hop.
   */
  async confirmTransfer(
    userId: string,
    input: TransferConfirmInput
  ): Promise<PlayerTransferResult> {
    const session = await this.getSession(userId);
    if (!session) return { ok: false, reason: "NO_SESSION" };

    const transfer = await this.readPendingTransfer(userId);
    if (
      !transfer ||
      transfer.transferId !== input.transferId ||
      transfer.expiresAt <= Date.now()
    ) {
      // The ticket is gone or a different one is in flight: the client must
      // refetch rather than trust its own optimistic start.
      return { ok: false, reason: "STALE_TRANSFER", speaker: session.speaker };
    }

    if (
      transfer.to.deviceId !== input.deviceId ||
      transfer.to.instanceId !== input.instanceId
    ) {
      return { ok: false, reason: "NOT_TARGET", speaker: session.speaker };
    }

    await this.clearPendingTransfer(userId);

    if (!input.ok) {
      await this.revertTransfer(userId, transfer, "DECLINED");
      const reverted = (await this.readSession(userId)) ?? session;
      return { ok: true, transferId: transfer.transferId, speaker: reverted.speaker };
    }

    const now = Date.now();
    const requested = Math.max(0, Math.round(input.positionMs ?? transfer.frozenPositionMs));
    const position =
      session.playback.durationMs > 0
        ? Math.min(requested, session.playback.durationMs)
        : requested;

    session.speaker = {
      deviceId: transfer.to.deviceId,
      instanceId: transfer.to.instanceId,
      deviceName: transfer.to.deviceName,
      confirmed: true,
      lastSeenAt: now,
    };
    session.playback.positionMs = position;
    session.playback.positionUpdatedAt = now;
    session.playback.isPlaying = input.isPlaying ?? transfer.wasPlaying;
    session.revision += 1;
    await this.writeSession(session);
    await this.publishSessionState(userId, session);

    await publishPlayerEvent(userId, {
      type: "TRANSFER_RESULT",
      deviceId: transfer.requestedBy.deviceId,
      instanceId: transfer.requestedBy.instanceId,
      transferId: transfer.transferId,
      ok: true,
      speaker: session.speaker,
      target: transfer.to,
    });

    return {
      ok: true,
      transferId: transfer.transferId,
      target: transfer.to,
      speaker: session.speaker,
    };
  }

  /**
   * Gives an unanswered handshake back: the previous Speaker gets the needle
   * where it was frozen and resumes, so a missed tap never loses the user's
   * place (design doc §6.5 failure paths).
   */
  private async revertTransfer(
    userId: string,
    transfer: PendingTransfer,
    reason: TransferRevertReason,
    options: { resume?: boolean } = {}
  ): Promise<void> {
    const session = await this.readSession(userId);
    if (!session) return;

    // Only ever revert the handshake that is still in flight. If another device
    // took over in the meantime, this ticket is simply stale.
    if (
      !this.isSpeaker(session, transfer.to.deviceId, transfer.to.instanceId) ||
      session.speaker?.confirmed
    ) {
      return;
    }

    await this.clearPendingTransfer(userId);

    const resume = options.resume !== false;
    const now = Date.now();
    const previous = transfer.from;
    const previousStillHere =
      previous &&
      (await this.isDeviceOnline(userId, previous.deviceId, previous.instanceId));

    session.playback.positionMs = transfer.frozenPositionMs;
    session.playback.positionUpdatedAt = now;

    if (previous && previousStillHere) {
      session.speaker = { ...previous, confirmed: true, lastSeenAt: now };
      session.playback.isPlaying = resume && transfer.wasPlaying;
    } else {
      // Nobody to hand it back to: park it where it stopped so any Remote can
      // offer "Play here" (rule B6).
      session.speaker = null;
      session.playback.isPlaying = false;
    }
    session.revision += 1;
    await this.writeSession(session);
    await this.publishSessionState(userId, session);

    // The device getting the role back needs to *act* — it was faded out a
    // moment ago, so a state broadcast alone would leave it silent.
    if (session.speaker && resume) {
      await publishPlayerEvent(userId, {
        type: "SPEAKER_GRANTED",
        deviceId: session.speaker.deviceId,
        instanceId: session.speaker.instanceId,
        track: session.playback.track,
        positionMs: session.playback.positionMs,
        positionUpdatedAt: session.playback.positionUpdatedAt,
        isPlaying: session.playback.isPlaying,
      });
    }

    await publishPlayerEvent(userId, {
      type: "TRANSFER_RESULT",
      deviceId: transfer.requestedBy.deviceId,
      instanceId: transfer.requestedBy.instanceId,
      transferId: transfer.transferId,
      ok: false,
      reason,
      speaker: session.speaker,
      target: transfer.to,
    });
  }

  /**
   * Finishes a handshake that died without an answer. A restart loses the
   * in-process timer, so this is the safety net that keeps a phantom Speaker
   * from living in the session forever (design doc §6.5).
   */
  private async resolveStaleTransfer(
    userId: string,
    session: PlayerSession
  ): Promise<PlayerSession> {
    const speaker = session.speaker;
    if (!speaker || speaker.confirmed) return session;

    const transfer = await this.readPendingTransfer(userId);
    if (transfer && transfer.expiresAt > Date.now()) return session; // still in flight

    if (transfer) await this.revertTransfer(userId, transfer, "TIMEOUT");

    const current = (await this.readSession(userId)) ?? session;
    if (current.speaker && !current.speaker.confirmed) {
      current.speaker = null;
      current.playback.isPlaying = false;
      current.playback.positionUpdatedAt = Date.now();
      current.revision += 1;
      await this.writeSession(current);
      await this.publishSessionState(userId, current);
    }
    return current;
  }

  /** Everything the client needs to render the player and the Devices panel. */
  async getSessionView(
    userId: string,
    viewer: { deviceId?: string | null; instanceId?: string | null } = {}
  ): Promise<PlayerSessionView | null> {
    const read = await this.getSession(userId);
    if (!read) return null;

    // A half-finished handshake left behind by a restart is finished here, so a
    // phantom Speaker can never survive one read (design doc §6.5).
    const session = await this.resolveStaleTransfer(userId, read);

    const now = Date.now();
    const devices = await this.listDevices(userId, session);
    const speakerOnline = session.speaker
      ? devices.some((d) => d.deviceId === session.speaker!.deviceId && d.online)
      : false;
    // An *unconfirmed* Speaker is still just a handshake: it does not own audio
    // yet, so it must not believe it is the Speaker (rule A9).
    const youAreSpeaker =
      session.speaker && session.speaker.confirmed
        ? session.speaker.deviceId === viewer.deviceId &&
          (!viewer.instanceId || session.speaker.instanceId === viewer.instanceId)
        : false;

    return {
      session,
      livePositionMs: this.getLivePositionMs(session, now),
      speakerOnline,
      devices,
      yourInstanceId: viewer.instanceId ?? null,
      youAreSpeaker,
      serverTime: now,
    };
  }
}

/**
 * How long an unconfirmed push may wait for the target — the target has to
 * start audio (or ask for a tap) before the Speaker role really moves
 * (design doc §6.5, rule A9).
 */
let transferTtlMs = TRANSFER_TTL_SECONDS * 1000;

/** In-flight revert timers, keyed by account. */
const transferTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Test hook: shrinks the handshake window so a timeout can be exercised. */
export function setTransferTtlMs(ms: number): void {
  transferTtlMs = ms;
}

export function resetTransferTtlMs(): void {
  transferTtlMs = TRANSFER_TTL_SECONDS * 1000;
}

/** Test helper: drops every pending revert timer. */
export function resetTransferTimers(): void {
  for (const timer of transferTimers.values()) clearTimeout(timer);
  transferTimers.clear();
}

export const playerService = new PlayerService();

let flushTimer: ReturnType<typeof setInterval> | null = null;
let isFlushing = false;

/**
 * Starts the background recurring timer to flush buffered play counts from Redis to PostgreSQL.
 */
export function startPlayCountFlushTimer(intervalMs: number = 30000): void {
  if (flushTimer) return;
  flushTimer = setInterval(async () => {
    if (isFlushing) return;
    isFlushing = true;
    try {
      const count = await playerService.flushPlayCountsToDatabase();
      if (count > 0) {
        console.log(`[PlayerService] Flushed ${count} play increment(s) to database.`);
      }
    } catch (err) {
      console.error("[PlayerService] Failed to flush play counts to database:", err);
    } finally {
      isFlushing = false;
    }
  }, intervalMs);
}

/**
 * Stops the background play count flush timer.
 */
export function stopPlayCountFlushTimer(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}
