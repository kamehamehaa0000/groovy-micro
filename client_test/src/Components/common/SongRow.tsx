import { useState, useRef, memo } from "react";
import { Link } from "@tanstack/react-router";
import { usePlayerStore } from "../../stores/player.store";
import { useLikesStore } from "../../stores/likes.store";
import { useAuthStore } from "../../stores/auth.store";
import { useAuthModalStore } from "../../stores/auth-modal.store";
import { useAddToPlaylistModalStore } from "../../stores/add-to-playlist-modal.store";
import { formatDuration } from "../../lib/catalog.api";
import { ProceduralCover } from "./ProceduralCover";
import { MarqueeText } from "./MarqueeText";
import {
  SongActionMenu,
  type SongActionCustomItem,
} from "../player/SongActionMenu";
import {
  PlayIconSVG,
  PauseIconSVG,
  HeartIconSVG,
  LockIconSVG,
} from "../icons";
import type { PlayerTrack } from "../../types/player";

export interface SongRowArtistCredit {
  artistId: string;
  stageName: string;
  slug?: string;
  role?: string;
}

export interface SongRowProducerCredit {
  artistId: string;
  stageName: string;
  slug?: string;
  role?: string;
}

export type SongRowVariant =
  | "standard"
  | "album"
  | "playlist"
  | "artist"
  | "search";

export interface SongRowProps {
  track: PlayerTrack;
  index?: number;
  trackNumberDisplay?: number | string;
  variant?: SongRowVariant;

  // Contextual metadata
  playsCount?: number;
  addedByDisplayName?: string | null;
  scheduledReleaseAt?: string | null;
  primaryCredits?: SongRowArtistCredit[];
  featuredCredits?: SongRowArtistCredit[];
  producerCredits?: SongRowProducerCredit[];
  albumTitleOverride?: string | null;
  albumSlugOverride?: string | null;

  // Drag-and-drop (Playlist only)
  isDraggable?: boolean;
  isDragging?: boolean;
  onDragStart?: (index: number) => void;
  onDragOver?: (index: number) => void;
  onDragEnd?: () => void;
  onDrop?: (fromIndex: number, toIndex: number) => void;
  isDragOver?: boolean;

  // Playback callback (for album / playlist queue context)
  onPlay?: () => void;

  // Touch Swipe overrides
  disableSwipeLeft?: boolean;
  disableSwipeRight?: boolean;

  // Contextual actions
  hideGoToArtist?: boolean;
  hideGoToAlbum?: boolean;
  hideAddToPlaylist?: boolean;
  onRemoveFromPlaylist?: (track: PlayerTrack) => void;
  customActions?: SongActionCustomItem[];

  className?: string;
}

export const SongRow = memo(function SongRow({
  track,
  index = 0,
  trackNumberDisplay,
  variant = "standard",

  playsCount,
  addedByDisplayName,
  scheduledReleaseAt,
  primaryCredits = [],
  featuredCredits = [],
  producerCredits = [],
  albumTitleOverride,
  albumSlugOverride,

  isDraggable = false,
  isDragging = false,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  isDragOver = false,

  onPlay,

  disableSwipeLeft = false,
  disableSwipeRight = false,

  hideGoToArtist = false,
  hideGoToAlbum = false,
  hideAddToPlaylist = false,
  onRemoveFromPlaylist,
  customActions,

  className = "",
}: SongRowProps) {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const playbackStatus = usePlayerStore((s) => s.playbackStatus);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const addToQueue = usePlayerStore((s) => s.addToQueue);

  const likedSongIds = useLikesStore((s) => s.likedSongIds);
  const toggleSongLike = useLikesStore((s) => s.toggleSongLike);
  const { isAuthenticated } = useAuthStore();

  const isCurrentLoaded = currentTrack?.id === track.id;
  const isCurrentPlaying = isCurrentLoaded && playbackStatus === "playing";
  const isLiked = likedSongIds.has(track.id);
  const isScheduled = Boolean(
    scheduledReleaseAt && new Date(scheduledReleaseAt).getTime() > Date.now()
  );

  const isLocked = Boolean(track.isStreamable === false || isScheduled);

  // In playlist variant, user explicitly instructed:
  // "in playlist have only left swipe to add to queue"
  const canSwipeRight = !disableSwipeRight && variant !== "playlist";
  const canSwipeLeft = !disableSwipeLeft;

  // Touch & Pointer swipe gesture state
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [showQueuedBadge, setShowQueuedBadge] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchDirectionRef = useRef<"horizontal" | "vertical" | null>(null);
  const isPointerDownRef = useRef(false);

  const startSwipe = (clientX: number, clientY: number) => {
    touchStartRef.current = { x: clientX, y: clientY };
    touchDirectionRef.current = null;
    setIsSwiping(false);
  };

  const moveSwipe = (clientX: number, clientY: number, cancelEvent?: () => void) => {
    if (!touchStartRef.current) return;

    const deltaX = clientX - touchStartRef.current.x;
    const deltaY = clientY - touchStartRef.current.y;

    if (!touchDirectionRef.current) {
      if (Math.abs(deltaY) > 8 && Math.abs(deltaY) > Math.abs(deltaX)) {
        touchDirectionRef.current = "vertical";
        return;
      }
      if (Math.abs(deltaX) > 8 && Math.abs(deltaX) > Math.abs(deltaY)) {
        touchDirectionRef.current = "horizontal";
        setIsSwiping(true);
      }
    }

    if (touchDirectionRef.current === "horizontal") {
      cancelEvent?.();

      // Disallow right swipe if disabled or in playlist
      if (deltaX > 0 && !canSwipeRight) {
        setSwipeOffset(0);
        return;
      }
      if (deltaX < 0 && !canSwipeLeft) {
        setSwipeOffset(0);
        return;
      }

      // Elastic resistance damping
      const maxDrag = 110;
      const damped =
        Math.sign(deltaX) *
        Math.min(Math.abs(deltaX) * 0.75, maxDrag);
      setSwipeOffset(damped);
    }
  };

  const endSwipe = () => {
    if (touchDirectionRef.current === "horizontal") {
      // Swipe left threshold: Add to Queue
      if (swipeOffset < -45 && canSwipeLeft) {
        addToQueue(track);
        setShowQueuedBadge(true);
        setTimeout(() => setShowQueuedBadge(false), 1600);
      }
      // Swipe right threshold: Add to Playlist
      else if (swipeOffset > 45 && canSwipeRight) {
        useAddToPlaylistModalStore.getState().openModal(track);
      }
    }

    touchStartRef.current = null;
    touchDirectionRef.current = null;
    isPointerDownRef.current = false;
    setSwipeOffset(0);
    setIsSwiping(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    startSwipe(e.touches[0].clientX, e.touches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current || e.touches.length !== 1) return;
    moveSwipe(e.touches[0].clientX, e.touches[0].clientY, () => {
      if (e.cancelable) e.preventDefault();
    });
  };

  const handleTouchEnd = () => {
    endSwipe();
  };

  // Pointer event support for desktop mouse swipe testing
  const handlePointerDown = (e: React.PointerEvent) => {
    if (isDraggable || e.pointerType === "touch") return;
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input, [role='menu']")) return;
    isPointerDownRef.current = true;
    startSwipe(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isPointerDownRef.current || isDraggable || e.pointerType === "touch") return;
    moveSwipe(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isPointerDownRef.current || isDraggable || e.pointerType === "touch") return;
    endSwipe();
  };

  // Mobile Touch Reordering for Playlist Grip Handle (⋮⋮)
  const touchDragOverIdxRef = useRef<number | null>(null);

  const handleGripTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (!isDraggable) return;
    touchDragOverIdxRef.current = index;
    onDragStart?.(index);
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try {
        navigator.vibrate(25);
      } catch {}
    }
  };

  const handleGripTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (!isDraggable || e.touches.length !== 1) return;
    if (e.cancelable) {
      e.preventDefault();
    }
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const rowEl = el?.closest("[data-track-index]");
    if (rowEl) {
      const targetIdxAttr = rowEl.getAttribute("data-track-index");
      if (targetIdxAttr !== null) {
        const targetIdx = Number(targetIdxAttr);
        if (!isNaN(targetIdx) && targetIdx !== touchDragOverIdxRef.current) {
          touchDragOverIdxRef.current = targetIdx;
          onDragOver?.(targetIdx);
        }
      }
    }
  };

  const handleGripTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (!isDraggable) return;
    const targetIdx = touchDragOverIdxRef.current;
    if (targetIdx !== null && targetIdx !== undefined && targetIdx !== index) {
      onDrop?.(index, targetIdx);
    }
    touchDragOverIdxRef.current = null;
    onDragEnd?.();
  };

  const handleRowClick = (e: React.MouseEvent) => {
    // If was swiping horizontally, suppress click to play
    if (isSwiping || Math.abs(swipeOffset) > 10) return;

    // If clicking an interactive child element (button, link, input), let it handle its own event
    const target = e.target as HTMLElement;
    if (
      target.closest("button") ||
      target.closest("a") ||
      target.closest("input") ||
      target.closest('[role="menu"]')
    ) {
      return;
    }

    if (isLocked) return;

    if (onPlay) {
      onPlay();
    } else {
      if (isCurrentPlaying) {
        togglePlay();
      } else if (isCurrentLoaded) {
        togglePlay();
      } else {
        playTrack(track);
      }
    }
  };

  const handlePlayButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isLocked) return;
    if (onPlay) {
      onPlay();
    } else {
      if (isCurrentPlaying || isCurrentLoaded) {
        togglePlay();
      } else {
        playTrack(track);
      }
    }
  };

  const handleToggleLikeClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAuthenticated) {
      useAuthModalStore.getState().openAuthModal({
        category: "Favorites & Library",
        subtitle: "Library",
        title: "Save to your library.",
        description:
          "Sign in or create an account to like tracks and build your personal collection.",
      });
      return;
    }
    await toggleSongLike(track.id);
  };

  const albumTitle = albumTitleOverride || track.albumTitle;
  const albumSlug = albumSlugOverride || track.albumSlug || track.albumId;

  const showThumbnail =
    variant === "standard" ||
    variant === "playlist" ||
    variant === "search" ||
    (variant === "artist" && true);

  return (
    <div
      data-track-index={index}
      className={`relative overflow-hidden select-none touch-pan-y ${className}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Queued Feedback Banner */}
      {showQueuedBadge && (
        <div className="absolute inset-0 z-30 bg-blue/95 flex items-center justify-center gap-2 text-white font-mono text-xs uppercase tracking-wider animate-in fade-in duration-150">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className="w-4 h-4"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span className="font-bold">Added to Queue</span>
        </div>
      )}
      {/* ==================== SWIPE UNDERLAY BADGES ==================== */}
      {/* Swipe Left: Reveal "Add to Queue" (Blue accent on the right) */}
      {canSwipeLeft && (
        <div
          className={`absolute inset-y-0 right-0 w-24 bg-blue flex items-center justify-center gap-1.5 text-white font-mono text-[10px] uppercase tracking-wider transition-opacity ${
            swipeOffset < -20 ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className="w-4 h-4 shrink-0"
          >
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="16" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" strokeWidth="3" />
            <line x1="3" y1="12" x2="3.01" y2="12" strokeWidth="3" />
            <line x1="3" y1="18" x2="3.01" y2="18" strokeWidth="3" />
          </svg>
          <span className="font-semibold">+ Queue</span>
        </div>
      )}

      {/* Swipe Right: Reveal "Add to Playlist" (Emerald accent on the left) */}
      {canSwipeRight && (
        <div
          className={`absolute inset-y-0 left-0 w-28 bg-emerald-600 flex items-center justify-center gap-1.5 text-white font-mono text-[10px] uppercase tracking-wider transition-opacity ${
            swipeOffset > 20 ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className="w-4 h-4 shrink-0"
          >
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
          <span className="font-semibold">+ Playlist</span>
        </div>
      )}

      {/* ==================== FOREGROUND ROW CONTAINER ==================== */}
      <div
        data-track-index={index}
        onClick={handleRowClick}
        draggable={isDraggable}
        onDragStart={(e) => {
          if (!isDraggable) return;
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", String(index));
          onDragStart?.(index);
        }}
        onDragOver={(e) => {
          if (!isDraggable) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          onDragOver?.(index);
        }}
        onDragEnd={() => {
          onDragEnd?.();
        }}
        onDrop={(e) => {
          if (!isDraggable) return;
          e.preventDefault();
          const from = Number(e.dataTransfer.getData("text/plain"));
          if (!isNaN(from) && from !== index) {
            onDrop?.(from, index);
          }
          onDragEnd?.();
        }}
        style={{
          transform: `translateX(${swipeOffset}px)`,
          transition: isSwiping ? "none" : "transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        className={`relative z-10 px-3.5 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-3 bg-panel hover:bg-canvas-deep active:bg-canvas-deep/80 transition-colors group cursor-pointer ${
          isCurrentPlaying ? "bg-blue/5" : ""
        } ${isLocked ? "opacity-65" : ""} ${
          isDragging ? "opacity-40 border-2 border-dashed border-blue/40 scale-[0.99]" : ""
        } ${
          isDragOver ? "border-t-2 border-blue bg-blue/10 shadow-sm" : ""
        }`}
      >
        {/* ==================== LEFT SECTION ==================== */}
        <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1">
          {/* Drag Grip Handle (Playlist variant only) */}
          {variant === "playlist" && isDraggable && (
            <span
              className="cursor-grab active:cursor-grabbing text-ink-soft/50 hover:text-ink select-none font-mono text-xs px-1 opacity-70 group-hover:opacity-100 transition-all shrink-0 touch-none active:scale-125"
              title="Drag to reorder tracks"
              onClick={(e) => e.stopPropagation()}
              onTouchStart={handleGripTouchStart}
              onTouchMove={handleGripTouchMove}
              onTouchEnd={handleGripTouchEnd}
              onTouchCancel={handleGripTouchEnd}
            >
              ⋮⋮
            </span>
          )}

          {/* Leading Display: Thumbnail vs Track Number */}
          {showThumbnail ? (
            <div className="relative w-10 h-10 sm:w-11 sm:h-11 bg-canvas-deep border border-line rounded-xs overflow-hidden shrink-0 group/thumb">
              {track.coverImageUrl ? (
                <img
                  src={track.coverImageUrl}
                  alt=""
                  loading="lazy"
                  draggable={false}
                  className="w-full h-full object-cover pointer-events-none select-none"
                />
              ) : (
                <ProceduralCover
                  size="sm"
                  title={track.title}
                  artistName={track.artistName}
                  className="w-full h-full text-[10px]"
                />
              )}

              {/* Play / Pause Overlay on Hover or when Current */}
              <button
                type="button"
                onClick={handlePlayButtonClick}
                aria-label={isCurrentPlaying ? "Pause" : "Play"}
                className={`absolute inset-0 bg-ink/40 flex items-center justify-center transition-opacity cursor-pointer ${
                  isCurrentPlaying
                    ? "opacity-100"
                    : "opacity-0 group-hover:opacity-100 group-hover/thumb:opacity-100"
                }`}
              >
                {isLocked ? (
                  <LockIconSVG className="w-3.5 h-3.5 text-white" />
                ) : isCurrentPlaying ? (
                  <PauseIconSVG className="w-4 h-4 text-white" />
                ) : (
                  <PlayIconSVG className="w-4 h-4 text-white ml-0.5" />
                )}
              </button>
            </div>
          ) : (
            /* Track Number / Play button for Album & Non-thumbnail Views */
            <button
              type="button"
              onClick={handlePlayButtonClick}
              aria-label={isCurrentPlaying ? "Pause" : "Play"}
              className={`w-7 h-7 flex items-center justify-center shrink-0 ${
                isLocked
                  ? "text-ink-soft/50 cursor-not-allowed"
                  : "text-ink-soft group-hover:text-ink cursor-pointer"
              }`}
            >
              {isLocked ? (
                <LockIconSVG className="w-3.5 h-3.5 text-ink-soft/60" />
              ) : isCurrentPlaying ? (
                <PauseIconSVG className="w-3.5 h-3.5 text-blue animate-pulse" />
              ) : (
                <>
                  <span
                    className={`font-mono text-[11px] group-hover:hidden ${
                      isCurrentLoaded ? "text-blue font-bold" : ""
                    }`}
                  >
                    {String(trackNumberDisplay ?? index + 1).padStart(2, "0")}
                  </span>
                  <PlayIconSVG className="w-3.5 h-3.5 hidden group-hover:block text-ink ml-0.5" />
                </>
              )}
            </button>
          )}

          {/* Title & Credits Metadata */}
          <div className="min-w-0 flex-1 flex flex-col justify-center gap-0.5">
            {/* Title Line */}
            <div className="flex items-center gap-1.5 min-w-0">
              <MarqueeText
                className="min-w-0"
                innerClassName={`font-serif text-sm font-medium ${
                  isCurrentPlaying
                    ? "text-blue"
                    : isCurrentLoaded
                    ? "text-blue"
                    : "text-ink"
                }`}
              >
                {track.title}
              </MarqueeText>

              {isLocked && (
                <span
                  title="Locked track"
                  className="font-mono text-[8px] uppercase tracking-widest px-1.5 py-0.5 border border-line text-ink-soft bg-canvas shrink-0 flex items-center gap-1"
                >
                  <LockIconSVG className="w-2.5 h-2.5" />
                  <span>
                    {scheduledReleaseAt
                      ? `Releases ${new Date(scheduledReleaseAt).toLocaleDateString()}`
                      : "Locked"}
                  </span>
                </span>
              )}

              {track.isExplicit && (
                <span
                  title="Explicit Content"
                  className="font-mono text-[8px] font-semibold uppercase tracking-widest px-1 py-0.2 border border-line text-ink-soft bg-canvas shrink-0"
                >
                  E
                </span>
              )}
            </div>

            {/* Subtitle / Artist Credits Line */}
            {variant === "album" ? (
              <MarqueeText
                className="min-w-0 text-[11px] text-ink-soft"
                innerClassName="inline-flex items-center gap-1"
              >
                {/* Primary Artist(s) */}
                {primaryCredits.length > 0 ? (
                  primaryCredits.map((c, i) => (
                    <span key={c.artistId}>
                      {c.slug ? (
                        <Link
                          to="/artists/$idOrSlug"
                          params={{ idOrSlug: c.slug }}
                          onClick={(e) => e.stopPropagation()}
                          className="hover:text-ink hover:underline decoration-line transition-colors"
                        >
                          {c.stageName}
                        </Link>
                      ) : (
                        <span>{c.stageName}</span>
                      )}
                      {i < primaryCredits.length - 1 ? ", " : ""}
                    </span>
                  ))
                ) : track.artistSlug ? (
                  <Link
                    to="/artists/$idOrSlug"
                    params={{ idOrSlug: track.artistSlug }}
                    onClick={(e) => e.stopPropagation()}
                    className="hover:text-ink hover:underline decoration-line transition-colors"
                  >
                    {track.artistName}
                  </Link>
                ) : (
                  <span>{track.artistName || "Unknown Artist"}</span>
                )}

                {/* Featured Credits */}
                {featuredCredits.length > 0 && (
                  <>
                    <span className="text-ink-soft/70 font-mono text-[10px] ml-1">
                      feat.
                    </span>
                    {featuredCredits.map((c, i) => (
                      <span key={c.artistId}>
                        {c.slug ? (
                          <Link
                            to="/artists/$idOrSlug"
                            params={{ idOrSlug: c.slug }}
                            onClick={(e) => e.stopPropagation()}
                            className="hover:text-ink hover:underline decoration-line transition-colors"
                          >
                            {c.stageName}
                          </Link>
                        ) : (
                          <span>{c.stageName}</span>
                        )}
                        {i < featuredCredits.length - 1 ? ", " : ""}
                      </span>
                    ))}
                  </>
                )}

                {/* Producer Credits */}
                {producerCredits.length > 0 && (
                  <>
                    <span className="text-ink-soft/70 font-mono text-[10px] ml-1">
                      prod.
                    </span>
                    {producerCredits.map((c, i) => (
                      <span key={c.artistId}>
                        {c.slug ? (
                          <Link
                            to="/artists/$idOrSlug"
                            params={{ idOrSlug: c.slug }}
                            onClick={(e) => e.stopPropagation()}
                            className="hover:text-ink hover:underline decoration-line transition-colors"
                          >
                            {c.stageName}
                          </Link>
                        ) : (
                          <span>{c.stageName}</span>
                        )}
                        {i < producerCredits.length - 1 ? ", " : ""}
                      </span>
                    ))}
                  </>
                )}
              </MarqueeText>
            ) : (
              /* Standard / Playlist / Search / Artist Artist Subtitle */
              <div className="font-mono text-[10.5px] text-ink-soft truncate flex items-center gap-1.5">
                {track.artistSlug ? (
                  <Link
                    to="/artists/$idOrSlug"
                    params={{ idOrSlug: track.artistSlug }}
                    onClick={(e) => e.stopPropagation()}
                    className="hover:text-ink hover:underline decoration-line transition-colors truncate"
                  >
                    {track.artistName || "Unknown Artist"}
                  </Link>
                ) : (
                  <span className="truncate">{track.artistName || "Unknown Artist"}</span>
                )}

                {albumTitle && (
                  <>
                    <span className="opacity-40">•</span>
                    {albumSlug ? (
                      <Link
                        to="/albums/$idOrSlug"
                        params={{ idOrSlug: albumSlug }}
                        onClick={(e) => e.stopPropagation()}
                        className="hover:text-ink hover:underline decoration-line transition-colors truncate hidden sm:inline"
                      >
                        {albumTitle}
                      </Link>
                    ) : (
                      <span className="truncate hidden sm:inline">{albumTitle}</span>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ==================== MIDDLE SECTION ==================== */}
        {/* Plays count (for Artist top tracks or Album stream count) */}
        {playsCount !== undefined && (
          <div className="hidden sm:block text-right font-mono text-xs text-ink-soft shrink-0 w-24">
            {playsCount.toLocaleString()}
          </div>
        )}

        {/* Added by (for Collaborative Playlists) */}
        {addedByDisplayName && (
          <div className="hidden md:block text-right font-mono text-[10.5px] text-ink-soft/70 shrink-0 max-w-[140px] truncate">
            Added by {addedByDisplayName}
          </div>
        )}

        {/* ==================== RIGHT SECTION ==================== */}
        <div className="flex items-center justify-end gap-1.5 sm:gap-3 shrink-0">
          {/* Duration (Hidden on extra small mobile screens for compact density) */}
          <span className="hidden sm:inline-block font-mono text-[10.5px] text-ink-soft text-right w-11">
            {formatDuration(track.durationSeconds || 0)}
          </span>

          {/* Action Menu (3-dots button) */}
          <div onClick={(e) => e.stopPropagation()}>
            <SongActionMenu
              track={track}
              isLocked={isLocked}
              isScheduled={isScheduled}
              hideGoToArtist={hideGoToArtist}
              hideGoToAlbum={hideGoToAlbum}
              hideAddToPlaylist={hideAddToPlaylist}
              onRemoveFromPlaylist={onRemoveFromPlaylist}
              customActions={customActions}
            />
          </div>

          {/* Like Heart Button (Only shown on live/released tracks, hidden for scheduled releases) */}
          {!isScheduled && (
            <button
              type="button"
              onClick={handleToggleLikeClick}
              aria-label={isLiked ? "Unlike track" : "Like track"}
              className="p-1 sm:p-1.5 cursor-pointer hover:scale-110 active:scale-95 transition-transform"
            >
              <HeartIconSVG
                filled={isLiked}
                className={`w-3.5 h-3.5 transition-colors ${
                  isLiked
                    ? "text-red-500 fill-current"
                    : "text-ink-soft/40 hover:text-ink opacity-0 group-hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                }`}
              />
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
