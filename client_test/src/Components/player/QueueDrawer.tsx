import { useState } from "react";
import { usePlayerStore } from "../../stores/player.store";
import { useJamStore } from "../../stores/jam.store";
import { SongActionMenu } from "./SongActionMenu";

function formatSeconds(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function QueueDrawer() {
  const isQueueOpen = usePlayerStore((s) => s.isQueueOpen);
  const setQueueOpen = usePlayerStore((s) => s.setQueueOpen);

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const playbackStatus = usePlayerStore((s) => s.playbackStatus);
  const userQueue = usePlayerStore((s) => s.userQueue);
  const contextQueue = usePlayerStore((s) => s.contextQueue);
  const contextIndex = usePlayerStore((s) => s.contextIndex);
  const contextTitle = usePlayerStore((s) => s.contextTitle);

  const playUserQueueTrack = usePlayerStore((s) => s.playUserQueueTrack);
  const removeFromUserQueue = usePlayerStore((s) => s.removeFromUserQueue);
  const clearUserQueue = usePlayerStore((s) => s.clearUserQueue);
  const reorderUserQueue = usePlayerStore((s) => s.reorderUserQueue);
  const jumpToContextTrack = usePlayerStore((s) => s.jumpToContextTrack);

  const activeJamRoom = useJamStore((s) => s.activeRoom);
  const jamQueue = useJamStore((s) => s.jamQueue);
  const removeFromJamQueue = useJamStore((s) => s.removeFromJamQueue);

  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dropTargetIdx, setDropTargetIdx] = useState<number | null>(null);

  if (!isQueueOpen) return null;

  // Remaining tracks from current context
  const upcomingContext = contextQueue.slice(contextIndex + 1);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-xs transition-opacity cursor-pointer"
        onClick={() => setQueueOpen(false)}
      />

      {/* Drawer Panel */}
      <aside
        aria-label="Queue Drawer"
        className="fixed top-0 right-0 bottom-20 z-50 w-full sm:w-96 bg-panel border-l border-line shadow-2xl flex flex-col transition-transform duration-300"
      >
        {/* Header */}
        <div className="h-14 border-b border-line px-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <h3 className="font-serif italic text-lg font-bold text-ink">Playback Queue</h3>
            <span className="font-mono text-[10px] text-ink-soft">
              ({userQueue.length + upcomingContext.length} upcoming)
            </span>
          </div>
          <div className="flex items-center gap-2">
            {userQueue.length > 0 && (
              <button
                type="button"
                onClick={clearUserQueue}
                className="font-mono text-[10px] uppercase tracking-wider text-ink-soft hover:text-red-500 cursor-pointer px-2 py-1 rounded transition-colors"
              >
                Clear Queue
              </button>
            )}
            <button
              type="button"
              onClick={() => setQueueOpen(false)}
              aria-label="Close Queue"
              className="p-1 rounded text-ink-soft hover:text-ink hover:bg-stone/20 cursor-pointer transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-6 divide-y divide-line/60">
          {/* SECTION 1: NOW PLAYING */}
          {currentTrack ? (
            <div className="flex flex-col gap-2 pt-1">
              <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-blue font-bold">
                Now Playing
              </span>
              <div className="flex items-center gap-3.5 p-2.5 rounded-lg bg-blue/5 border border-blue/20">
                <div className="relative w-11 h-11 rounded bg-stone/40 border border-line shrink-0 overflow-hidden">
                  {currentTrack.coverImageUrl ? (
                    <img src={currentTrack.coverImageUrl} alt={currentTrack.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-serif italic text-base">♪</div>
                  )}
                  {playbackStatus === "playing" && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center gap-0.5">
                      <div className="w-1 h-3 bg-white animate-pulse" />
                      <div className="w-1 h-4 bg-white animate-pulse delay-75" />
                      <div className="w-1 h-2 bg-white animate-pulse delay-150" />
                    </div>
                  )}
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-sm font-semibold text-ink truncate">{currentTrack.title}</span>
                  <span className="text-xs text-ink-soft truncate">{currentTrack.artistName}</span>
                </div>
                <span className="font-mono text-[11px] text-ink-soft shrink-0">
                  {formatSeconds(currentTrack.durationSeconds)}
                </span>
              </div>
            </div>
          ) : (
            <div className="py-6 text-center text-ink-soft italic font-serif">No track playing</div>
          )}

          {/* SECTION: LIVE JAM COLLABORATIVE QUEUE */}
          {activeJamRoom && (
            <div className="flex flex-col gap-2 pt-4 border-b border-line pb-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Jam Queue ({jamQueue.length})
                </span>
                <span className="text-[10px] text-ink-soft font-mono">{activeJamRoom.roomCode}</span>
              </div>

              {jamQueue.length === 0 ? (
                <p className="text-xs text-ink-soft italic py-2">
                  No tracks in Jam queue yet. Use "Add to Jam Queue" on any song to contribute!
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {jamQueue.map((track, idx) => (
                    <div
                      key={`jam-q-${track.id}-${idx}`}
                      className="group flex items-center gap-2.5 p-2 rounded-xs bg-canvas border border-line hover:border-ink/30 text-xs transition shadow-2xs"
                    >
                      <span className="font-mono text-[10px] text-ink-soft w-4">{idx + 1}</span>
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="font-semibold text-ink truncate">{track.title}</span>
                        <div className="flex items-center gap-2 text-[10px] text-ink-soft truncate">
                          <span>{track.artistName}</span>
                          {track.addedByDisplayName && (
                            <span className="text-emerald-700 dark:text-emerald-400">• by {track.addedByDisplayName}</span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFromJamQueue(idx)}
                        className="text-ink-soft hover:text-red-500 transition p-1 cursor-pointer"
                        title="Remove from Jam queue"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SECTION 2: NEXT IN QUEUE (User Priority Queue) */}
          <div className="flex flex-col gap-2 pt-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-soft font-semibold">
                Next In Queue ({userQueue.length})
              </span>
            </div>

            {userQueue.length === 0 ? (
              <p className="text-xs text-ink-soft/70 italic py-2">
                Queue is empty. Tap "Play Next" or "Add to Queue" on any song to add it here.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5 mt-1">
                {userQueue.map((track, idx) => {
                  const isBeingDragged = draggedIdx === idx;
                  const isDropTarget = dropTargetIdx === idx;

                  return (
                    <div
                      key={`${track.id}-${idx}`}
                      draggable
                      onDragStart={(e) => {
                        setDraggedIdx(idx);
                        e.dataTransfer.setData("text/plain", String(idx));
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        if (dropTargetIdx !== idx) setDropTargetIdx(idx);
                      }}
                      onDragLeave={() => {
                        if (dropTargetIdx === idx) setDropTargetIdx(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const from = Number(e.dataTransfer.getData("text/plain"));
                        if (!Number.isNaN(from) && from !== idx) {
                          reorderUserQueue(from, idx);
                        }
                        setDraggedIdx(null);
                        setDropTargetIdx(null);
                      }}
                      className={`group flex items-center justify-between gap-2.5 p-2 rounded-md hover:bg-stone/20 transition-all cursor-pointer ${
                        isBeingDragged ? "opacity-35 bg-line/20" : ""
                      } ${isDropTarget ? "border-t-2 border-blue" : ""}`}
                    >
                      {/* Drag Handle & Playable Item */}
                      <div
                        className="flex items-center gap-2 min-w-0 flex-1"
                        onClick={() => playUserQueueTrack(idx)}
                      >
                        <span
                          className="font-mono text-[11px] text-ink-soft/40 group-hover:text-ink cursor-grab active:cursor-grabbing shrink-0 select-none px-0.5"
                          title="Drag to reorder"
                          onClick={(e) => e.stopPropagation()}
                        >
                          ⋮⋮
                        </span>

                        <div className="relative w-8 h-8 rounded bg-stone/40 border border-line shrink-0 overflow-hidden group/thumb">
                          {track.coverImageUrl ? (
                            <img src={track.coverImageUrl} alt={track.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xs">♪</div>
                          )}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center transition-opacity text-white text-[10px]">
                            ▶
                          </div>
                        </div>

                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-medium text-ink truncate group-hover:text-blue transition-colors">
                            {track.title}
                          </span>
                          <span className="text-[10.5px] text-ink-soft truncate">{track.artistName}</span>
                        </div>
                      </div>

                      {/* Right: Quick actions, action menu, duration */}
                      <div className="flex items-center gap-1 shrink-0">
                        <SongActionMenu track={track} />

                        <span className="font-mono text-[10.5px] text-ink-soft shrink-0 select-none">
                          {formatSeconds(track.durationSeconds)}
                        </span>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFromUserQueue(idx);
                          }}
                          title="Remove from queue"
                          className="p-1 text-ink-soft/60 hover:text-red-500 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* SECTION 3: NEXT FROM CONTEXT (Album / Playlist) */}
          <div className="flex flex-col gap-2 pt-4">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-soft font-semibold truncate">
              {contextTitle ? `Next from: ${contextTitle}` : "Next from Album / Playlist"}
            </span>

            {upcomingContext.length === 0 ? (
              <p className="text-xs text-ink-soft/70 italic py-2">
                End of context.
              </p>
            ) : (
              <div className="flex flex-col gap-1 mt-1">
                {upcomingContext.map((track, offset) => {
                  const actualIndex = contextIndex + 1 + offset;
                  return (
                    <div
                      key={`${track.id}-${actualIndex}`}
                      onClick={() => jumpToContextTrack(actualIndex)}
                      className="flex items-center justify-between gap-2.5 p-2 rounded-md hover:bg-stone/20 cursor-pointer transition-colors group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span className="font-mono text-[10px] text-ink-soft/60 w-4 text-center">
                          {actualIndex + 1}
                        </span>
                        <div className="relative w-8 h-8 rounded bg-stone/40 border border-line shrink-0 overflow-hidden group/thumb">
                          {track.coverImageUrl ? (
                            <img src={track.coverImageUrl} alt={track.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xs">♪</div>
                          )}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center transition-opacity text-white text-[10px]">
                            ▶
                          </div>
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-medium text-ink group-hover:text-blue transition-colors truncate">
                            {track.title}
                          </span>
                          <span className="text-[10.5px] text-ink-soft truncate">{track.artistName}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <SongActionMenu track={track} />
                        <span className="font-mono text-[10.5px] text-ink-soft select-none">
                          {formatSeconds(track.durationSeconds)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
