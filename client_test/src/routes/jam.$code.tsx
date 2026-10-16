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
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setError("Please sign in to join this Live Jam session.");
      setLoading(false);
      return;
    }

    const connectToJam = async () => {
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

  const handleCopyLink = () => {
    const url = `${window.location.origin}/jam/${code.toUpperCase()}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center p-6 select-none">
        <div className="w-12 h-12 rounded-full border-2 border-border border-t-emerald-600 animate-spin mb-4" />
        <h2 className="font-serif italic text-2xl text-foreground mb-1">Connecting to Live Jam</h2>
        <p className="text-xs font-mono text-muted-foreground tracking-widest">{code.toUpperCase()}</p>
        <p className="font-mono text-[11px] text-muted-foreground/70 mt-2">
          Calibrating clock offset and synchronizing audio stream...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center p-6 select-none">
        <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 flex items-center justify-center text-xl font-bold mb-4">
          ✕
        </div>
        <h2 className="font-serif italic text-2xl text-foreground mb-2">Could Not Join Jam</h2>
        <p className="text-xs text-muted-foreground max-w-md mb-6 leading-relaxed">{error}</p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate({ to: "/" })}
            className="px-4 py-2 rounded-xs border border-border bg-card hover:bg-background text-foreground font-mono text-xs uppercase tracking-wider transition-colors cursor-pointer shadow-2xs"
          >
            &larr; Back to Catalog
          </button>
          {!isAuthenticated && (
            <button
              type="button"
              onClick={() =>
                navigate({
                  to: "/login",
                  search: { redirect: `/jam/${code}` },
                })
              }
              className="px-4 py-2 rounded-xs bg-foreground hover:bg-primary text-background hover:text-primary-foreground font-mono text-xs uppercase tracking-wider transition-colors cursor-pointer shadow-2xs"
            >
              Sign In
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Session Hero Banner */}
      <div className="p-6 sm:p-8 rounded-xs bg-card border border-border shadow-xs relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 font-mono text-[11px] uppercase tracking-wider font-semibold mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
              <span>Live Listening Session</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-serif italic text-foreground tracking-tight flex flex-wrap items-center gap-3">
              <span>Room {activeRoom?.roomCode}</span>
              <span className="font-mono text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-xs bg-secondary/20 dark:bg-secondary/40 text-muted-foreground border border-border not-italic font-normal">
                {activeRoom?.privacy.replace("_", " ")}
              </span>
            </h1>

            <div className="text-xs text-muted-foreground mt-2 flex flex-wrap items-center gap-3 font-mono text-[11px]">
              <span>
                DJ: <strong className="text-foreground font-semibold">{isHost ? "You (Host)" : activeRoom?.hostName}</strong>
              </span>
              <span>•</span>
              <span>{members.length} {members.length === 1 ? "listener" : "listeners"} connected</span>
              {!isHost && (
                <>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider">
                    {syncStatus === "synced" && (
                      <span className="px-1.5 py-0.5 rounded-xs bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                        ● Synced
                      </span>
                    )}
                    {syncStatus === "drift_correcting" && (
                      <span className="px-1.5 py-0.5 rounded-xs bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 animate-pulse">
                        ◐ Catching up...
                      </span>
                    )}
                    {syncStatus === "syncing" && (
                      <span className="px-1.5 py-0.5 rounded-xs bg-secondary/20 text-muted-foreground border border-border">
                        ○ Calibrating
                      </span>
                    )}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleCopyLink}
              className="px-3.5 py-1.5 rounded-xs border border-border bg-card hover:bg-background hover:border-foreground text-foreground font-mono text-xs uppercase tracking-wider transition-colors cursor-pointer shadow-2xs flex items-center gap-1.5"
            >
              <span>{copied ? "Copied Link!" : "Copy Invite Link"}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                leaveRoom();
                navigate({ to: "/" });
              }}
              className="px-3.5 py-1.5 rounded-xs border border-red-500/25 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 font-mono text-xs uppercase tracking-wider font-semibold transition-colors cursor-pointer shadow-2xs"
            >
              Leave Jam
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Now Playing & Collaborative Queue */}
        <div className="lg:col-span-2 space-y-6">
          {/* Current Playing Card */}
          <div className="p-5 sm:p-6 rounded-xs bg-card border border-border space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                Now Playing in Jam
              </span>
              <span className="font-mono text-[11px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                Synchronized
              </span>
            </div>

            {currentTrack ? (
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xs bg-secondary/20 overflow-hidden border border-border shrink-0 shadow-xs">
                  {currentTrack.coverImageUrl ? (
                    <img
                      src={currentTrack.coverImageUrl}
                      alt={currentTrack.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-serif text-2xl text-muted-foreground italic">
                      🎵
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="font-sans font-semibold text-xl sm:text-2xl text-foreground truncate leading-tight">
                    {currentTrack.title}
                  </h3>
                  <p className="text-sm text-muted-foreground truncate mt-1">
                    {currentTrack.artistName || "Unknown Artist"}
                  </p>
                  {currentTrack.albumTitle && (
                    <p className="font-mono text-[11px] text-muted-foreground/70 truncate mt-0.5">
                      {currentTrack.albumTitle}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground italic font-serif text-sm">
                No track currently playing. The DJ can select a track from the catalog to start the music.
              </div>
            )}
          </div>

          {/* Collaborative Jam Queue */}
          <div className="p-5 sm:p-6 rounded-xs bg-card border border-border space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                Up Next in Jam ({jamQueue.length})
              </span>
              <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Collaborative Queue
              </span>
            </div>

            {jamQueue.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-6 text-center font-serif">
                The Jam queue is currently empty. Browse the catalog and click "Add to Jam Queue" on any song to contribute!
              </p>
            ) : (
              <div className="space-y-1.5">
                {jamQueue.map((track, idx) => (
                  <div
                    key={`${track.id}-${idx}`}
                    className="flex items-center justify-between p-3 rounded-xs bg-background border border-border hover:border-foreground/20 transition text-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono text-muted-foreground text-xs w-5 shrink-0">{idx + 1}</span>
                      <div className="min-w-0">
                        <div className="font-medium text-foreground truncate">{track.title}</div>
                        <div className="text-[11px] text-muted-foreground truncate">{track.artistName}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {track.addedByDisplayName && (
                        <span className="font-mono text-[11px] text-muted-foreground bg-secondary/20 px-1.5 py-0.5 rounded-xs border border-border">
                          Added by {track.addedByDisplayName}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Col: Connected Listeners & Room Details */}
        <div className="space-y-6">
          <div className="p-5 sm:p-6 rounded-xs bg-card border border-border space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                Members ({members.length})
              </span>
              <span className="font-mono text-[11px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                Live
              </span>
            </div>

            <div className="space-y-1.5">
              {members.map((m) => (
                <div
                  key={m.userId}
                  className="flex items-center justify-between p-2.5 rounded-xs bg-background border border-border text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-mono font-bold text-xs shrink-0 overflow-hidden">
                      {m.avatarUrl ? (
                        <img src={m.avatarUrl} alt={m.displayName} className="w-full h-full object-cover" />
                      ) : (
                        m.displayName.charAt(0).toUpperCase()
                      )}
                    </div>
                    <span className="font-medium text-foreground truncate">
                      {m.displayName} {m.userId === useAuthStore.getState().user?.id && <span className="text-muted-foreground text-[11px]">(You)</span>}
                    </span>
                  </div>

                  <div>
                    {m.role === "HOST" ? (
                      <span className="font-mono text-[11px] uppercase tracking-wider px-1.5 py-0.5 rounded-xs bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-semibold border border-emerald-500/30">
                        DJ
                      </span>
                    ) : (
                      isHost && (
                        <button
                          type="button"
                          onClick={() => transferHost(m.userId)}
                          className="font-mono text-[11px] uppercase tracking-wider px-1.5 py-0.5 rounded-xs border border-border hover:border-emerald-500 bg-card hover:bg-emerald-500 hover:text-white text-muted-foreground transition cursor-pointer"
                          title="Pass the DJ control to this listener"
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
