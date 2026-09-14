import { create } from "zustand";
import { useAuthStore } from "./auth.store";
import { usePlayerStore } from "./player.store";
import type {
  JamMember,
  JamRoomMeta,
  JamSyncStatus,
  JamTrack,
  RoomPrivacy,
  ServerMessage,
} from "../types/jam";
import type { PlayerTrack } from "../types/player";

function getWsUrl(): string {
  if (import.meta.env.VITE_JAM_WS_URL) {
    return import.meta.env.VITE_JAM_WS_URL;
  }
  const isSecure = window.location.protocol === "https:";
  const protocol = isSecure ? "wss:" : "ws:";
  const host = window.location.hostname || "localhost";
  return `${protocol}//${host}:4001/jam/ws`;
}

interface JamStoreState {
  ws: WebSocket | null;
  isConnected: boolean;
  activeRoom: JamRoomMeta | null;
  isHost: boolean;
  members: JamMember[];
  jamQueue: JamTrack[];
  syncStatus: JamSyncStatus;
  clockOffsetMs: number;
  rttMs: number;
  errorMessage: string | null;
  isModalOpen: boolean;
  needsGesture: boolean;

  // Actions
  openModal: () => void;
  closeModal: () => void;
  connect: () => Promise<WebSocket>;
  disconnect: () => void;
  syncClock: () => Promise<void>;
  reconnectActiveRoom: () => Promise<void>;

  createRoom: (privacy?: RoomPrivacy, allowGuestQueue?: boolean) => Promise<string>;
  joinRoom: (roomCode: string) => Promise<void>;
  leaveRoom: () => void;

  // Host Playback Broadcasts
  broadcastPlay: (positionMs: number) => void;
  broadcastPause: (positionMs: number) => void;
  broadcastSeek: (positionMs: number) => void;
  broadcastTrackChange: (track: JamTrack, positionMs?: number) => void;
  transferHost: (newHostUserId: string) => void;

  // Queue Operations
  addToJamQueue: (track: JamTrack) => void;
  removeFromJamQueue: (index: number) => void;
  reorderJamQueue: (fromIndex: number, toIndex: number) => void;

  // Internal setters
  setSyncStatus: (status: JamSyncStatus) => void;
  setNeedsGesture: (needsGesture: boolean) => void;
  _handleServerMessage: (msg: ServerMessage) => void;
}

let syncInterval: ReturnType<typeof setInterval> | null = null;

export const useJamStore = create<JamStoreState>((set, get) => ({
  ws: null,
  isConnected: false,
  activeRoom: null,
  isHost: false,
  members: [],
  jamQueue: [],
  syncStatus: "disconnected",
  clockOffsetMs: 0,
  rttMs: 0,
  errorMessage: null,
  isModalOpen: false,
  needsGesture: false,

  openModal: () => set({ isModalOpen: true }),
  closeModal: () => set({ isModalOpen: false, errorMessage: null }),

  setSyncStatus: (syncStatus) => set({ syncStatus }),
  setNeedsGesture: (needsGesture) => set({ needsGesture }),

  connect: async () => {
    const existingWs = get().ws;
    if (existingWs && existingWs.readyState === WebSocket.OPEN) {
      return existingWs;
    }

    const token = useAuthStore.getState().accessToken;
    const user = useAuthStore.getState().user;

    const baseWsUrl = getWsUrl();
    const url = new URL(baseWsUrl);
    if (token) url.searchParams.set("token", token);
    if (user?.displayName) url.searchParams.set("displayName", user.displayName);
    if (user?.avatarUrl) url.searchParams.set("avatarUrl", user.avatarUrl);

    const ws = new WebSocket(url.toString());

    return new Promise<WebSocket>((resolve, reject) => {
      ws.onopen = () => {
        set({ ws, isConnected: true, errorMessage: null });
        get().syncClock();

        // Periodic clock sync every 45s
        if (syncInterval) clearInterval(syncInterval);
        syncInterval = setInterval(() => {
          if (get().isConnected) get().syncClock();
        }, 45000);

        resolve(ws);
      };

      ws.onerror = (err) => {
        console.error("[JamWS] WebSocket error:", err);
        set({ isConnected: false, syncStatus: "disconnected" });
        reject(err);
      };

      ws.onclose = () => {
        set({
          ws: null,
          isConnected: false,
          syncStatus: "disconnected",
        });
        if (syncInterval) clearInterval(syncInterval);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data.toString()) as ServerMessage;
          get()._handleServerMessage(msg);
        } catch (err) {
          console.error("[JamWS] Failed to parse message:", err);
        }
      };
    });
  },

  disconnect: () => {
    const ws = get().ws;
    if (ws) ws.close();
    if (syncInterval) clearInterval(syncInterval);
    set({
      ws: null,
      isConnected: false,
      activeRoom: null,
      isHost: false,
      members: [],
      jamQueue: [],
      syncStatus: "disconnected",
    });
  },

  syncClock: async () => {
    const ws = get().ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    // Send 3 fast pings and average offset
    const offsets: number[] = [];
    const rtts: number[] = [];

    const sendPing = () =>
      new Promise<void>((resolve) => {
        const t1 = Date.now();
        const handler = (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data.toString());
            if (data.type === "SYNC_PONG" && data.clientSendTime === t1) {
              const t4 = Date.now();
              const t2 = data.serverRecvTime;
              const t3 = data.serverSendTime;

              const rtt = t4 - t1 - (t3 - t2);
              const offset = (t2 - t1 + (t3 - t4)) / 2;

              rtts.push(rtt);
              offsets.push(offset);
              ws.removeEventListener("message", handler);
              resolve();
            }
          } catch {
            ws.removeEventListener("message", handler);
            resolve();
          }
        };

        ws.addEventListener("message", handler);
        ws.send(JSON.stringify({ type: "SYNC_PING", clientSendTime: t1 }));
      });

    await sendPing();
    await new Promise((r) => setTimeout(r, 50));
    await sendPing();

    if (offsets.length > 0) {
      const avgOffset = offsets.reduce((a, b) => a + b, 0) / offsets.length;
      const avgRtt = rtts.reduce((a, b) => a + b, 0) / rtts.length;
      set({ clockOffsetMs: avgOffset, rttMs: avgRtt, syncStatus: "synced" });
    }
  },

  reconnectActiveRoom: async () => {
    try {
      const savedCode = localStorage.getItem("groovy:jam:active_room_code");
      if (!savedCode) return;

      const current = get().activeRoom;
      if (current && current.roomCode.toUpperCase() === savedCode.toUpperCase()) {
        return;
      }

      await get().joinRoom(savedCode);
    } catch (err) {
      console.warn("[JamStore] Failed to reconnect active room, clearing saved session:", err);
      try {
        localStorage.removeItem("groovy:jam:active_room_code");
      } catch {}
    }
  },

  createRoom: async (privacy = "FRIENDS_ONLY", allowGuestQueue = true) => {
    const ws = await get().connect();
    const currentTrack = usePlayerStore.getState().currentTrack;
    const currentTime = usePlayerStore.getState().currentTime;

    let initialTrack: JamTrack | undefined;
    if (currentTrack) {
      initialTrack = {
        id: currentTrack.id,
        title: currentTrack.title,
        duration: currentTrack.durationSeconds || 0,
        artworkUrl: currentTrack.coverImageUrl,
        artistId: currentTrack.artistId,
        artistName: currentTrack.artistName,
        artistSlug: currentTrack.artistSlug,
        albumId: currentTrack.albumId,
        albumTitle: currentTrack.albumTitle,
        albumSlug: currentTrack.albumSlug,
        audioUrl: currentTrack.audioUrl,
        hlsManifestUrl: currentTrack.hlsManifestUrl,
        rawAudioKey: currentTrack.rawAudioKey,
      };
    }

    return new Promise<string>((resolve, reject) => {
      const handler = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data.toString());
          if (msg.type === "ROOM_STATE") {
            ws.removeEventListener("message", handler);
            try {
              localStorage.setItem("groovy:jam:active_room_code", msg.room.roomCode);
            } catch {}
            resolve(msg.room.roomCode);
          } else if (msg.type === "ERROR") {
            ws.removeEventListener("message", handler);
            reject(new Error(msg.message));
          }
        } catch {
          // ignore
        }
      };

      ws.addEventListener("message", handler);
      ws.send(
        JSON.stringify({
          type: "ROOM_CREATE",
          privacy,
          allowGuestQueue,
          initialTrack,
          initialPositionMs: Math.floor(currentTime * 1000),
        })
      );
    });
  },

  joinRoom: async (roomCode: string) => {
    const code = roomCode.toUpperCase().trim();
    const { activeRoom, ws: currentWs } = get();

    if (activeRoom && activeRoom.roomCode.toUpperCase() === code && currentWs?.readyState === WebSocket.OPEN) {
      return;
    }

    const ws = await get().connect();

    return new Promise<void>((resolve, reject) => {
      const handler = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data.toString());
          if (msg.type === "ROOM_STATE") {
            ws.removeEventListener("message", handler);
            try {
              localStorage.setItem("groovy:jam:active_room_code", code);
            } catch {}
            resolve();
          } else if (msg.type === "ERROR") {
            ws.removeEventListener("message", handler);
            try {
              localStorage.removeItem("groovy:jam:active_room_code");
            } catch {}
            reject(new Error(msg.message));
          }
        } catch {
          // ignore
        }
      };

      ws.addEventListener("message", handler);
      ws.send(JSON.stringify({ type: "ROOM_JOIN", roomCode: code }));
    });
  },

  leaveRoom: () => {
    const ws = get().ws;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "ROOM_LEAVE" }));
    }
    try {
      localStorage.removeItem("groovy:jam:active_room_code");
    } catch {}
    set({
      activeRoom: null,
      isHost: false,
      members: [],
      jamQueue: [],
      syncStatus: "disconnected",
      needsGesture: false,
    });
  },

  broadcastPlay: (positionMs: number) => {
    const { ws, isHost, activeRoom } = get();
    if (!ws || !isHost || !activeRoom) return;
    ws.send(JSON.stringify({ type: "HOST_PLAY", positionMs }));
  },

  broadcastPause: (positionMs: number) => {
    const { ws, isHost, activeRoom } = get();
    if (!ws || !isHost || !activeRoom) return;
    ws.send(JSON.stringify({ type: "HOST_PAUSE", positionMs }));
  },

  broadcastSeek: (positionMs: number) => {
    const { ws, isHost, activeRoom } = get();
    if (!ws || !isHost || !activeRoom) return;
    ws.send(JSON.stringify({ type: "HOST_SEEK", positionMs }));
  },

  broadcastTrackChange: (track: JamTrack, positionMs = 0) => {
    const { ws, isHost, activeRoom } = get();
    if (!ws || !isHost || !activeRoom) return;
    ws.send(JSON.stringify({ type: "HOST_CHANGE_TRACK", track, positionMs }));
  },

  transferHost: (newHostUserId: string) => {
    const { ws, isHost, activeRoom } = get();
    if (!ws || !isHost || !activeRoom) return;
    ws.send(JSON.stringify({ type: "HOST_TRANSFER", newHostUserId }));
  },

  addToJamQueue: (track: JamTrack) => {
    const { ws, activeRoom } = get();
    if (!ws || !activeRoom) return;
    ws.send(JSON.stringify({ type: "QUEUE_ADD", track }));
  },

  removeFromJamQueue: (index: number) => {
    const { ws, activeRoom } = get();
    if (!ws || !activeRoom) return;
    ws.send(JSON.stringify({ type: "QUEUE_REMOVE", index }));
  },

  reorderJamQueue: (fromIndex: number, toIndex: number) => {
    const { ws, activeRoom, isHost } = get();
    if (!ws || !activeRoom || !isHost) return;
    ws.send(JSON.stringify({ type: "QUEUE_REORDER", fromIndex, toIndex }));
  },

  _handleServerMessage: (msg: ServerMessage) => {
    const currentUser = useAuthStore.getState().user;

    switch (msg.type) {
      case "ROOM_STATE": {
        const isHost = msg.room.hostId === currentUser?.id;
        set({
          activeRoom: msg.room,
          members: msg.members,
          jamQueue: msg.queue,
          isHost,
          syncStatus: "synced",
        });

        // Persist active room code for seamless reload recovery
        try {
          localStorage.setItem("groovy:jam:active_room_code", msg.room.roomCode);
        } catch {}

        // Both Host and Listener authoritatively adopt the room's track and position
        if (msg.room.currentTrack) {
          const track = msg.room.currentTrack;
          const playerTrack: PlayerTrack = {
            id: track.id,
            title: track.title,
            artistId: track.artistId || "",
            artistName: track.artistName || "Unknown Artist",
            artistSlug: track.artistSlug,
            albumId: track.albumId,
            albumTitle: track.albumTitle,
            albumSlug: track.albumSlug,
            durationSeconds: track.duration,
            coverImageUrl: track.artworkUrl ?? undefined,
            audioUrl: track.audioUrl,
            hlsManifestUrl: track.hlsManifestUrl,
            rawAudioKey: track.rawAudioKey,
          };

          const clockOffset = get().clockOffsetMs;
          const nowServer = Date.now() + clockOffset;
          const isPlaying = msg.room.playbackState === "PLAYING";
          const targetSeconds = isPlaying
            ? Math.max(0, (msg.room.anchorPositionMs + (nowServer - msg.room.anchorServerTime)) / 1000)
            : Math.max(0, msg.room.anchorPositionMs / 1000);

          // Authoritatively synchronize player store without triggering outbound broadcast
          usePlayerStore.getState().syncJamPlayback(
            playerTrack,
            targetSeconds,
            isPlaying ? "playing" : "paused"
          );
        }
        break;
      }

      case "MEMBER_JOINED": {
        set((state) => {
          const exists = state.members.some((m) => m.userId === msg.member.userId);
          if (exists) return state;
          return { members: [...state.members, msg.member] };
        });
        break;
      }

      case "MEMBER_LEFT": {
        set((state) => ({
          members: state.members.filter((m) => m.userId !== msg.userId),
        }));
        break;
      }

      case "HOST_TRANSFER": {
        const isNowHost = msg.newHostId === currentUser?.id;
        set((state) => ({
          isHost: isNowHost,
          activeRoom: state.activeRoom
            ? {
                ...state.activeRoom,
                hostId: msg.newHostId,
                hostName: msg.newHostName,
              }
            : null,
          members: state.members.map((m) => ({
            ...m,
            role: m.userId === msg.newHostId ? "HOST" : "LISTENER",
          })),
        }));
        break;
      }

      case "PLAYBACK_STATE_UPDATE": {
        const { isHost } = get();

        set((state) => ({
          activeRoom: state.activeRoom
            ? {
                ...state.activeRoom,
                playbackState: msg.playbackState,
                anchorPositionMs: msg.anchorPositionMs,
                anchorServerTime: msg.anchorServerTime,
                currentTrack:
                  msg.currentTrack !== undefined
                    ? msg.currentTrack
                    : state.activeRoom.currentTrack,
              }
            : null,
        }));

        // If user is a Listener, react to host's playback action:
        if (!isHost) {
          const activeTrack = msg.currentTrack || get().activeRoom?.currentTrack;
          const isPlaying = msg.playbackState === "PLAYING";
          const clockOffset = get().clockOffsetMs;
          const nowServer = Date.now() + clockOffset;
          const targetSeconds = isPlaying
            ? Math.max(0, (msg.anchorPositionMs + (nowServer - msg.anchorServerTime)) / 1000)
            : Math.max(0, msg.anchorPositionMs / 1000);

          if (activeTrack) {
            const playerTrack: PlayerTrack = {
              id: activeTrack.id,
              title: activeTrack.title,
              artistId: activeTrack.artistId || "",
              artistName: activeTrack.artistName || "Unknown Artist",
              artistSlug: activeTrack.artistSlug,
              albumId: activeTrack.albumId,
              albumTitle: activeTrack.albumTitle,
              albumSlug: activeTrack.albumSlug,
              durationSeconds: activeTrack.duration,
              coverImageUrl: activeTrack.artworkUrl ?? undefined,
              audioUrl: activeTrack.audioUrl,
              hlsManifestUrl: activeTrack.hlsManifestUrl,
              rawAudioKey: activeTrack.rawAudioKey,
            };

            usePlayerStore.getState().syncJamPlayback(
              playerTrack,
              targetSeconds,
              isPlaying ? "playing" : "paused"
            );
          }
        }
        break;
      }

      case "QUEUE_UPDATED": {
        set({ jamQueue: msg.queue });
        break;
      }

      case "ROOM_CLOSED": {
        try {
          localStorage.removeItem("groovy:jam:active_room_code");
        } catch {}
        set({
          activeRoom: null,
          isHost: false,
          members: [],
          jamQueue: [],
          syncStatus: "disconnected",
          errorMessage: msg.reason || "Room has closed",
          needsGesture: false,
        });
        break;
      }

      case "ERROR": {
        set({ errorMessage: msg.message });
        break;
      }
    }
  },
}));
