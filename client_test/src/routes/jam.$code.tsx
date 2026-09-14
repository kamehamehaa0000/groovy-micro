import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useJamStore } from "../stores/jam.store";
import { useAuthStore } from "../stores/auth.store";
import { usePlayerStore } from "../stores/player.store";

export const Route = createFileRoute("/jam/$code")({
  component: JamRouteComponent,
});

function JamRouteComponent() {
  const { code } = Route.useParams();
  const navigate = useNavigate();

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const activeRoom = useJamStore((s) => s.activeRoom);
  const isHost = useJamStore((s) => s.isHost);
  const members = useJamStore((s) => s.members);
  const jamQueue = useJamStore((s) => s.jamQueue);
  const syncStatus = useJamStore((s) => s.syncStatus);
  const joinRoom = useJamStore((s) => s.joinRoom);
  const leaveRoom = useJamStore((s) => s.leaveRoom);
  const transferHost = useJamStore((s) => s.transferHost);
  const currentTrack = usePlayerStore((s) => s.currentTrack);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setError("Please sign in to join this Live Jam session.");
      setLoading(false);
      return;
    }

    const connectToJam = async () => {
      // If already in this room, done
      if (activeRoom && activeRoom.roomCode.toUpperCase() === code.toUpperCase()) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        await joinRoom(code);
      } catch (err: any) {
        setError(err.message || "Failed to join Live Jam. Verify the room code and your privacy permissions.");
      } finally {
        setLoading(false);
      }
    };

    connectToJam();
  }, [code, isAuthenticated]);

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center p-6">
        <div className="w-16 h-16 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Connecting to Live Jam</h2>
        <p className="text-sm text-zinc-400 font-mono tracking-wider">{code.toUpperCase()}</p>
        <p className="text-xs text-zinc-500 mt-2">Calibrating clock offset and synchronizing audio...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center p-6">
        <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center text-2xl font-bold mb-4">
          ✕
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Could Not Join Jam</h2>
        <p className="text-sm text-zinc-400 max-w-md mb-6">{error}</p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate({ to: "/" })}
            className="px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold transition"
          >
            Back to Home
          </button>
          {!isAuthenticated && (
            <button
              onClick={() => navigate({ to: "/login" })}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition"
            >
              Sign In
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Session Hero Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-emerald-950/40 via-zinc-900 to-zinc-950 border border-emerald-500/30 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-3">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Live Listening Session</span>
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
              <span>Room {activeRoom?.roomCode}</span>
              <span className="text-xs font-mono font-normal uppercase px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                {activeRoom?.privacy.replace("_", " ")}
              </span>
            </h1>
            <p className="text-sm text-zinc-400 mt-1 flex items-center gap-2">
              <span>
                Host DJ: <span className="font-semibold text-emerald-300">{isHost ? "You" : activeRoom?.hostName}</span>
              </span>
              {!isHost && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  {syncStatus === "synced" ? "● In Sync" : syncStatus === "drift_correcting" ? "◐ Catching up" : "○ Calibrating"}
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                leaveRoom();
                navigate({ to: "/" });
              }}
              className="px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-semibold transition"
            >
              Leave Jam
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left 2 Cols: Now Playing & Collaborative Queue */}
        <div className="md:col-span-2 space-y-6">
          {/* Current Playing Card */}
          <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-4">
            <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Now Playing in Jam</h2>
            {currentTrack ? (
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-xl bg-zinc-800 overflow-hidden shadow-lg shrink-0">
                  {currentTrack.coverImageUrl ? (
                    <img src={currentTrack.coverImageUrl} alt={currentTrack.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-600 text-2xl font-bold">🎵</div>
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-white truncate">{currentTrack.title}</h3>
                  <p className="text-sm text-zinc-400 truncate">{currentTrack.artistName || "Unknown Artist"}</p>
                  <p className="text-xs text-zinc-500 mt-1">{currentTrack.albumTitle}</p>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-zinc-500 text-sm">
                No track currently playing. Host can select a track to start the music.
              </div>
            )}
          </div>

          {/* Collaborative Jam Queue */}
          <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                Up Next in Jam ({jamQueue.length})
              </h2>
              <span className="text-[11px] text-zinc-500">Collaborative Queue</span>
            </div>

            {jamQueue.length === 0 ? (
              <p className="text-xs text-zinc-500 py-6 text-center">
                The Jam queue is currently empty. Browse the catalog and click "Add to Jam Queue" on any song to queue it up!
              </p>
            ) : (
              <div className="space-y-2">
                {jamQueue.map((track, idx) => (
                  <div
                    key={`${track.id}-${idx}`}
                    className="flex items-center justify-between p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80 hover:border-zinc-700 transition text-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono text-zinc-500 text-xs w-5">{idx + 1}</span>
                      <div className="min-w-0">
                        <div className="font-semibold text-zinc-200 truncate">{track.title}</div>
                        <div className="text-[11px] text-zinc-400 truncate">{track.artistName}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {track.addedByDisplayName && (
                        <span className="text-[10px] text-zinc-500">Added by {track.addedByDisplayName}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Col: Connected Listeners */}
        <div className="space-y-6">
          <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-4">
            <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              Connected Members ({members.length})
            </h2>

            <div className="space-y-2">
              {members.map((m) => (
                <div
                  key={m.userId}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-950/50 border border-zinc-800/80 text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center font-bold text-xs shrink-0">
                      {m.displayName.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium text-zinc-200 truncate">{m.displayName}</span>
                  </div>

                  <div>
                    {m.role === "HOST" ? (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-semibold">
                        DJ
                      </span>
                    ) : (
                      isHost && (
                        <button
                          onClick={() => transferHost(m.userId)}
                          className="text-[10px] px-2 py-1 rounded bg-zinc-800 hover:bg-emerald-600 text-zinc-300 hover:text-white transition"
                        >
                          Pass Aux
                        </button>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
