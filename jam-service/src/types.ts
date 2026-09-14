export type RoomPrivacy = "PUBLIC" | "FRIENDS_ONLY" | "INVITE_ONLY";

export type PlaybackState = "PLAYING" | "PAUSED" | "BUFFERING" | "ENDED";

export type RoomRole = "HOST" | "LISTENER";

export interface PlayerTrack {
  id: string;
  title: string;
  duration: number; // in seconds
  audioUrl?: string;
  streamUrl?: string;
  artworkUrl?: string | null;
  artistName?: string;
  albumTitle?: string | null;
  addedByUserId?: string;
  addedByDisplayName?: string;
}

export interface RoomMember {
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  role: RoomRole;
  joinedAt: number;
  lastPing: number;
}

export interface JamRoomMeta {
  roomCode: string;
  hostId: string;
  hostName: string;
  privacy: RoomPrivacy;
  allowGuestQueue: boolean;
  playbackState: PlaybackState;
  currentTrack: PlayerTrack | null;
  anchorPositionMs: number;
  anchorServerTime: number;
  createdAt: number;
  lastActivity: number;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
  displayName: string;
  avatarUrl?: string | null;
  tokenVersion: number;
}

// Client -> Server incoming WebSocket message types
export type ClientMessage =
  | { type: "AUTH_HANDSHAKE"; token: string }
  | { type: "SYNC_PING"; clientSendTime: number }
  | {
      type: "ROOM_CREATE";
      privacy?: RoomPrivacy;
      allowGuestQueue?: boolean;
      initialTrack?: PlayerTrack;
      initialPositionMs?: number;
    }
  | { type: "ROOM_JOIN"; roomCode: string }
  | { type: "ROOM_LEAVE" }
  | { type: "HOST_PLAY"; positionMs: number }
  | { type: "HOST_PAUSE"; positionMs: number }
  | { type: "HOST_SEEK"; positionMs: number }
  | {
      type: "HOST_CHANGE_TRACK";
      track: PlayerTrack;
      positionMs?: number;
    }
  | { type: "HOST_TRANSFER"; newHostUserId: string }
  | { type: "QUEUE_ADD"; track: PlayerTrack }
  | { type: "QUEUE_REMOVE"; index: number }
  | { type: "QUEUE_REORDER"; fromIndex: number; toIndex: number };

// Server -> Client outgoing WebSocket message types
export type ServerMessage =
  | { type: "AUTH_SUCCESS"; userId: string; displayName: string }
  | {
      type: "SYNC_PONG";
      clientSendTime: number;
      serverRecvTime: number;
      serverSendTime: number;
    }
  | {
      type: "ROOM_STATE";
      room: JamRoomMeta;
      members: RoomMember[];
      queue: PlayerTrack[];
      isHost: boolean;
    }
  | { type: "MEMBER_JOINED"; member: RoomMember }
  | { type: "MEMBER_LEFT"; userId: string; newHostId?: string }
  | {
      type: "PLAYBACK_STATE_UPDATE";
      playbackState: PlaybackState;
      anchorPositionMs: number;
      anchorServerTime: number;
      currentTrack?: PlayerTrack | null;
    }
  | { type: "QUEUE_UPDATED"; queue: PlayerTrack[] }
  | { type: "HOST_TRANSFER"; newHostId: string; newHostName: string }
  | { type: "ROOM_CLOSED"; reason: string }
  | { type: "ERROR"; code: string; message: string };
