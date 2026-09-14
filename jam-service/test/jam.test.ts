import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { buildJamApp } from "../src/index";
import { redis } from "../src/redis";
import type { FastifyInstance } from "fastify";
import type { ServerMessage } from "../src/types";

describe("Live Jam Service (Phase 2 & 3)", () => {
  let app: FastifyInstance;
  let serverPort: number;
  let hostToken: string;
  let listenerToken: string;
  const createdRoomCodes: string[] = [];

  const hostUser = {
    sub: "usr_test_host_01",
    email: "host@example.com",
    role: "LISTENER",
    tokenVersion: 1,
  };

  const listenerUser = {
    sub: "usr_test_listener_02",
    email: "listener@example.com",
    role: "LISTENER",
    tokenVersion: 1,
  };

  beforeAll(async () => {
    app = await buildJamApp();
    await app.ready();

    // Start server on dynamic random port
    const address = await app.listen({ port: 0, host: "127.0.0.1" });
    const portMatch = address.match(/:(\d+)$/);
    serverPort = portMatch ? parseInt(portMatch[1], 10) : 4001;

    // Sign tokens
    hostToken = app.jwt.sign(hostUser);
    listenerToken = app.jwt.sign(listenerUser);

    // Set token version in Redis
    await redis.set(`user:${hostUser.sub}:token_version`, "1");
    await redis.set(`user:${listenerUser.sub}:token_version`, "1");
    await redis.set(
      `user:${hostUser.sub}:profile`,
      JSON.stringify({ displayName: "DJ Host", avatarUrl: null })
    );
    await redis.set(
      `user:${listenerUser.sub}:profile`,
      JSON.stringify({ displayName: "Party Listener", avatarUrl: null })
    );
  });

  afterAll(async () => {
    // Cleanup Redis test keys
    for (const code of createdRoomCodes) {
      await redis.del(`jam:session:${code}:meta`);
      await redis.del(`jam:session:${code}:members`);
      await redis.del(`jam:session:${code}:queue`);
      await redis.del(`jam:session:${code}:friends`);
    }
    await redis.del(`user:${hostUser.sub}:token_version`);
    await redis.del(`user:${listenerUser.sub}:token_version`);
    await redis.del(`user:${hostUser.sub}:profile`);
    await redis.del(`user:${listenerUser.sub}:profile`);
    await redis.del(`jam:user:${hostUser.sub}:active_room`);
    await redis.del(`jam:user:${listenerUser.sub}:active_room`);

    await app.close();
  });

  it("1. GET /health returns service status and Redis connectivity", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("ok");
    expect(body.service).toBe("jam-service");
  });

  it("2. WebSocket connection with invalid token is rejected (4401)", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/jam/ws?token=invalid_token`);

    const closePromise = new Promise<{ code: number; reason: string }>((resolve) => {
      ws.onclose = (event) => {
        resolve({ code: event.code, reason: event.reason });
      };
    });

    const result = await closePromise;
    expect(result.code).toBe(4401);
  });

  it("3. WebSocket Handshake & NTP Clock Sync ping/pong", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/jam/ws?token=${hostToken}`);

    const openPromise = new Promise<void>((resolve) => {
      ws.onopen = () => resolve();
    });
    await openPromise;

    // Expect AUTH_SUCCESS
    const authMsg = await new Promise<ServerMessage>((resolve) => {
      ws.onmessage = (event) => {
        resolve(JSON.parse(event.data.toString()));
      };
    });
    expect(authMsg.type).toBe("AUTH_SUCCESS");

    // Send SYNC_PING
    const t1 = Date.now();
    ws.send(JSON.stringify({ type: "SYNC_PING", clientSendTime: t1 }));

    const pongMsg = await new Promise<any>((resolve) => {
      ws.onmessage = (event) => {
        resolve(JSON.parse(event.data.toString()));
      };
    });

    expect(pongMsg.type).toBe("SYNC_PONG");
    expect(pongMsg.clientSendTime).toBe(t1);
    expect(pongMsg.serverRecvTime).toBeGreaterThanOrEqual(t1);
    expect(pongMsg.serverSendTime).toBeGreaterThanOrEqual(pongMsg.serverRecvTime);

    ws.close();
  });

  it("4. Room Creation, Joining, and Member Presence Broadcasting", async () => {
    // Connect Host
    const hostWs = new WebSocket(`ws://127.0.0.1:${serverPort}/jam/ws?token=${hostToken}`);
    await new Promise<void>((r) => (hostWs.onopen = () => r()));

    // Wait for AUTH_SUCCESS
    await new Promise<void>((r) => {
      hostWs.onmessage = () => r();
    });

    // Create Room
    hostWs.send(
      JSON.stringify({
        type: "ROOM_CREATE",
        privacy: "PUBLIC",
        allowGuestQueue: true,
        initialTrack: {
          id: "track_01",
          title: "Midnight City",
          duration: 240,
        },
      })
    );

    const hostRoomState = await new Promise<any>((resolve) => {
      hostWs.onmessage = (event) => {
        const msg = JSON.parse(event.data.toString());
        if (msg.type === "ROOM_STATE") resolve(msg);
      };
    });

    expect(hostRoomState.room.roomCode).toMatch(/^JAM-[A-Z0-9]{4,6}$/);
    expect(hostRoomState.isHost).toBe(true);
    expect(hostRoomState.room.currentTrack.title).toBe("Midnight City");

    const roomCode = hostRoomState.room.roomCode;
    createdRoomCodes.push(roomCode);

    // Setup listener for host to catch MEMBER_JOINED
    const hostMemberJoinedPromise = new Promise<any>((resolve) => {
      hostWs.onmessage = (event) => {
        const msg = JSON.parse(event.data.toString());
        if (msg.type === "MEMBER_JOINED") resolve(msg);
      };
    });

    // Connect Listener
    const listenerWs = new WebSocket(`ws://127.0.0.1:${serverPort}/jam/ws?token=${listenerToken}`);
    await new Promise<void>((r) => (listenerWs.onopen = () => r()));

    // Wait for AUTH_SUCCESS
    await new Promise<void>((r) => {
      listenerWs.onmessage = () => r();
    });

    // Listener Joins Room
    listenerWs.send(JSON.stringify({ type: "ROOM_JOIN", roomCode }));

    const listenerRoomState = await new Promise<any>((resolve) => {
      listenerWs.onmessage = (event) => {
        const msg = JSON.parse(event.data.toString());
        if (msg.type === "ROOM_STATE") resolve(msg);
      };
    });

    expect(listenerRoomState.room.roomCode).toBe(roomCode);
    expect(listenerRoomState.isHost).toBe(false);
    expect(listenerRoomState.members.length).toBe(2);

    // Host should have received MEMBER_JOINED
    const memberJoinedEvent = await hostMemberJoinedPromise;
    expect(memberJoinedEvent.type).toBe("MEMBER_JOINED");
    expect(memberJoinedEvent.member.userId).toBe(listenerUser.sub);

    // 5. Host controls playback: Play & Seek -> Listener receives update
    const listenerPlaybackUpdatePromise = new Promise<any>((resolve) => {
      listenerWs.onmessage = (event) => {
        const msg = JSON.parse(event.data.toString());
        if (msg.type === "PLAYBACK_STATE_UPDATE") resolve(msg);
      };
    });

    hostWs.send(JSON.stringify({ type: "HOST_PLAY", positionMs: 12500 }));

    const update1 = await listenerPlaybackUpdatePromise;
    expect(update1.type).toBe("PLAYBACK_STATE_UPDATE");
    expect(update1.playbackState).toBe("PLAYING");
    expect(update1.anchorPositionMs).toBe(12500);
    expect(update1.anchorServerTime).toBeGreaterThan(0);

    // 6. Collaborative Queue: Listener adds track
    const hostQueueUpdatePromise = new Promise<any>((resolve) => {
      hostWs.onmessage = (event) => {
        const msg = JSON.parse(event.data.toString());
        if (msg.type === "QUEUE_UPDATED") resolve(msg);
      };
    });

    listenerWs.send(
      JSON.stringify({
        type: "QUEUE_ADD",
        track: {
          id: "track_02",
          title: "Get Lucky",
          duration: 248,
        },
      })
    );

    const queueUpdate = await hostQueueUpdatePromise;
    expect(queueUpdate.type).toBe("QUEUE_UPDATED");
    expect(queueUpdate.queue.length).toBe(1);
    expect(queueUpdate.queue[0].title).toBe("Get Lucky");
    expect(queueUpdate.queue[0].addedByUserId).toBe(listenerUser.sub);

    // 7. "Pass the Aux" / Transfer Host: Host transfers role to listener
    const listenerHostTransferPromise = new Promise<any>((resolve) => {
      listenerWs.onmessage = (event) => {
        const msg = JSON.parse(event.data.toString());
        if (msg.type === "HOST_TRANSFER") resolve(msg);
      };
    });

    hostWs.send(
      JSON.stringify({
        type: "HOST_TRANSFER",
        newHostUserId: listenerUser.sub,
      })
    );

    const transferEvent = await listenerHostTransferPromise;
    expect(transferEvent.type).toBe("HOST_TRANSFER");
    expect(transferEvent.newHostId).toBe(listenerUser.sub);

    // 8. Collaborative Queue: Reorder and Remove
    const hostQueueReorderPromise = new Promise<any>((resolve) => {
      hostWs.onmessage = (event) => {
        const msg = JSON.parse(event.data.toString());
        if (msg.type === "QUEUE_UPDATED") resolve(msg);
      };
    });

    // New host (listenerUser) adds another track
    listenerWs.send(
      JSON.stringify({
        type: "QUEUE_ADD",
        track: {
          id: "track_03",
          title: "One More Time",
          duration: 320,
        },
      })
    );
    await hostQueueReorderPromise;

    // Remove track at index 0
    const queueRemovePromise = new Promise<any>((resolve) => {
      hostWs.onmessage = (event) => {
        const msg = JSON.parse(event.data.toString());
        if (msg.type === "QUEUE_UPDATED") resolve(msg);
      };
    });

    listenerWs.send(
      JSON.stringify({
        type: "QUEUE_REMOVE",
        index: 0,
      })
    );

    const afterRemove = await queueRemovePromise;
    expect(afterRemove.type).toBe("QUEUE_UPDATED");
    expect(afterRemove.queue.length).toBe(1);
    expect(afterRemove.queue[0].title).toBe("One More Time");

    // 9. Graceful Room Leave
    const memberLeftPromise = new Promise<any>((resolve) => {
      listenerWs.onmessage = (event) => {
        const msg = JSON.parse(event.data.toString());
        if (msg.type === "MEMBER_LEFT") resolve(msg);
      };
    });

    hostWs.send(JSON.stringify({ type: "ROOM_LEAVE" }));
    const leftEvent = await memberLeftPromise;
    expect(leftEvent.type).toBe("MEMBER_LEFT");
    expect(leftEvent.userId).toBe(hostUser.sub);

    // Close connections
    hostWs.close();
    listenerWs.close();
  });
});
