import { Redis } from "ioredis";
import { config } from "./config";

export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
});

export const redisSub = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
});

redis.on("error", (err) => {
  console.error("❌ Redis Client Error in jam-service:", err);
});

redisSub.on("error", (err) => {
  console.error("❌ Redis Sub Client Error in jam-service:", err);
});

export const SESSION_TTL_SEC = 60 * 60 * 6; // 6 hours
export const HOST_DISCONNECT_GRACE_SEC = 45; // 45s grace period

export const redisKeys = {
  roomMeta: (code: string) => `jam:session:${code.toUpperCase()}:meta`,
  roomMembers: (code: string) => `jam:session:${code.toUpperCase()}:members`,
  roomQueue: (code: string) => `jam:session:${code.toUpperCase()}:queue`,
  userActiveRoom: (userId: string) => `jam:user:${userId}:active_room`,
  roomChannel: (code: string) => `jam:room:${code.toUpperCase()}`,
  userTokenVersion: (userId: string) => `user:${userId}:token_version`,
  userSocialFriends: (userId: string) => `user:${userId}:social:friends`,
};
