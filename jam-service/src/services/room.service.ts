import { redis, redisKeys, SESSION_TTL_SEC } from "../redis";
import type {
  AuthenticatedUser,
  JamRoomMeta,
  PlayerTrack,
  PlaybackState,
  RoomMember,
  RoomPrivacy,
} from "../types";

const CODE_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function generateCode(): string {
  let slug = "";
  for (let i = 0; i < 4; i++) {
    slug += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
  }
  return `JAM-${slug}`;
}

export class RoomService {
  /**
   * Generates a unique room code.
   */
  private async generateUniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = generateCode();
      const exists = await redis.exists(redisKeys.roomMeta(code));
      if (!exists) return code;
    }
    // Fallback: 6-char slug
    let slug = "";
    for (let i = 0; i < 6; i++) {
      slug += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
    }
    return `JAM-${slug}`;
  }

  /**
   * Creates a new Jam room.
   */
  public async createRoom(
    host: AuthenticatedUser,
    options?: {
      privacy?: RoomPrivacy;
      allowGuestQueue?: boolean;
      initialTrack?: PlayerTrack;
      initialPositionMs?: number;
      friendIds?: string[];
    }
  ): Promise<{ room: JamRoomMeta; hostMember: RoomMember }> {
    const roomCode = await this.generateUniqueCode();
    const now = Date.now();

    const room: JamRoomMeta = {
      roomCode,
      hostId: host.id,
      hostName: host.displayName,
      privacy: options?.privacy || "FRIENDS_ONLY",
      allowGuestQueue: options?.allowGuestQueue ?? true,
      playbackState: options?.initialTrack ? "PLAYING" : "PAUSED",
      currentTrack: options?.initialTrack || null,
      anchorPositionMs: Math.max(0, options?.initialPositionMs ?? 0),
      anchorServerTime: now,
      createdAt: now,
      lastActivity: now,
    };

    const hostMember: RoomMember = {
      userId: host.id,
      displayName: host.displayName,
      avatarUrl: host.avatarUrl || null,
      role: "HOST",
      joinedAt: now,
      lastPing: now,
    };

    const metaKey = redisKeys.roomMeta(roomCode);
    const membersKey = redisKeys.roomMembers(roomCode);
    const queueKey = redisKeys.roomQueue(roomCode);
    const userActiveKey = redisKeys.userActiveRoom(host.id);

    const pipeline = redis.pipeline();

    // Store room metadata in Redis Hash
    pipeline.hset(metaKey, {
      roomCode: room.roomCode,
      hostId: room.hostId,
      hostName: room.hostName,
      privacy: room.privacy,
      allowGuestQueue: room.allowGuestQueue.toString(),
      playbackState: room.playbackState,
      currentTrack: room.currentTrack ? JSON.stringify(room.currentTrack) : "",
      anchorPositionMs: room.anchorPositionMs.toString(),
      anchorServerTime: room.anchorServerTime.toString(),
      createdAt: room.createdAt.toString(),
      lastActivity: room.lastActivity.toString(),
    });
    pipeline.expire(metaKey, SESSION_TTL_SEC);

    // Store host member
    pipeline.hset(membersKey, host.id, JSON.stringify(hostMember));
    pipeline.expire(membersKey, SESSION_TTL_SEC);

    // Set TTL on queue
    pipeline.expire(queueKey, SESSION_TTL_SEC);

    // Set host's active room
    pipeline.set(userActiveKey, roomCode, "EX", SESSION_TTL_SEC);

    // If FRIENDS_ONLY and friendIds provided, store in Redis Set
    if (options?.privacy === "FRIENDS_ONLY" && options.friendIds && options.friendIds.length > 0) {
      const friendsKey = `jam:session:${roomCode}:friends`;
      pipeline.sadd(friendsKey, ...options.friendIds);
      pipeline.expire(friendsKey, SESSION_TTL_SEC);
    }

    await pipeline.exec();

    return { room, hostMember };
  }

  /**
   * Retrieves full room metadata from Redis.
   */
  public async getRoom(roomCode: string): Promise<JamRoomMeta | null> {
    const metaKey = redisKeys.roomMeta(roomCode);
    const raw = await redis.hgetall(metaKey);

    if (!raw || !raw.roomCode) return null;

    let currentTrack: PlayerTrack | null = null;
    if (raw.currentTrack) {
      try {
        currentTrack = JSON.parse(raw.currentTrack);
      } catch {
        currentTrack = null;
      }
    }

    return {
      roomCode: raw.roomCode,
      hostId: raw.hostId,
      hostName: raw.hostName,
      privacy: (raw.privacy as RoomPrivacy) || "FRIENDS_ONLY",
      allowGuestQueue: raw.allowGuestQueue === "true",
      playbackState: (raw.playbackState as PlaybackState) || "PAUSED",
      currentTrack,
      anchorPositionMs: parseInt(raw.anchorPositionMs || "0", 10),
      anchorServerTime: parseInt(raw.anchorServerTime || "0", 10),
      createdAt: parseInt(raw.createdAt || "0", 10),
      lastActivity: parseInt(raw.lastActivity || "0", 10),
    };
  }

  /**
   * Retrieves all members connected to a room.
   */
  public async getMembers(roomCode: string): Promise<RoomMember[]> {
    const membersKey = redisKeys.roomMembers(roomCode);
    const raw = await redis.hgetall(membersKey);
    if (!raw) return [];

    const members: RoomMember[] = [];
    for (const val of Object.values(raw)) {
      try {
        members.push(JSON.parse(val));
      } catch {
        // ignore malformed entries
      }
    }

    // Sort by joinedAt ascending
    return members.sort((a, b) => a.joinedAt - b.joinedAt);
  }

  /**
   * Retrieves the collaborative queue for a room.
   */
  public async getQueue(roomCode: string): Promise<PlayerTrack[]> {
    const queueKey = redisKeys.roomQueue(roomCode);
    const raw = await redis.lrange(queueKey, 0, -1);
    if (!raw || raw.length === 0) return [];

    const tracks: PlayerTrack[] = [];
    for (const item of raw) {
      try {
        tracks.push(JSON.parse(item));
      } catch {
        // ignore
      }
    }
    return tracks;
  }

  /**
   * Adds a user to an existing room.
   */
  public async joinRoom(
    roomCode: string,
    user: AuthenticatedUser
  ): Promise<{
    room: JamRoomMeta;
    members: RoomMember[];
    queue: PlayerTrack[];
    member: RoomMember;
    isHost: boolean;
  }> {
    const room = await this.getRoom(roomCode);
    if (!room) {
      throw new Error("ROOM_NOT_FOUND");
    }

    const isHost = room.hostId === user.id;

    // Privacy Check for non-hosts
    if (!isHost && room.privacy === "FRIENDS_ONLY") {
      const friendsKey = `jam:session:${roomCode.toUpperCase()}:friends`;
      const isExplicitFriend = await redis.sismember(friendsKey, user.id);
      const isGeneralFriend = await redis.sismember(
        redisKeys.userSocialFriends(room.hostId),
        user.id
      );

      // If friends lists are tracked and user is neither, reject
      const hasFriendList = (await redis.exists(friendsKey)) || (await redis.exists(redisKeys.userSocialFriends(room.hostId)));
      if (hasFriendList && !isExplicitFriend && !isGeneralFriend) {
        throw new Error("FRIENDS_ONLY_ROOM");
      }
    }

    const now = Date.now();
    const membersKey = redisKeys.roomMembers(roomCode);

    // Check if user is already in room
    const existingRaw = await redis.hget(membersKey, user.id);
    let member: RoomMember;

    if (existingRaw) {
      try {
        member = JSON.parse(existingRaw);
        member.lastPing = now;
        if (isHost) member.role = "HOST";
      } catch {
        member = {
          userId: user.id,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl || null,
          role: isHost ? "HOST" : "LISTENER",
          joinedAt: now,
          lastPing: now,
        };
      }
    } else {
      member = {
        userId: user.id,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl || null,
        role: isHost ? "HOST" : "LISTENER",
        joinedAt: now,
        lastPing: now,
      };
    }

    const pipeline = redis.pipeline();
    pipeline.hset(membersKey, user.id, JSON.stringify(member));
    pipeline.set(redisKeys.userActiveRoom(user.id), room.roomCode, "EX", SESSION_TTL_SEC);
    pipeline.expire(redisKeys.roomMeta(roomCode), SESSION_TTL_SEC);
    pipeline.expire(membersKey, SESSION_TTL_SEC);
    pipeline.expire(redisKeys.roomQueue(roomCode), SESSION_TTL_SEC);
    await pipeline.exec();

    const members = await this.getMembers(roomCode);
    const queue = await this.getQueue(roomCode);

    return {
      room,
      members,
      queue,
      member,
      isHost,
    };
  }

  /**
   * Removes a user from a room.
   * If host leaves, automatically promotes the next senior member or cleans up empty room.
   */
  public async leaveRoom(
    roomCode: string,
    userId: string
  ): Promise<{
    room: JamRoomMeta | null;
    newHost: RoomMember | null;
    remainingMembers: RoomMember[];
    isRoomClosed: boolean;
  }> {
    const room = await this.getRoom(roomCode);
    if (!room) {
      return { room: null, newHost: null, remainingMembers: [], isRoomClosed: true };
    }

    const membersKey = redisKeys.roomMembers(roomCode);
    await redis.hdel(membersKey, userId);
    await redis.del(redisKeys.userActiveRoom(userId));

    const remainingMembers = await this.getMembers(roomCode);

    // If no members left in the room, mark for cleanup
    if (remainingMembers.length === 0) {
      const pipeline = redis.pipeline();
      pipeline.del(redisKeys.roomMeta(roomCode));
      pipeline.del(membersKey);
      pipeline.del(redisKeys.roomQueue(roomCode));
      pipeline.del(`jam:session:${roomCode.toUpperCase()}:friends`);
      await pipeline.exec();

      return { room: null, newHost: null, remainingMembers: [], isRoomClosed: true };
    }

    let newHost: RoomMember | null = null;

    // If host left, promote the next oldest connected member
    if (room.hostId === userId) {
      const promoted = remainingMembers[0]; // oldest joinedAt
      promoted.role = "HOST";
      newHost = promoted;

      room.hostId = promoted.userId;
      room.hostName = promoted.displayName;

      const pipeline = redis.pipeline();
      pipeline.hset(membersKey, promoted.userId, JSON.stringify(promoted));
      pipeline.hset(redisKeys.roomMeta(roomCode), {
        hostId: promoted.userId,
        hostName: promoted.displayName,
      });
      await pipeline.exec();
    }

    return {
      room,
      newHost,
      remainingMembers,
      isRoomClosed: false,
    };
  }

  /**
   * Updates playback state (host authority).
   */
  public async updatePlaybackState(
    roomCode: string,
    hostId: string,
    update: {
      playbackState?: PlaybackState;
      positionMs: number;
      currentTrack?: PlayerTrack | null;
    }
  ): Promise<JamRoomMeta> {
    const room = await this.getRoom(roomCode);
    if (!room) throw new Error("ROOM_NOT_FOUND");
    if (room.hostId !== hostId) throw new Error("NOT_ROOM_HOST");

    const now = Date.now();
    const metaKey = redisKeys.roomMeta(roomCode);

    const hashUpdates: Record<string, string> = {
      anchorPositionMs: Math.max(0, Math.round(update.positionMs)).toString(),
      anchorServerTime: now.toString(),
      lastActivity: now.toString(),
    };

    if (update.playbackState) {
      hashUpdates.playbackState = update.playbackState;
      room.playbackState = update.playbackState;
    }

    if (update.currentTrack !== undefined) {
      hashUpdates.currentTrack = update.currentTrack
        ? JSON.stringify(update.currentTrack)
        : "";
      room.currentTrack = update.currentTrack;
    }

    room.anchorPositionMs = Math.max(0, Math.round(update.positionMs));
    room.anchorServerTime = now;
    room.lastActivity = now;

    await redis.hset(metaKey, hashUpdates);
    return room;
  }

  /**
   * "Pass the Aux": Transfers host / DJ controller role to another member.
   */
  public async transferHost(
    roomCode: string,
    currentHostId: string,
    newHostUserId: string
  ): Promise<{ room: JamRoomMeta; newHost: RoomMember; oldHost: RoomMember }> {
    const room = await this.getRoom(roomCode);
    if (!room) throw new Error("ROOM_NOT_FOUND");
    if (room.hostId !== currentHostId) throw new Error("NOT_ROOM_HOST");

    const membersKey = redisKeys.roomMembers(roomCode);
    const targetRaw = await redis.hget(membersKey, newHostUserId);
    if (!targetRaw) throw new Error("TARGET_MEMBER_NOT_IN_ROOM");

    const oldHostRaw = await redis.hget(membersKey, currentHostId);
    if (!oldHostRaw) throw new Error("HOST_MEMBER_NOT_FOUND");

    const newHostMember: RoomMember = JSON.parse(targetRaw);
    const oldHostMember: RoomMember = JSON.parse(oldHostRaw);

    newHostMember.role = "HOST";
    oldHostMember.role = "LISTENER";

    room.hostId = newHostMember.userId;
    room.hostName = newHostMember.displayName;

    const pipeline = redis.pipeline();
    pipeline.hset(redisKeys.roomMeta(roomCode), {
      hostId: newHostMember.userId,
      hostName: newHostMember.displayName,
    });
    pipeline.hset(membersKey, newHostMember.userId, JSON.stringify(newHostMember));
    pipeline.hset(membersKey, oldHostMember.userId, JSON.stringify(oldHostMember));
    await pipeline.exec();

    return { room, newHost: newHostMember, oldHost: oldHostMember };
  }

  /**
   * Collaborative Queue: Adds a track to the end of the room queue.
   */
  public async addToQueue(
    roomCode: string,
    track: PlayerTrack,
    addedBy: AuthenticatedUser
  ): Promise<PlayerTrack[]> {
    const room = await this.getRoom(roomCode);
    if (!room) throw new Error("ROOM_NOT_FOUND");

    if (!room.allowGuestQueue && room.hostId !== addedBy.id) {
      throw new Error("GUEST_QUEUE_DISABLED");
    }

    const queueKey = redisKeys.roomQueue(roomCode);
    const trackWithMeta: PlayerTrack = {
      ...track,
      addedByUserId: addedBy.id,
      addedByDisplayName: addedBy.displayName,
    };

    await redis.rpush(queueKey, JSON.stringify(trackWithMeta));
    return this.getQueue(roomCode);
  }

  /**
   * Collaborative Queue: Removes a track at index.
   */
  public async removeFromQueue(
    roomCode: string,
    index: number,
    requestUser: AuthenticatedUser
  ): Promise<PlayerTrack[]> {
    const room = await this.getRoom(roomCode);
    if (!room) throw new Error("ROOM_NOT_FOUND");

    const currentQueue = await this.getQueue(roomCode);
    if (index < 0 || index >= currentQueue.length) {
      return currentQueue;
    }

    const targetTrack = currentQueue[index];
    const isHost = room.hostId === requestUser.id;
    const isAdder = targetTrack.addedByUserId === requestUser.id;

    if (!isHost && !isAdder) {
      throw new Error("NOT_PERMITTED_TO_REMOVE_TRACK");
    }

    currentQueue.splice(index, 1);
    await this.replaceQueue(roomCode, currentQueue);
    return currentQueue;
  }

  /**
   * Collaborative Queue: Reorders tracks (Host only).
   */
  public async reorderQueue(
    roomCode: string,
    fromIndex: number,
    toIndex: number,
    requestUser: AuthenticatedUser
  ): Promise<PlayerTrack[]> {
    const room = await this.getRoom(roomCode);
    if (!room) throw new Error("ROOM_NOT_FOUND");
    if (room.hostId !== requestUser.id) throw new Error("NOT_ROOM_HOST");

    const currentQueue = await this.getQueue(roomCode);
    if (
      fromIndex < 0 ||
      fromIndex >= currentQueue.length ||
      toIndex < 0 ||
      toIndex >= currentQueue.length
    ) {
      return currentQueue;
    }

    const [moved] = currentQueue.splice(fromIndex, 1);
    currentQueue.splice(toIndex, 0, moved);

    await this.replaceQueue(roomCode, currentQueue);
    return currentQueue;
  }

  /**
   * Pops the next track from the queue to play.
   */
  public async popNextTrack(roomCode: string): Promise<PlayerTrack | null> {
    const queueKey = redisKeys.roomQueue(roomCode);
    const raw = await redis.lpop(queueKey);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /**
   * Helper: Overwrites the collaborative queue list.
   */
  private async replaceQueue(roomCode: string, queue: PlayerTrack[]): Promise<void> {
    const queueKey = redisKeys.roomQueue(roomCode);
    const pipeline = redis.pipeline();
    pipeline.del(queueKey);
    if (queue.length > 0) {
      pipeline.rpush(queueKey, ...queue.map((t) => JSON.stringify(t)));
    }
    pipeline.expire(queueKey, SESSION_TTL_SEC);
    await pipeline.exec();
  }

  /**
   * Updates ping timestamp for a member.
   */
  public async touchMember(roomCode: string, userId: string): Promise<void> {
    const membersKey = redisKeys.roomMembers(roomCode);
    const raw = await redis.hget(membersKey, userId);
    if (raw) {
      try {
        const member: RoomMember = JSON.parse(raw);
        member.lastPing = Date.now();
        await redis.hset(membersKey, userId, JSON.stringify(member));
      } catch {
        // ignore
      }
    }
  }
}

export const roomService = new RoomService();
