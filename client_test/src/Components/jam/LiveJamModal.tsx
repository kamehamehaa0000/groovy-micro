import { useState } from "react";
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
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
              🎧
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">Live Jam</h2>
              <p className="text-xs text-zinc-400">Real-time synchronized group listening</p>
            </div>
          </div>
          <button
            onClick={closeModal}
            className="text-zinc-400 hover:text-zinc-200 transition p-1 rounded-lg hover:bg-zinc-800"
          >
            ✕
          </button>
        </div>

        {/* Error Banners */}
        {(errorMessage || localError) && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center justify-between">
            <span>{localError || errorMessage}</span>
            <button onClick={() => setLocalError(null)} className="text-red-300 font-bold ml-2">✕</button>
          </div>
        )}

        {/* If user is ALREADY in an active room, show Room Details & Controls */}
        {activeRoom ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-400 font-medium">Active Room Code</span>
                <span className="text-sm font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/20">
                  {activeRoom.roomCode}
                </span>
              </div>

              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">Shareable Invite Link</label>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={`${window.location.origin}/jam/${activeRoom.roomCode}`}
                    className="w-full bg-zinc-900 border border-zinc-700/60 rounded px-2.5 py-1.5 text-xs text-zinc-300 font-mono select-all focus:outline-none"
                  />
                  <button
                    onClick={handleCopyLink}
                    className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition shrink-0"
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>

              <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between text-xs">
                <span className="text-zinc-400">Privacy Mode:</span>
                <span className="text-zinc-200 uppercase font-semibold text-[11px]">
                  {activeRoom.privacy.replace("_", " ")}
                </span>
              </div>
            </div>

            {/* Participants list */}
            <div>
              <h3 className="text-xs font-semibold text-zinc-300 mb-2">Connected Listeners ({members.length})</h3>
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {members.map((m) => (
                  <div
                    key={m.userId}
                    className="flex items-center justify-between p-2 rounded-lg bg-zinc-950/40 border border-zinc-800/60 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center font-bold text-[10px]">
                        {m.displayName.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-zinc-200 font-medium">
                        {m.displayName} {m.userId === currentUser?.id && <span className="text-zinc-500">(You)</span>}
                      </span>
                    </div>

                    <div>
                      {m.role === "HOST" ? (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-semibold">
                          DJ Host
                        </span>
                      ) : (
                        isHost && (
                          <button
                            onClick={() => transferHost(m.userId)}
                            className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-emerald-600 text-zinc-300 hover:text-white transition"
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
            <div className="pt-2 flex items-center justify-between">
              <button
                onClick={closeModal}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition"
              >
                Close
              </button>
              <button
                onClick={() => {
                  leaveRoom();
                  closeModal();
                }}
                className="px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-semibold transition"
              >
                Leave Session
              </button>
            </div>
          </div>
        ) : (
          /* If NOT in a room, provide Start / Join Tabs */
          <div>
            <div className="flex rounded-xl bg-zinc-950 p-1 mb-5 border border-zinc-800">
              <button
                onClick={() => setTab("create")}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition ${
                  tab === "create"
                    ? "bg-zinc-800 text-white shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Start a Jam
              </button>
              <button
                onClick={() => setTab("join")}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition ${
                  tab === "join"
                    ? "bg-zinc-800 text-white shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Join with Code
              </button>
            </div>

            {tab === "create" ? (
              <div className="space-y-4">
                {/* Privacy Options */}
                <div>
                  <label className="text-xs font-semibold text-zinc-300 block mb-2">Room Privacy</label>
                  <div className="space-y-2">
                    <label
                      onClick={() => setPrivacy("FRIENDS_ONLY")}
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                        privacy === "FRIENDS_ONLY"
                          ? "bg-emerald-500/10 border-emerald-500/40"
                          : "bg-zinc-950/50 border-zinc-800 hover:border-zinc-700"
                      }`}
                    >
                      <input
                        type="radio"
                        name="jam_privacy"
                        checked={privacy === "FRIENDS_ONLY"}
                        onChange={() => setPrivacy("FRIENDS_ONLY")}
                        className="mt-0.5 accent-emerald-500"
                      />
                      <div>
                        <div className="text-xs font-semibold text-zinc-200">Friends Only (Recommended)</div>
                        <div className="text-[11px] text-zinc-400 leading-relaxed">
                          Only mutual accepted friends can see your Jam on their feed & join.
                        </div>
                      </div>
                    </label>

                    <label
                      onClick={() => setPrivacy("PUBLIC")}
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                        privacy === "PUBLIC"
                          ? "bg-emerald-500/10 border-emerald-500/40"
                          : "bg-zinc-950/50 border-zinc-800 hover:border-zinc-700"
                      }`}
                    >
                      <input
                        type="radio"
                        name="jam_privacy"
                        checked={privacy === "PUBLIC"}
                        onChange={() => setPrivacy("PUBLIC")}
                        className="mt-0.5 accent-emerald-500"
                      />
                      <div>
                        <div className="text-xs font-semibold text-zinc-200">Public</div>
                        <div className="text-[11px] text-zinc-400 leading-relaxed">
                          Visible on the activity desk and feed for anyone in the community to join.
                        </div>
                      </div>
                    </label>

                    <label
                      onClick={() => setPrivacy("INVITE_ONLY")}
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                        privacy === "INVITE_ONLY"
                          ? "bg-emerald-500/10 border-emerald-500/40"
                          : "bg-zinc-950/50 border-zinc-800 hover:border-zinc-700"
                      }`}
                    >
                      <input
                        type="radio"
                        name="jam_privacy"
                        checked={privacy === "INVITE_ONLY"}
                        onChange={() => setPrivacy("INVITE_ONLY")}
                        className="mt-0.5 accent-emerald-500"
                      />
                      <div>
                        <div className="text-xs font-semibold text-zinc-200">Invite Only</div>
                        <div className="text-[11px] text-zinc-400 leading-relaxed">
                          Completely unlisted. Friends can only join if you send them the room link or code.
                        </div>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Allow guest queue */}
                <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={allowGuestQueue}
                    onChange={(e) => setAllowGuestQueue(e.target.checked)}
                    className="rounded accent-emerald-500"
                  />
                  <span>Allow listeners to add tracks to the Jam queue</span>
                </label>

                {/* Submit button */}
                <button
                  disabled={loading}
                  onClick={handleCreate}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold transition shadow-lg shadow-emerald-950/40 disabled:opacity-50"
                >
                  {loading ? "Starting Session..." : "Start Live Jam"}
                </button>
              </div>
            ) : (
              /* Join tab */
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-zinc-300 block mb-2">Enter 6-Character Room Code</label>
                  <input
                    type="text"
                    placeholder="e.g. JAM-8K2Q or 8K2Q"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleJoin();
                    }}
                    className="w-full bg-zinc-950 border border-zinc-700/80 rounded-xl px-3.5 py-2.5 text-center text-lg font-mono font-bold tracking-widest text-emerald-400 placeholder:text-zinc-600 uppercase focus:outline-none focus:border-emerald-500"
                    maxLength={10}
                  />
                </div>

                <p className="text-[11px] text-zinc-400 text-center leading-relaxed">
                  Enter the code provided by your friend to jump straight into their live listening session.
                </p>

                <button
                  disabled={loading || !joinCode.trim()}
                  onClick={handleJoin}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition disabled:opacity-50 shadow-lg shadow-emerald-950/40"
                >
                  {loading ? "Joining..." : "Join Jam"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
