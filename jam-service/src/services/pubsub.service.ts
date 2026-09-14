import { redis, redisSub, redisKeys } from "../redis";
import type { ServerMessage } from "../types";

type MessageHandler = (message: ServerMessage) => void;

class PubSubService {
  private roomSubscriptions = new Map<string, Set<MessageHandler>>();
  private isSubClientInitialized = false;

  public async initialize(): Promise<void> {
    if (this.isSubClientInitialized) return;

    await redisSub.connect().catch(() => {});

    redisSub.on("message", (channel: string, payloadStr: string) => {
      // Channel pattern: jam:room:<ROOM_CODE>
      const parts = channel.split(":");
      const roomCode = parts[parts.length - 1];

      const handlers = this.roomSubscriptions.get(roomCode);
      if (!handlers || handlers.size === 0) return;

      try {
        const message = JSON.parse(payloadStr) as ServerMessage;
        for (const handler of handlers) {
          try {
            handler(message);
          } catch (err) {
            console.error(`Error in pubsub message handler for room ${roomCode}:`, err);
          }
        }
      } catch (err) {
        console.error(`Failed to parse PubSub message on channel ${channel}:`, err);
      }
    });

    this.isSubClientInitialized = true;
  }

  /**
   * Subscribe a local connection listener to a room's Redis Pub/Sub channel.
   */
  public async subscribe(roomCode: string, handler: MessageHandler): Promise<void> {
    const code = roomCode.toUpperCase();
    let handlers = this.roomSubscriptions.get(code);

    if (!handlers) {
      handlers = new Set();
      this.roomSubscriptions.set(code, handlers);
      const channel = redisKeys.roomChannel(code);
      await redisSub.subscribe(channel);
    }

    handlers.add(handler);
  }

  /**
   * Unsubscribe a local connection listener from a room's channel.
   */
  public async unsubscribe(roomCode: string, handler: MessageHandler): Promise<void> {
    const code = roomCode.toUpperCase();
    const handlers = this.roomSubscriptions.get(code);
    if (!handlers) return;

    handlers.delete(handler);

    if (handlers.size === 0) {
      this.roomSubscriptions.delete(code);
      const channel = redisKeys.roomChannel(code);
      await redisSub.unsubscribe(channel).catch(() => {});
    }
  }

  /**
   * Broadcast an event to all nodes subscribed to this room channel.
   */
  public async publish(roomCode: string, message: ServerMessage): Promise<void> {
    const code = roomCode.toUpperCase();
    const channel = redisKeys.roomChannel(code);
    await redis.publish(channel, JSON.stringify(message));
  }
}

export const pubsub = new PubSubService();
