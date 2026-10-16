import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useJamStore } from "../../stores/jam.store";
import { useAuthStore } from "../../stores/auth.store";
import { usePlayerStore } from "../../stores/player.store";

export function LiveJamBar() {
  const activeRoom = useJamStore((s) => s.activeRoom);
  const isHost = useJamStore((s) => s.isHost);
  const members = useJamStore((s) => s.members);
  const syncStatus = useJamStore((s) => s.syncStatus);
  const needsGesture = useJamStore((s) => s.needsGesture);
  const leaveRoom = useJamStore((s) => s.leaveRoom);
  const transferHost = useJamStore((s) => s.transferHost);
  const openModal = useJamStore((s) => s.openModal);

  const currentUser = useAuthStore((s) => s.user);

  const [copied, setCopied] = useState(false);
  const [showMembersDropdown, setShowMembersDropdown] = useState(false);

  if (!activeRoom) return null;

  const handleCopyLink = () => {
    const url = `${window.location.origin}/jam/${activeRoom.roomCode}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full bg-card/95 backdrop-blur-md border border-success/30 md:border-t md:border-b-0 md:border-x-0 md:border-border rounded-xl md:rounded-none text-foreground px-3 sm:px-6 md:px-8 py-1.5 md:py-0 md:h-9 flex items-center justify-between text-caption transition-all shadow-md md:shadow-none select-none">
      {/* Left: Live Pulse & Room Code */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-success-soft border border-success/30 text-success font-eyebrow text-eyebrow uppercase tracking-wider font-semibold shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
          <span className="hidden xs:inline">Live Jam</span>
          <span className="xs:hidden">Jam</span>
        </div>

        <button
          type="button"
          onClick={handleCopyLink}
          title="Click to copy invite link"
          className="flex items-center gap-1.5 px-2 py-0.5 rounded-control bg-card dark:bg-background border border-border hover:border-foreground/40 text-foreground font-mono text-eyebrow tracking-wider transition-colors shrink-0 cursor-pointer shadow-raised"
        >
          <span>{activeRoom.roomCode}</span>
          <span className="text-eyebrow text-muted-foreground hidden sm:inline">
            {copied ? (
              <span className="text-success font-sans font-medium">Copied!</span>
            ) : (
              <svg className="w-3 h-3 inline text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </span>
        </button>

        {/* Privacy Pill (md+) */}
        <span className="hidden md:inline font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground px-1.5 py-0.5 rounded-control border border-border bg-card/60">
          {activeRoom.privacy.replace("_", " ")}
        </span>
      </div>

      {/* Center: Host DJ / Sync State / Autoplay Fallback */}
      <div className="flex items-center gap-2 min-w-0 px-1">
        {needsGesture ? (
          <button
            type="button"
            onClick={() => {
              usePlayerStore.getState().resume();
              useJamStore.getState().setNeedsGesture(false);
            }}
            className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-success hover:bg-success text-success-foreground font-eyebrow text-eyebrow uppercase tracking-wider font-semibold shadow-sm animate-bounce transition-colors cursor-pointer shrink-0"
            title="Browser blocked autoplay on reload. Tap to synchronize live playback."
          >
            <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
            <span>Tap to Sync</span>
          </button>
        ) : (
          <div className="flex items-center gap-1.5 text-muted-foreground text-caption truncate">
            <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground/70 hidden sm:inline">
              DJ:
            </span>
            <span className="font-medium text-foreground truncate text-eyebrow sm:text-caption">
              {isHost ? "You (Host)" : activeRoom.hostName}
            </span>
          </div>
        )}

        {/* Sync Status Badge for Listeners (sm+) */}
        {!isHost && !needsGesture && (
          <div className="hidden sm:flex items-center text-eyebrow font-eyebrow uppercase tracking-wider">
            {syncStatus === "synced" && (
              <span className="px-1.5 py-0.2 rounded-control bg-success-soft text-success border border-success/20">
                Synced
              </span>
            )}
            {syncStatus === "drift_correcting" && (
              <span className="px-1.5 py-0.2 rounded-control bg-warning-soft text-warning border border-warning/20 animate-pulse">
                Catching up
              </span>
            )}
            {syncStatus === "syncing" && (
              <span className="px-1.5 py-0.2 rounded-control bg-secondary/20 text-muted-foreground border border-border">
                Calibrating
              </span>
            )}
          </div>
        )}
      </div>

      {/* Right: Actions & Jam Page link for mobile */}
      <div className="relative flex items-center gap-1.5 sm:gap-2 shrink-0">
        {/* Jam Page Navigation Button (Always visible, responsive) */}
        <Link
          to="/jam/$code"
          params={{ code: activeRoom.roomCode }}
          className="flex items-center gap-1 px-2 py-0.5 rounded-control border border-border bg-card hover:bg-background hover:border-foreground text-foreground font-eyebrow text-eyebrow uppercase tracking-wider transition-colors cursor-pointer shadow-raised"
          title="Open Jam Page with Collaborative Queue & Room Controls"
        >
          <svg className="w-3 h-3 text-success shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          <span className="hidden xs:inline">Jam Page</span>
        </Link>

        {/* Members Pill Button with dropdown (sm+) */}
        <button
          type="button"
          onClick={() => setShowMembersDropdown(!showMembersDropdown)}
          className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-control border border-border bg-card hover:bg-background hover:border-foreground text-muted-foreground hover:text-foreground font-mono text-eyebrow transition-colors cursor-pointer shadow-raised"
          title="View connected listeners"
        >
          <svg className="w-3 h-3 text-success shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          <span>{members.length}</span>
        </button>

        {/* Settings modal trigger (sm+) */}
        <button
          type="button"
          onClick={openModal}
          className="hidden sm:inline-block px-2 py-0.5 rounded-control border border-border bg-card hover:bg-background hover:border-foreground text-muted-foreground hover:text-foreground font-eyebrow text-eyebrow uppercase tracking-wider transition-colors cursor-pointer shadow-raised"
          title="Room Details & Privacy Settings"
        >
          Settings
        </button>

        {/* Leave Jam */}
        <button
          type="button"
          onClick={leaveRoom}
          className="px-2 py-0.5 rounded-control border border-destructive/20 bg-destructive-soft hover:bg-destructive/20 text-destructive font-eyebrow text-eyebrow uppercase tracking-wider transition-colors cursor-pointer shadow-raised"
          title="Leave Live Jam Session"
        >
          Leave
        </button>

        {/* Members Flyout Menu */}
        {showMembersDropdown && (
          <div className="absolute right-0 bottom-full mb-2 w-64 bg-card border border-border rounded-control p-3 shadow-[0_16px_40px_rgba(23,22,15,0.15)] dark:shadow-[0_16px_40px_rgba(0,0,0,0.5)] z-50 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-border font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground">
              <span>Listeners ({members.length})</span>
              <button
                type="button"
                onClick={() => setShowMembersDropdown(false)}
                className="text-muted-foreground hover:text-foreground cursor-pointer p-0.5"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
              {members.map((m) => {
                const isMemberHost = m.role === "HOST";
                const isMe = m.userId === currentUser?.id;

                return (
                  <div
                    key={m.userId}
                    className="flex items-center justify-between py-1 px-1.5 rounded-control hover:bg-background transition"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <div className="w-5 h-5 rounded-full bg-success-soft text-success flex items-center justify-center font-mono font-bold text-eyebrow shrink-0 overflow-hidden">
                        {m.avatarUrl ? (
                          <img src={m.avatarUrl} alt={m.displayName} className="w-full h-full object-cover" />
                        ) : (
                          m.displayName.charAt(0).toUpperCase()
                        )}
                      </div>
                      <span className="truncate text-foreground text-caption font-medium">
                        {m.displayName} {isMe && <span className="text-muted-foreground text-eyebrow">(You)</span>}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isMemberHost ? (
                        <span className="font-eyebrow text-eyebrow uppercase tracking-wider px-1.5 py-0.2 rounded-control bg-success-soft text-success font-semibold border border-success/30">
                          DJ
                        </span>
                      ) : (
                        isHost && (
                          <button
                            type="button"
                            onClick={() => {
                              transferHost(m.userId);
                              setShowMembersDropdown(false);
                            }}
                            className="font-eyebrow text-eyebrow uppercase tracking-wider px-1.5 py-0.5 rounded-control border border-border hover:border-success bg-card hover:bg-success hover:text-success-foreground text-muted-foreground transition cursor-pointer"
                            title="Make this listener the DJ"
                          >
                            Pass Aux
                          </button>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
