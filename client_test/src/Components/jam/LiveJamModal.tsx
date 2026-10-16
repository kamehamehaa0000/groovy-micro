import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useJamStore } from "../../stores/jam.store";
import { useAuthStore } from "../../stores/auth.store";
import type { RoomPrivacy } from "../../types/jam";

export function LiveJamModal() {
  const isModalOpen = useJamStore((s) => s.isModalOpen);
  const closeModal = useJamStore((s) => s.closeModal);
  const activeRoom = useJamStore((s) => s.activeRoom);
  const isHost = useJamStore((s) => s.isHost);
  const members = useJamStore((s) => s.members);
  const errorMessage = useJamStore((s) => s.errorMessage);
  const createRoom = useJamStore((s) => s.createRoom);
  const joinRoom = useJamStore((s) => s.joinRoom);
  const leaveRoom = useJamStore((s) => s.leaveRoom);
  const transferHost = useJamStore((s) => s.transferHost);

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const currentUser = useAuthStore((s) => s.user);

  const [tab, setTab] = useState<"create" | "join">("create");
  const [privacy, setPrivacy] = useState<RoomPrivacy>("FRIENDS_ONLY");
  const [allowGuestQueue, setAllowGuestQueue] = useState(true);
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Close on Escape key press
  useEffect(() => {
    if (!isModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isModalOpen, closeModal]);

  if (!isModalOpen) return null;

  const handleCreate = async () => {
    if (!isAuthenticated) {
      setLocalError("Please sign in to start a Live Jam");
      return;
    }

    setLoading(true);
    setLocalError(null);
    try {
      await createRoom(privacy, allowGuestQueue);
      closeModal();
    } catch (err: any) {
      setLocalError(err.message || "Failed to create Live Jam");
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!isAuthenticated) {
      setLocalError("Please sign in to join a Live Jam");
      return;
    }

    const cleanCode = joinCode.toUpperCase().trim();
    if (!cleanCode) {
      setLocalError("Please enter a valid room code");
      return;
    }

    setLoading(true);
    setLocalError(null);
    try {
      await joinRoom(cleanCode);
      closeModal();
    } catch (err: any) {
      setLocalError(err.message || "Failed to join room. Verify the code and your permissions.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (!activeRoom) return;
    const url = `${window.location.origin}/jam/${activeRoom.roomCode}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="jam-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
    >
      {/* Backdrop overlay */}
      <div
        className="absolute inset-0 bg-foreground/45 backdrop-blur-[3px] animate-in fade-in duration-150 cursor-pointer"
        onClick={closeModal}
      />

      {/* Modal Dialog Card */}
      <div
        className="relative w-full max-w-[460px] border border-border bg-background shadow-[0_24px_80px_rgba(23,22,15,0.20)] dark:shadow-[0_24px_80px_rgba(0,0,0,0.6)] animate-in zoom-in-95 duration-150 rounded-xs overflow-hidden select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top rule / Subtitle */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3 sm:px-6">
          <span className="font-eyebrow text-[11px] uppercase tracking-widest text-muted-foreground">
            Groovy / Live Jam
          </span>

          <button
            type="button"
            onClick={closeModal}
            aria-label="Close"
            className="group flex h-7 w-7 items-center justify-center text-muted-foreground transition hover:text-foreground cursor-pointer"
          >
            <svg
              className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90"
              viewBox="0 0 16 16"
              fill="none"
            >
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.1" />
            </svg>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-7">
          {/* Brand Header */}
          <div className="mb-5">
            <div
              id="jam-dialog-title"
              className="font-serif text-[26px] italic leading-none tracking-[-0.03em] text-foreground flex items-center gap-2"
            >
              <span>Live Jam</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block mb-1" />
            </div>
            <div className="mt-1.5 font-eyebrow text-[11px] uppercase tracking-widest text-muted-foreground">
              Real-time synchronized group listening
            </div>
          </div>

          {/* Error Banner */}
          {(errorMessage || localError) && (
            <div className="mb-4 p-3 rounded-xs bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 flex items-center justify-between font-mono text-[11px]">
              <span>{localError || errorMessage}</span>
              <button
                type="button"
                onClick={() => setLocalError(null)}
                className="text-red-700 dark:text-red-300 font-bold ml-2 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* If user is ALREADY in an active room */}
          {activeRoom ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xs bg-card border border-border space-y-3 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="font-eyebrow text-[11px] uppercase tracking-widest text-muted-foreground">
                    Active Room
                  </span>
                  <span className="font-mono text-sm font-bold text-foreground bg-secondary/20 dark:bg-secondary/40 px-2.5 py-0.5 rounded-xs border border-border">
                    {activeRoom.roomCode}
                  </span>
                </div>

                <div>
                  <label className="font-eyebrow text-[11px] uppercase tracking-wider text-muted-foreground block mb-1">
                    Shareable Invite Link
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={`${window.location.origin}/jam/${activeRoom.roomCode}`}
                      className="w-full bg-background border border-border rounded-xs px-2.5 py-1.5 font-mono text-[11px] text-foreground select-all focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="px-3 py-1.5 rounded-xs bg-foreground hover:bg-primary text-background hover:text-primary-foreground font-eyebrow text-[11px] uppercase tracking-wider font-semibold transition-colors shrink-0 cursor-pointer shadow-2xs"
                    >
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>

                <div className="pt-2 border-t border-border flex items-center justify-between text-xs">
                  <span className="font-eyebrow text-[11px] uppercase tracking-wider text-muted-foreground">
                    Privacy:
                  </span>
                  <span className="font-eyebrow text-[11px] uppercase tracking-wider text-foreground font-semibold">
                    {activeRoom.privacy.replace("_", " ")}
                  </span>
                </div>
              </div>

              {/* Quick link to Jam Page */}
              <Link
                to="/jam/$code"
                params={{ code: activeRoom.roomCode }}
                onClick={closeModal}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xs border border-border bg-card hover:bg-background text-foreground font-eyebrow text-xs uppercase tracking-wider transition-colors shadow-2xs"
              >
                <span>Open Dedicated Jam Room</span>
                <span className="text-primary">&rarr;</span>
              </Link>

              {/* Connected Listeners */}
              <div>
                <h3 className="font-eyebrow text-[11px] uppercase tracking-widest text-muted-foreground mb-2">
                  Connected Listeners ({members.length})
                </h3>
                <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                  {members.map((m) => (
                    <div
                      key={m.userId}
                      className="flex items-center justify-between p-2 rounded-xs bg-card border border-border text-xs"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <div className="w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-mono font-bold text-[11px] shrink-0 overflow-hidden">
                          {m.displayName.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-foreground font-medium truncate text-[11px]">
                          {m.displayName}{" "}
                          {m.userId === currentUser?.id && (
                            <span className="text-muted-foreground text-[11px]">(You)</span>
                          )}
                        </span>
                      </div>

                      <div>
                        {m.role === "HOST" ? (
                          <span className="font-eyebrow text-[11px] uppercase tracking-wider px-1.5 py-0.2 rounded-xs bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-semibold border border-emerald-500/30">
                            DJ Host
                          </span>
                        ) : (
                          isHost && (
                            <button
                              type="button"
                              onClick={() => transferHost(m.userId)}
                              className="font-eyebrow text-[11px] uppercase tracking-wider px-1.5 py-0.5 rounded-xs border border-border hover:border-emerald-500 bg-background hover:bg-emerald-500 hover:text-white text-muted-foreground transition cursor-pointer"
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

              {/* Actions */}
              <div className="pt-2 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-1.5 rounded-xs border border-border hover:border-foreground/40 text-muted-foreground hover:text-foreground font-eyebrow text-[11px] uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    leaveRoom();
                    closeModal();
                  }}
                  className="px-4 py-1.5 rounded-xs border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 font-eyebrow text-[11px] uppercase tracking-wider font-semibold transition-colors cursor-pointer"
                >
                  Leave Session
                </button>
              </div>
            </div>
          ) : (
            /* Start / Join Tabs */
            <div>
              <div className="flex rounded-xs bg-card p-1 mb-5 border border-border">
                <button
                  type="button"
                  onClick={() => setTab("create")}
                  className={`flex-1 py-1.5 font-eyebrow text-[11px] uppercase tracking-wider font-medium rounded-xs transition-colors cursor-pointer ${
                    tab === "create"
                      ? "bg-foreground text-background shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Start a Jam
                </button>
                <button
                  type="button"
                  onClick={() => setTab("join")}
                  className={`flex-1 py-1.5 font-eyebrow text-[11px] uppercase tracking-wider font-medium rounded-xs transition-colors cursor-pointer ${
                    tab === "join"
                      ? "bg-foreground text-background shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Join with Code
                </button>
              </div>

              {tab === "create" ? (
                <div className="space-y-4">
                  {/* Privacy Radio Options */}
                  <div>
                    <label className="font-eyebrow text-[11px] uppercase tracking-widest text-muted-foreground block mb-2 font-semibold">
                      Room Privacy
                    </label>
                    <div className="space-y-2">
                      <label
                        onClick={() => setPrivacy("FRIENDS_ONLY")}
                        className={`flex items-start gap-3 p-3 rounded-xs border cursor-pointer transition-colors ${
                          privacy === "FRIENDS_ONLY"
                            ? "bg-primary/5 dark:bg-primary/10 border-primary"
                            : "bg-card border-border hover:border-foreground/30"
                        }`}
                      >
                        <input
                          type="radio"
                          name="jam_privacy"
                          checked={privacy === "FRIENDS_ONLY"}
                          onChange={() => setPrivacy("FRIENDS_ONLY")}
                          className="mt-0.5 accent-primary"
                        />
                        <div>
                          <div className="text-xs font-semibold text-foreground">
                            Friends Only (Recommended)
                          </div>
                          <div className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                            Mutual friends can view your active broadcast on their activity desk and jump right in.
                          </div>
                        </div>
                      </label>

                      <label
                        onClick={() => setPrivacy("PUBLIC")}
                        className={`flex items-start gap-3 p-3 rounded-xs border cursor-pointer transition-colors ${
                          privacy === "PUBLIC"
                            ? "bg-primary/5 dark:bg-primary/10 border-primary"
                            : "bg-card border-border hover:border-foreground/30"
                        }`}
                      >
                        <input
                          type="radio"
                          name="jam_privacy"
                          checked={privacy === "PUBLIC"}
                          onChange={() => setPrivacy("PUBLIC")}
                          className="mt-0.5 accent-primary"
                        />
                        <div>
                          <div className="text-xs font-semibold text-foreground">Public</div>
                          <div className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                            Unlisted or listed on community feeds for all listeners to discover and enjoy.
                          </div>
                        </div>
                      </label>

                      <label
                        onClick={() => setPrivacy("INVITE_ONLY")}
                        className={`flex items-start gap-3 p-3 rounded-xs border cursor-pointer transition-colors ${
                          privacy === "INVITE_ONLY"
                            ? "bg-primary/5 dark:bg-primary/10 border-primary"
                            : "bg-card border-border hover:border-foreground/30"
                        }`}
                      >
                        <input
                          type="radio"
                          name="jam_privacy"
                          checked={privacy === "INVITE_ONLY"}
                          onChange={() => setPrivacy("INVITE_ONLY")}
                          className="mt-0.5 accent-primary"
                        />
                        <div>
                          <div className="text-xs font-semibold text-foreground">Invite Only</div>
                          <div className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                            Private session. Participants can only join by using your direct room code or invite link.
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Allow Guest Queue Checkbox */}
                  <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={allowGuestQueue}
                      onChange={(e) => setAllowGuestQueue(e.target.checked)}
                      className="accent-primary rounded-xs"
                    />
                    <span className="text-[11px] text-muted-foreground">
                      Allow listeners to add and suggest tracks to the collaborative queue
                    </span>
                  </label>

                  {/* Submit Button */}
                  <button
                    type="button"
                    disabled={loading}
                    onClick={handleCreate}
                    className="w-full py-2.5 rounded-xs bg-foreground hover:bg-primary text-background hover:text-primary-foreground font-eyebrow text-xs uppercase tracking-wider font-semibold transition-colors shadow-xs disabled:opacity-50 cursor-pointer mt-2"
                  >
                    {loading ? "Starting Session..." : "Start Live Jam"}
                  </button>
                </div>
              ) : (
                /* Join Tab */
                <div className="space-y-4">
                  <div>
                    <label className="font-eyebrow text-[11px] uppercase tracking-widest text-muted-foreground block mb-2 font-semibold">
                      Enter 6-Character Room Code
                    </label>
                    <input
                      type="text"
                      placeholder="JAM-8K2Q or 8K2Q"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleJoin();
                      }}
                      className="w-full bg-card border border-border rounded-xs px-4 py-2.5 text-center text-xl font-mono font-bold tracking-widest text-foreground placeholder:text-muted-foreground/40 uppercase focus:outline-none focus:border-primary transition-colors shadow-2xs"
                      maxLength={10}
                    />
                  </div>

                  <p className="font-mono text-[11px] text-muted-foreground text-center leading-relaxed">
                    Paste the invite code sent by your host to join the synchronized stream.
                  </p>

                  <button
                    type="button"
                    disabled={loading || !joinCode.trim()}
                    onClick={handleJoin}
                    className="w-full py-2.5 rounded-xs bg-foreground hover:bg-primary text-background hover:text-primary-foreground font-eyebrow text-xs uppercase tracking-wider font-semibold transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                  >
                    {loading ? "Joining..." : "Join Jam"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
