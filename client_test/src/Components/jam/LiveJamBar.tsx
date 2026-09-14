import { useState } from "react";
import { useJamStore } from "../../stores/jam.store";
import { useAuthStore } from "../../stores/auth.store";

export function LiveJamBar() {
  const activeRoom = useJamStore((s) => s.activeRoom);
  const isHost = useJamStore((s) => s.isHost);
  const members = useJamStore((s) => s.members);
  const syncStatus = useJamStore((s) => s.syncStatus);
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
    <div className="w-full bg-zinc-950/90 backdrop-blur-md border-t border-b border-emerald-500/30 px-3 py-1.5 flex items-center justify-between text-xs z-30 transition-all shadow-[0_-4px_16px_rgba(16,185,129,0.08)]">
      {/* Left: Jam Pulse & Room Code */}
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-semibold tracking-wider text-[10px] uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>Live Jam</span>
        </div>

        <button
          onClick={handleCopyLink}
          title="Click to copy invite link"
          className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-200 transition font-mono border border-zinc-700/60"
        >
          <span>{activeRoom.roomCode}</span>
          <span className="text-[10px] text-zinc-400">
            {copied ? (
              <span className="text-emerald-400 font-sans">Copied!</span>
            ) : (
              <svg className="w-3 h-3 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </span>
        </button>

        {/* Privacy Pill */}
        <span className="hidden md:inline text-[10px] text-zinc-400 uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800">
          {activeRoom.privacy.replace("_", " ")}
        </span>
      </div>

      {/* Center: Host / Sync State */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-zinc-300">
          <span className="text-zinc-500">DJ:</span>
          <span className="font-medium text-emerald-300">
            {isHost ? "You (Host)" : activeRoom.hostName}
          </span>
        </div>

        {/* Sync Status for Listeners */}
        {!isHost && (
          <div className="hidden sm:flex items-center gap-1 text-[10px]">
            {syncStatus === "synced" && (
              <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                ● Synced
              </span>
            )}
            {syncStatus === "drift_correcting" && (
              <span className="px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 animate-pulse">
                ◐ Catching up...
              </span>
            )}
            {syncStatus === "syncing" && (
              <span className="px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
                ○ Calibrating
              </span>
            )}
          </div>
        )}
      </div>

      {/* Right: Members dropdown & Leave button */}
      <div className="relative flex items-center gap-2">
        {/* Members Pill Button */}
        <button
          onClick={() => setShowMembersDropdown(!showMembersDropdown)}
          className="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-800/60 hover:bg-zinc-700/80 text-zinc-300 transition text-[11px]"
        >
          <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          <span>{members.length}</span>
          <span className="hidden sm:inline">listening</span>
        </button>

        {/* Room Info / Modal Trigger */}
        <button
          onClick={openModal}
          className="px-2 py-0.5 rounded bg-zinc-800/60 hover:bg-zinc-700/80 text-zinc-300 transition text-[11px]"
          title="Room Details & Invites"
        >
          Settings
        </button>

        {/* Leave Jam */}
        <button
          onClick={leaveRoom}
          className="px-2 py-0.5 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition font-medium text-[11px]"
        >
          Leave
        </button>

        {/* Members Flyout Menu */}
        {showMembersDropdown && (
          <div className="absolute right-0 bottom-full mb-2 w-64 bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 shadow-xl z-50 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800 text-xs font-semibold text-zinc-300">
              <span>Jam Members ({members.length})</span>
              <button
                onClick={() => setShowMembersDropdown(false)}
                className="text-zinc-500 hover:text-zinc-300"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {members.map((m) => {
                const isMemberHost = m.role === "HOST";
                const isMe = m.userId === currentUser?.id;

                return (
                  <div
                    key={m.userId}
                    className="flex items-center justify-between py-1 px-1.5 rounded hover:bg-zinc-800/50 transition"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center font-bold text-[10px] shrink-0 overflow-hidden">
                        {m.avatarUrl ? (
                          <img src={m.avatarUrl} alt={m.displayName} className="w-full h-full object-cover" />
                        ) : (
                          m.displayName.charAt(0).toUpperCase()
                        )}
                      </div>
                      <span className="truncate text-zinc-200 text-xs">
                        {m.displayName} {isMe && <span className="text-zinc-500">(You)</span>}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isMemberHost ? (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-medium">
                          DJ
                        </span>
                      ) : (
                        isHost && (
                          <button
                            onClick={() => {
                              transferHost(m.userId);
                              setShowMembersDropdown(false);
                            }}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-emerald-600 text-zinc-300 hover:text-white transition"
                            title="Pass the Aux / Make this user the DJ"
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
