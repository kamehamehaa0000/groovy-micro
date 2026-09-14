export type RoomPrivacy = "PUBLIC" | "FRIENDS_ONLY" | "INVITE_ONLY";

export type JamPlaybackState = "PLAYING" | "PAUSED" | "BUFFERING" | "ENDED";

export type RoomRole = "HOST" | "LISTENER";

export type JamSyncStatus = "syncing" | "synced" | "drift_correcting" | "disconnected";

export interface JamTrack {
  id: string;
  title: string;
  duration: number; // in seconds
  audioUrl?: string | null;
  artworkUrl?: string | null;
  artistId?: string;
  artistName?: string;
  artistSlug?: string;
  albumId?: string | null;
  albumTitle?: string | null;
  albumSlug?: string | null;
  hlsManifestUrl?: string | null;
  rawAudioKey?: string | null;
  addedByUserId?: string;
  addedByDisplayName?: string;
}

export interface JamMember {
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
  playbackState: JamPlaybackState;
  currentTrack: JamTrack | null;
  anchorPositionMs: number;
  anchorServerTime: number;
  createdAt: number;
  lastActivity: number;
}

// Client -> Server outgoing messages
export type ClientMessage =
  | { type: "AUTH_HANDSHAKE"; token: string }
  | { type: "SYNC_PING"; clientSendTime: number }
  | {
      type: "ROOM_CREATE";
      privacy?: RoomPrivacy;
      allowGuestQueue?: boolean;
      initialTrack?: JamTrack;
      friendIds?: string[];
    }
  | { type: "ROOM_JOIN"; roomCode: string }
  | { type: "ROOM_LEAVE" }
  | { type: "HOST_PLAY"; positionMs: number }
  | { type: "HOST_PAUSE"; positionMs: number }
  | { type: "HOST_SEEK"; positionMs: number }
  | {
      type: "HOST_CHANGE_TRACK";
      track: JamTrack;
      positionMs?: number;
    }
  | { type: "HOST_TRANSFER"; newHostUserId: string }
  | { type: "QUEUE_ADD"; track: JamTrack }
  | { type: "QUEUE_REMOVE"; index: number }
  | { type: "QUEUE_REORDER"; fromIndex: number; toIndex: number };

// Server -> Client incoming messages
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
      members: JamMember[];
      queue: JamTrack[];
      isHost: boolean;
    }
  | { type: "MEMBER_JOINED"; member: JamMember }
  | { type: "MEMBER_LEFT"; userId: string; newHostId?: string }
  | {
      type: "PLAYBACK_STATE_UPDATE";
      playbackState: JamPlaybackState;
      anchorPositionMs: number;
      anchorServerTime: number;
      currentTrack?: JamTrack | null;
    }
  | { type: "QUEUE_UPDATED"; queue: JamTrack[] }
  | { type: "HOST_TRANSFER"; newHostId: string; newHostName: string }
  | { type: "ROOM_CLOSED"; reason: string }
  | { type: "ERROR"; code: string; message: string };
