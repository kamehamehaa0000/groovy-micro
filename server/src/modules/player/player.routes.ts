import type { FastifyPluginAsync } from "fastify";
import { PlayerService } from "./player.service";
import { requireAuth, optionalAuth } from "../auth/auth.guards";
import { redis } from "../../db/redis";
import { cacheKeys } from "../../lib/cache/keys";
import {
  openPlayerStream,
  closePlayerStream,
  playerStreamKey,
} from "./player.events";
import {
  savePlayerStateSchema,
  playerHeartbeatSchema,
  telemetryPlaySchema,
  registerDeviceSchema,
  presenceSchema,
  sessionPositionSchema,
  leaveSpeakerSchema,
  sessionCommandSchema,
  sessionTransferSchema,
  transferConfirmSchema,
} from "./player.schemas";

const playerService = new PlayerService();

export const playerRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /state
   * Retrieves authenticated user's current playback state snapshot (<1ms).
   */
  fastify.get(
    "/state",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const state = await playerService.getPlayerState(request.user.id);
      return reply.status(200).send({ state });
    }
  );

  /**
   * PUT /state
   * Debounced cross-device playback state snapshot sync.
   */
  fastify.put(
    "/state",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parseResult = savePlayerStateSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid player state format",
          errors: parseResult.error.flatten().fieldErrors,
        });
      }

      const snapshot = await playerService.savePlayerState(
        request.user.id,
        parseResult.data
      );

      return reply.status(200).send({
        success: true,
        state: snapshot,
      });
    }
  );

  /**
   * POST /heartbeat
   * Regular playback pulse (every 15s) enforcing single-device takeover (Option A)
   * and publishing live presence.
   */
  fastify.post(
    "/heartbeat",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parseResult = playerHeartbeatSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid heartbeat payload",
          errors: parseResult.error.flatten().fieldErrors,
        });
      }

      const result = await playerService.recordHeartbeat(
        request.user.id,
        parseResult.data
      );

      return reply.status(200).send(result);
    }
  );

  /**
   * GET /active-device
   * Retrieves current active device playing session.
   */
  fastify.get(
    "/active-device",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const session = await playerService.getActiveDevice(request.user.id);
      return reply.status(200).send({ activeDevice: session });
    }
  );

  /**
   * POST /telemetry/play
   * Records qualified play count after 30 seconds of playback.
   */
  fastify.post(
    "/telemetry/play",
    { preHandler: [optionalAuth] },
    async (request, reply) => {
      const parseResult = telemetryPlaySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid telemetry payload",
          errors: parseResult.error.flatten().fieldErrors,
        });
      }

      const userId = request.user?.id || null;
      const result = await playerService.recordPlayTelemetry(
        userId,
        parseResult.data
      );

      return reply.status(200).send(result);
    }
  );

  /**
   * GET /history/recent
   * Retrieves authenticated user's recent listening history.
   */
  fastify.get(
    "/history/recent",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const history = await playerService.getRecentHistory(request.user.id);
      return reply.status(200).send({ history });
    }
  );

  /**
   * GET /history
   * Retrieves paginated chronological listening history for the authenticated user.
   */
  fastify.get(
    "/history",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const query = request.query as {
        cursor?: string;
        limit?: string;
        filter?: "all" | "completed" | "personal";
      };

      const limit = query.limit ? parseInt(query.limit, 10) : 50;
      const history = await playerService.getHistory(request.user.id, {
        cursor: query.cursor,
        limit,
        filter: query.filter,
      });

      return reply.status(200).send(history);
    }
  );

  /**
   * GET /friends-activity
   * Retrieves live playback presence for mutual friends and followed users.
   */
  fastify.get(
    "/friends-activity",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const activities = await playerService.getFriendsActivity(request.user.id);
      return reply.status(200).send({ activities });
    }
  );

  /* ────────────────────────────────────────────────────────────────────────
   * Groovy Connect — Listen Session & devices
   * See docs/CROSS_DEVICE_PLAYBACK_DESIGN.md §6.
   * ──────────────────────────────────────────────────────────────────────── */

  /**
   * GET /session
   * The account's Listen Session plus the live needle and the device list.
   */
  fastify.get(
    "/session",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const query = request.query as { deviceId?: string; instanceId?: string };
      const view = await playerService.getSessionView(request.user.id, {
        deviceId: query.deviceId ?? null,
        instanceId: query.instanceId ?? null,
      });
      // `devices` is returned alongside the session because the Devices panel
      // must work for an account that has never played anything.
      const devices =
        view?.devices ?? (await playerService.listDevices(request.user.id, null));
      return reply.status(200).send({ session: view, devices });
    }
  );

  /**
   * POST /devices/register
   * Called when the app opens: puts this tab in the device list and returns the
   * current session so the client can render immediately.
   */
  fastify.post(
    "/devices/register",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parseResult = registerDeviceSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid device registration payload",
          errors: parseResult.error.flatten().fieldErrors,
        });
      }

      const { deviceId, deviceName, instanceId, platform, unlocked } = parseResult.data;

      await playerService.recordDevicePresence(request.user.id, {
        deviceId,
        instanceId,
        deviceName,
        platform,
        unlocked,
      });

      const view = await playerService.getSessionView(request.user.id, {
        deviceId,
        instanceId,
      });
      const devices =
        view?.devices ?? (await playerService.listDevices(request.user.id, null));

      return reply.status(200).send({ session: view, devices });
    }
  );

  /**
   * POST /presence
   * Lightweight 30s liveness ping that runs whether or not audio is playing,
   * so a paused device stays visible in the Devices panel.
   */
  fastify.post(
    "/presence",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parseResult = presenceSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid presence payload",
          errors: parseResult.error.flatten().fieldErrors,
        });
      }

      const { deviceId, instanceId, unlocked } = parseResult.data;
      await playerService.recordDevicePresence(request.user.id, {
        deviceId,
        instanceId,
        unlocked,
      });

      const devices = await playerService.listDevices(request.user.id);
      return reply.status(200).send({ devices });
    }
  );

  /**
   * GET /devices
   * The Devices panel: every registered device with online + Speaker state.
   */
  fastify.get(
    "/devices",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const session = await playerService.getSession(request.user.id);
      const devices = await playerService.listDevices(request.user.id, session);
      return reply.status(200).send({ devices });
    }
  );

  /**
   * DELETE /devices/:deviceId
   * Forgets a device from the registry and the liveness set.
   */
  fastify.delete(
    "/devices/:deviceId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { deviceId } = request.params as { deviceId: string };
      await playerService.forgetDevice(request.user.id, deviceId);
      return reply.status(200).send({ success: true });
    }
  );

  /**
   * POST /session/position
   * The Speaker's needle tick (~10s while playing). Re-stamps the anchor on the
   * server clock so Remotes interpolate without cross-device drift.
   */
  fastify.post(
    "/session/position",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parseResult = sessionPositionSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid position payload",
          errors: parseResult.error.flatten().fieldErrors,
        });
      }

      const { deviceId, instanceId, positionMs, isPlaying } = parseResult.data;
      const result = await playerService.updateSpeakerPosition(request.user.id, {
        deviceId,
        instanceId,
        positionMs,
        isPlaying,
      });

      // When this tab is no longer the Speaker, hand back who took over so the
      // loser can step down immediately instead of playing on (rules A4 / C1).
      return reply
        .status(200)
        .send({ updated: result.updated, speaker: result.session?.speaker ?? null });
    }
  );

  /**
   * POST /session/command
   * A Remote asking the session's Speaker to do something (rule B1).
   *
   * Play/pause/seek are applied by the server so every device agrees on the new
   * needle immediately; everything else is relayed to the Speaker, which owns
   * the queue. Expected refusals (no Speaker, Speaker offline, you *are* the
   * Speaker) come back as 200 + `{ ok: false, reason }` so the client has a
   * single code path; only a malformed body is a 400, and joining a Live Jam is
   * a 409 because that is a genuinely conflicting state (rule B9).
   */
  fastify.post(
    "/session/command",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parseResult = sessionCommandSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid command payload",
          errors: parseResult.error.flatten().fieldErrors,
        });
      }

      const result = await playerService.sendCommand(
        request.user.id,
        parseResult.data
      );

      return reply.status(200).send(result);
    }
  );

  /**
   * POST /session/transfer
   * "Play on {device}" — the one transfer that needs a handshake.
   *
   * The server mutes the old Speaker immediately and offers the playback to the
   * target; the role only really moves when the target confirms. "Play here"
   * (the pull direction) deliberately does **not** come through here: the tab
   * that taps *is* the target, so the tap is both the gesture and the consent,
   * and `POST /heartbeat { takeover: true }` already claims the role in one hop
   * (rule A2 / B7).
   *
   * Expected refusals ("that device isn't available", "nothing is playing") come
   * back as 200 + `{ ok: false, reason }` so the client has one code path; only a
   * stale revision is a genuine conflict, so it is a 409.
   */
  fastify.post(
    "/session/transfer",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parseResult = sessionTransferSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid transfer payload",
          errors: parseResult.error.flatten().fieldErrors,
        });
      }

      const result = await playerService.requestTransfer(
        request.user.id,
        parseResult.data
      );

      if (!result.ok && result.reason === "STALE_STATE") {
        return reply.status(409).send(result);
      }

      return reply.status(200).send(result);
    }
  );

  /**
   * POST /session/transfer/confirm
   * The target answering an offer: it started playing (with where and whether),
   * or it declined and the needle goes back to the previous Speaker (rule A9).
   */
  fastify.post(
    "/session/transfer/confirm",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parseResult = transferConfirmSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid transfer confirmation payload",
          errors: parseResult.error.flatten().fieldErrors,
        });
      }

      const result = await playerService.confirmTransfer(
        request.user.id,
        parseResult.data
      );

      if (!result.ok && result.reason === "STALE_TRANSFER") {
        return reply.status(409).send(result);
      }

      return reply.status(200).send(result);
    }
  );

  /**
   * POST /session/speaker/leave
   * Sent via `navigator.sendBeacon` when the Speaker tab closes, so the role is
   * released immediately instead of waiting for a TTL (rule R7).
   */
  fastify.post(
    "/session/speaker/leave",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parseResult = leaveSpeakerSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid leave payload",
          errors: parseResult.error.flatten().fieldErrors,
        });
      }

      const { deviceId, instanceId } = parseResult.data;
      const result = await playerService.releaseSpeaker(request.user.id, {
        deviceId,
        instanceId,
      });

      return reply.status(200).send({ released: result.released });
    }
  );

  /**
   * GET /session/events
   * Server-Sent Events stream of Listen Session changes.
   *
   * One channel per account, fanned out to every device on it. This is what
   * turns "the other device finds out within 10s" into "within ~1s", and it is
   * how a Speaker whose stream drops makes the session stand down promptly.
   *
   * The stream is server → client only: every action stays a plain POST, so a
   * dropped stream degrades to slower rather than broken (design doc §6).
   */
  fastify.get(
    "/session/events",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const userId = request.user.id;
      const query = request.query as { deviceId?: string; instanceId?: string };
      const deviceId = query.deviceId ?? "";
      const instanceId = query.instanceId || deviceId || "";
      const channelName = cacheKeys.player.events(userId);

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
        "Access-Control-Allow-Origin": request.headers.origin || "*",
        "Access-Control-Allow-Credentials": "true",
      });

      // `hello` is a full resync. Because it carries the whole session view, a
      // client never has to reason about events it missed while offline: it
      // simply replaces what it knows (design doc §6).
      const view = await playerService.getSessionView(userId, {
        deviceId: deviceId || null,
        instanceId: instanceId || null,
      });
      const devices =
        view?.devices ?? (await playerService.listDevices(userId, null));
      reply.raw.write(
        `data: ${JSON.stringify({
          type: "hello",
          session: view,
          devices,
          yourInstanceId: instanceId || null,
          serverTime: Date.now(),
        })}\n\n`
      );

      const sub = redis.duplicate();
      await sub.connect().catch((err) => {
        console.warn("[PlayerRoutes] Redis subscriber connect deferred:", err);
      });
      await sub.subscribe(channelName, (err) => {
        if (err) {
          console.error(
            `[PlayerRoutes] Failed to subscribe to channel ${channelName}:`,
            err
          );
        }
      });

      sub.on("message", (channel, message) => {
        if (channel === channelName) reply.raw.write(`data: ${message}\n\n`);
      });

      const trackable = deviceId.length > 0;
      const streamKey = trackable
        ? playerStreamKey(userId, deviceId, instanceId)
        : "";

      // While the stream is open the server refreshes this device's liveness on
      // its behalf, so a backgrounded Speaker is never mistaken for a gone one.
      let liveness: ReturnType<typeof setInterval> | null = null;
      if (trackable) {
        openPlayerStream(streamKey);
        liveness = setInterval(() => {
          playerService
            .touchDevicePresence(userId, deviceId, instanceId)
            .catch(() => {});
        }, 30_000);
      }

      const pingInterval = setInterval(() => {
        reply.raw.write(": ping\n\n");
      }, 25_000);

      request.raw.on("close", () => {
        clearInterval(pingInterval);
        if (liveness) clearInterval(liveness);
        sub.unsubscribe(channelName).catch(() => {});
        sub.quit().catch(() => {});

        // The grace period is what makes a reload seamless: returning within it
        // cancels the timer, going away for good stands the session down so any
        // Remote can offer "Play here" (design doc failure table / rule R7).
        if (trackable) {
          closePlayerStream(streamKey, () => {
            playerService
              .detachSpeakerOnDisconnect(userId, deviceId, instanceId)
              .catch(() => {});
          });
        }
      });
    }
  );
};
