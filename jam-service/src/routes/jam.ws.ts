import type { FastifyInstance, FastifyRequest } from "fastify";
import type { WebSocket } from "ws";
import { authenticateToken } from "../services/auth.service";
import { pubsub } from "../services/pubsub.service";
import { roomService } from "../services/room.service";
import type {
  AuthenticatedUser,
  ClientMessage,
  PlayerTrack,
  RoomPrivacy,
  ServerMessage,
} from "../types";

// Pending disconnect timers for host grace period: roomCode -> NodeJS.Timeout
const hostDisconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

export async function jamWebSocketRoutes(fastify: FastifyInstance): Promise<void> {
  // Initialize PubSub service subscriber connection
  await pubsub.initialize();

  fastify.get(
    "/jam/ws",
    { websocket: true },
    async (socket: WebSocket, req: FastifyRequest) => {
      let user: AuthenticatedUser | null = null;
      let currentRoomCode: string | null = null;
      let pubsubHandler: ((msg: ServerMessage) => void) | null = null;

      // Safe message sender
      const send = (msg: ServerMessage) => {
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify(msg));
        }
      };

      const sendError = (code: string, message: string) => {
        send({ type: "ERROR", code, message });
      };

      // Handle Pub/Sub message relay to this specific client
      const setupPubSub = async (roomCode: string) => {
        if (pubsubHandler && currentRoomCode) {
          await pubsub.unsubscribe(currentRoomCode, pubsubHandler);
        }

        pubsubHandler = (msg: ServerMessage) => {
          send(msg);
        };

        await pubsub.subscribe(roomCode, pubsubHandler);
      };

      // 1. Check Handshake Query Parameters (?token=...&roomCode=...)
      const query = req.query as {
        token?: string;
        roomCode?: string;
        displayName?: string;
        avatarUrl?: string;
      };

      if (query.token) {
        user = await authenticateToken(fastify, query.token, {
          displayName: query.displayName,
          avatarUrl: query.avatarUrl,
        });

        if (user) {
          send({
            type: "AUTH_SUCCESS",
            userId: user.id,
            displayName: user.displayName,
          });

          // Auto-join room if roomCode supplied in query
          if (query.roomCode) {
            try {
              // Cancel pending host disconnect timer if this user is the reconnecting host
              const pendingTimer = hostDisconnectTimers.get(query.roomCode.toUpperCase());
              if (pendingTimer) {
                clearTimeout(pendingTimer);
                hostDisconnectTimers.delete(query.roomCode.toUpperCase());
              }

              const joined = await roomService.joinRoom(query.roomCode, user);
              currentRoomCode = joined.room.roomCode;
              await setupPubSub(currentRoomCode);

              send({
                type: "ROOM_STATE",
                room: joined.room,
                members: joined.members,
                queue: joined.queue,
                isHost: joined.isHost,
              });

              // Announce join to room via pubsub
              await pubsub.publish(currentRoomCode, {
                type: "MEMBER_JOINED",
                member: joined.member,
              });
            } catch (err: any) {
              sendError(err.message || "JOIN_FAILED", "Failed to auto-join room");
            }
          }
        } else {
          socket.close(4401, "Unauthorized");
          return;
        }
      }

      // 2. Auth Timeout for connections without token in query (5 seconds)
      const authTimeout = setTimeout(() => {
        if (!user) {
          socket.close(4401, "Auth timeout");
        }
      }, 5000);

      // 3. Incoming Message Dispatcher
      socket.on("message", async (data: Buffer | string) => {
        const recvTime = Date.now();
        let message: ClientMessage;

        try {
          message = JSON.parse(data.toString());
        } catch {
          sendError("INVALID_JSON", "Message must be valid JSON");
          return;
        }

        // Handle In-Band Auth Handshake
        if (message.type === "AUTH_HANDSHAKE") {
          user = await authenticateToken(fastify, message.token);
          if (user) {
            clearTimeout(authTimeout);
            send({
              type: "AUTH_SUCCESS",
              userId: user.id,
              displayName: user.displayName,
            });
          } else {
            socket.close(4401, "Unauthorized");
          }
          return;
        }

        // Ensure user is authenticated for all subsequent actions
        if (!user) {
          sendError("UNAUTHORIZED", "Authentication required");
          return;
        }

        // --- NTP Clock Sync Handler ---
        if (message.type === "SYNC_PING") {
          send({
            type: "SYNC_PONG",
            clientSendTime: message.clientSendTime,
            serverRecvTime: recvTime,
            serverSendTime: Date.now(),
          });
          if (currentRoomCode) {
            roomService.touchMember(currentRoomCode, user.id).catch(() => {});
          }
          return;
        }

        // --- Room Creation ---
        if (message.type === "ROOM_CREATE") {
          try {
            const created = await roomService.createRoom(user, {
              privacy: message.privacy,
              allowGuestQueue: message.allowGuestQueue,
              initialTrack: message.initialTrack,
            });

            currentRoomCode = created.room.roomCode;
            await setupPubSub(currentRoomCode);

            send({
              type: "ROOM_STATE",
              room: created.room,
              members: [created.hostMember],
              queue: [],
              isHost: true,
            });
          } catch (err: any) {
            sendError("CREATE_FAILED", err.message || "Failed to create room");
          }
          return;
        }

        // --- Room Join ---
        if (message.type === "ROOM_JOIN") {
          try {
            const code = message.roomCode.toUpperCase().trim();

            // Cancel host disconnect timer if this user was host
            const pendingTimer = hostDisconnectTimers.get(code);
            if (pendingTimer) {
              clearTimeout(pendingTimer);
              hostDisconnectTimers.delete(code);
            }

            const joined = await roomService.joinRoom(code, user);
            currentRoomCode = joined.room.roomCode;
            await setupPubSub(currentRoomCode);

            send({
              type: "ROOM_STATE",
              room: joined.room,
              members: joined.members,
              queue: joined.queue,
              isHost: joined.isHost,
            });

            await pubsub.publish(currentRoomCode, {
              type: "MEMBER_JOINED",
              member: joined.member,
            });
          } catch (err: any) {
            sendError(err.message || "JOIN_FAILED", "Failed to join room");
          }
          return;
        }

        // --- Room Leave ---
        if (message.type === "ROOM_LEAVE") {
          if (!currentRoomCode) return;

          try {
            const left = await roomService.leaveRoom(currentRoomCode, user.id);
            if (pubsubHandler) {
              await pubsub.unsubscribe(currentRoomCode, pubsubHandler);
              pubsubHandler = null;
            }

            const codeToNotify = currentRoomCode;
            currentRoomCode = null;

            if (left.isRoomClosed) {
              await pubsub.publish(codeToNotify, {
                type: "ROOM_CLOSED",
                reason: "Host left and no members remain",
              });
            } else {
              await pubsub.publish(codeToNotify, {
                type: "MEMBER_LEFT",
                userId: user.id,
                newHostId: left.newHost?.userId,
              });

              if (left.newHost) {
                await pubsub.publish(codeToNotify, {
                  type: "HOST_TRANSFER",
                  newHostId: left.newHost.userId,
                  newHostName: left.newHost.displayName,
                });
              }
            }
          } catch (err: any) {
            sendError("LEAVE_FAILED", err.message || "Failed to leave room");
          }
          return;
        }

        // All subsequent actions require being actively in a room
        if (!currentRoomCode) {
          sendError("NOT_IN_ROOM", "You are not currently in a room");
          return;
        }

        // --- Host Playback: Play ---
        if (message.type === "HOST_PLAY") {
          try {
            const updated = await roomService.updatePlaybackState(
              currentRoomCode,
              user.id,
              {
                playbackState: "PLAYING",
                positionMs: message.positionMs,
              }
            );

            await pubsub.publish(currentRoomCode, {
              type: "PLAYBACK_STATE_UPDATE",
              playbackState: updated.playbackState,
              anchorPositionMs: updated.anchorPositionMs,
              anchorServerTime: updated.anchorServerTime,
              currentTrack: updated.currentTrack,
            });
          } catch (err: any) {
            sendError(err.message || "ACTION_FAILED", "Play failed");
          }
          return;
        }

        // --- Host Playback: Pause ---
        if (message.type === "HOST_PAUSE") {
          try {
            const updated = await roomService.updatePlaybackState(
              currentRoomCode,
              user.id,
              {
                playbackState: "PAUSED",
                positionMs: message.positionMs,
              }
            );

            await pubsub.publish(currentRoomCode, {
              type: "PLAYBACK_STATE_UPDATE",
              playbackState: updated.playbackState,
              anchorPositionMs: updated.anchorPositionMs,
              anchorServerTime: updated.anchorServerTime,
              currentTrack: updated.currentTrack,
            });
          } catch (err: any) {
            sendError(err.message || "ACTION_FAILED", "Pause failed");
          }
          return;
        }

        // --- Host Playback: Seek ---
        if (message.type === "HOST_SEEK") {
          try {
            const updated = await roomService.updatePlaybackState(
              currentRoomCode,
              user.id,
              {
                positionMs: message.positionMs,
              }
            );

            await pubsub.publish(currentRoomCode, {
              type: "PLAYBACK_STATE_UPDATE",
              playbackState: updated.playbackState,
              anchorPositionMs: updated.anchorPositionMs,
              anchorServerTime: updated.anchorServerTime,
              currentTrack: updated.currentTrack,
            });
          } catch (err: any) {
            sendError(err.message || "ACTION_FAILED", "Seek failed");
          }
          return;
        }

        // --- Host Playback: Track Change ---
        if (message.type === "HOST_CHANGE_TRACK") {
          try {
            const updated = await roomService.updatePlaybackState(
              currentRoomCode,
              user.id,
              {
                playbackState: "PLAYING",
                positionMs: message.positionMs ?? 0,
                currentTrack: message.track,
              }
            );

            await pubsub.publish(currentRoomCode, {
              type: "PLAYBACK_STATE_UPDATE",
              playbackState: updated.playbackState,
              anchorPositionMs: updated.anchorPositionMs,
              anchorServerTime: updated.anchorServerTime,
              currentTrack: updated.currentTrack,
            });
          } catch (err: any) {
            sendError(err.message || "ACTION_FAILED", "Track change failed");
          }
          return;
        }

        // --- "Pass the Aux": Transfer Host Role ---
        if (message.type === "HOST_TRANSFER") {
          try {
            const result = await roomService.transferHost(
              currentRoomCode,
              user.id,
              message.newHostUserId
            );

            await pubsub.publish(currentRoomCode, {
              type: "HOST_TRANSFER",
              newHostId: result.newHost.userId,
              newHostName: result.newHost.displayName,
            });
          } catch (err: any) {
            sendError(err.message || "ACTION_FAILED", "Host transfer failed");
          }
          return;
        }

        // --- Collaborative Queue: Add Track ---
        if (message.type === "QUEUE_ADD") {
          try {
            const queue = await roomService.addToQueue(
              currentRoomCode,
              message.track,
              user
            );

            await pubsub.publish(currentRoomCode, {
              type: "QUEUE_UPDATED",
              queue,
            });
          } catch (err: any) {
            sendError(err.message || "ACTION_FAILED", "Failed to add to queue");
          }
          return;
        }

        // --- Collaborative Queue: Remove Track ---
        if (message.type === "QUEUE_REMOVE") {
          try {
            const queue = await roomService.removeFromQueue(
              currentRoomCode,
              message.index,
              user
            );

            await pubsub.publish(currentRoomCode, {
              type: "QUEUE_UPDATED",
              queue,
            });
          } catch (err: any) {
            sendError(err.message || "ACTION_FAILED", "Failed to remove from queue");
          }
          return;
        }

        // --- Collaborative Queue: Reorder ---
        if (message.type === "QUEUE_REORDER") {
          try {
            const queue = await roomService.reorderQueue(
              currentRoomCode,
              message.fromIndex,
              message.toIndex,
              user
            );

            await pubsub.publish(currentRoomCode, {
              type: "QUEUE_UPDATED",
              queue,
            });
          } catch (err: any) {
            sendError(err.message || "ACTION_FAILED", "Failed to reorder queue");
          }
          return;
        }
      });

      // 4. Socket Disconnect / Cleanup Handling
      socket.on("close", async () => {
        clearTimeout(authTimeout);

        if (user && currentRoomCode) {
          const roomCode = currentRoomCode;
          const leavingUserId = user.id;

          if (pubsubHandler) {
            await pubsub.unsubscribe(roomCode, pubsubHandler);
            pubsubHandler = null;
          }

          const room = await roomService.getRoom(roomCode);
          if (!room) return;

          // If leaving user is the Host, start the 45-second Grace Period!
          if (room.hostId === leavingUserId) {
            const timer = setTimeout(async () => {
              hostDisconnectTimers.delete(roomCode);
              // Grace period expired: execute room leave
              const left = await roomService.leaveRoom(roomCode, leavingUserId);
              if (left.isRoomClosed) {
                await pubsub.publish(roomCode, {
                  type: "ROOM_CLOSED",
                  reason: "Host disconnected and grace period expired",
                });
              } else if (left.newHost) {
                await pubsub.publish(roomCode, {
                  type: "MEMBER_LEFT",
                  userId: leavingUserId,
                  newHostId: left.newHost.userId,
                });
                await pubsub.publish(roomCode, {
                  type: "HOST_TRANSFER",
                  newHostId: left.newHost.userId,
                  newHostName: left.newHost.displayName,
                });
              }
            }, 45000);

            hostDisconnectTimers.set(roomCode, timer);
          } else {
            // Listener disconnect: immediate departure
            const left = await roomService.leaveRoom(roomCode, leavingUserId);
            await pubsub.publish(roomCode, {
              type: "MEMBER_LEFT",
              userId: leavingUserId,
              newHostId: left.newHost?.userId,
            });
          }
        }
      });
    }
  );
}
