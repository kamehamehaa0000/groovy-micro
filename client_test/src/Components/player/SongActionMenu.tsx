import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { usePlayerStore } from "../../stores/player.store";
import { useJamStore } from "../../stores/jam.store";
import { useAuthStore } from "../../stores/auth.store";
import { useLikesStore } from "../../stores/likes.store";
import { useAuthModalStore } from "../../stores/auth-modal.store";
import { useAddToPlaylistModalStore } from "../../stores/add-to-playlist-modal.store";
import type { PlayerTrack } from "../../types/player";
import { ProceduralCover } from "../common/ProceduralCover";
import { PlayIconSVG, HeartIconSVG, DiscIconSVG } from "../icons";

export interface SongActionCustomItem {
  label: string;
  icon?: React.ReactNode;
  onClick: (track: PlayerTrack) => void;
  danger?: boolean;
}

export interface SongActionMenuProps {
  track: PlayerTrack;
  buttonClassName?: string;
  align?: "left" | "right";
  isLocked?: boolean;
  isScheduled?: boolean;
  hideLike?: boolean;
  hideGoToArtist?: boolean;
  hideGoToAlbum?: boolean;
  hideAddToPlaylist?: boolean;
  onRemoveFromPlaylist?: (track: PlayerTrack) => void;
  customActions?: SongActionCustomItem[];
}

export function SongActionMenu({
  track,
  buttonClassName = "p-2 sm:p-1.5 text-ink-soft hover:text-ink transition-colors cursor-pointer rounded flex items-center justify-center",
  align = "right",
  isLocked: propIsLocked,
  isScheduled: propIsScheduled,
  hideLike = false,
  hideGoToArtist = false,
  hideGoToAlbum = false,
  hideAddToPlaylist = false,
  onRemoveFromPlaylist,
  customActions,
}: SongActionMenuProps) {
  const isScheduled = Boolean(
    propIsScheduled ||
      ((track as any).scheduledReleaseAt &&
        new Date((track as any).scheduledReleaseAt).getTime() > Date.now())
  );
  const isLocked = Boolean(propIsLocked || track.isStreamable === false || isScheduled);
  const shouldHideLike = Boolean(hideLike || isScheduled);
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{
    top: number;
    left: number;
    openUp: boolean;
  } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

  const playNext = usePlayerStore((s) => s.playNext);
  const addToQueue = usePlayerStore((s) => s.addToQueue);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const activeJamRoom = useJamStore((s) => s.activeRoom);
  const addToJamQueue = useJamStore((s) => s.addToJamQueue);
  const { isAuthenticated } = useAuthStore();
  const likedSongIds = useLikesStore((s) => s.likedSongIds);
  const toggleSongLike = useLikesStore((s) => s.toggleSongLike);

  const isLiked = likedSongIds.has(track.id);

  // Measure and position dropdown relative to viewport
  const updatePosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < 280 && rect.top > 280;
    const menuWidth = 208; // 13rem = w-52
    let left = align === "right" ? rect.right - menuWidth : rect.left;
    left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));
    const top = openUp ? rect.top - 6 : rect.bottom + 6;
    setDropdownPos({ top, left, openUp });
  };

  // Close dropdown on outside click or Escape key, and reposition on resize/scroll
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        buttonRef.current &&
        !buttonRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        sheetRef.current &&
        !sheetRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    const handleScrollOrResize = () => {
      // Reposition on desktop, or close if button scrolls off screen
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        if (rect.top < -50 || rect.bottom > window.innerHeight + 50) {
          setIsOpen(false);
        } else {
          updatePosition();
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [isOpen, align]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2200);
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOpen) {
      updatePosition();
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  const handlePlayNow = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isLocked) return;
    setIsOpen(false);
    playTrack(track);
  };

  const handlePlayNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isLocked) return;
    setIsOpen(false);
    playNext(track);
    showToast("Playing next in queue");
  };

  const handleAddToQueue = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isLocked) return;
    setIsOpen(false);
    addToQueue(track);
    showToast("Added to queue");
  };

  const handleAddToJam = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    addToJamQueue({
      id: track.id,
      title: track.title,
      artistId: track.artistId,
      artistName: track.artistName,
      artistSlug: track.artistSlug,
      albumId: track.albumId,
      albumTitle: track.albumTitle,
      albumSlug: track.albumSlug,
      duration: track.durationSeconds || 0,
      artworkUrl: track.coverImageUrl,
      audioUrl: track.audioUrl,
      hlsManifestUrl: track.hlsManifestUrl,
      rawAudioKey: track.rawAudioKey,
    });
    showToast("Added to Live Jam queue!");
  };

  const handleToggleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAuthenticated) {
      useAuthModalStore.getState().openAuthModal({
        category: "Favorites & Library",
        subtitle: "Library",
        title: "Save to your library.",
        description: "Sign in or create an account to like tracks and build your library.",
      });
      setIsOpen(false);
      return;
    }
    try {
      await toggleSongLike(track.id);
      showToast(isLiked ? "Removed from Liked Songs" : "Saved to Liked Songs");
    } catch {
      showToast("Failed to update like status");
    }
    setIsOpen(false);
  };

  const handleOpenPlaylistModal = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    useAddToPlaylistModalStore.getState().openModal(track);
  };

  const handleRemoveFromPlaylist = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    onRemoveFromPlaylist?.(track);
  };

  const handleGoToArtist = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    if (track.artistSlug || track.artistId) {
      navigate({
        to: "/artists/$idOrSlug",
        params: { idOrSlug: track.artistSlug || track.artistId },
      });
    }
  };

  const handleGoToAlbum = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    const target = track.albumSlug || track.albumId;
    if (target) {
      navigate({
        to: "/albums/$idOrSlug",
        params: { idOrSlug: target },
      });
    }
  };

  const handleShareTrack = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    if (typeof window !== "undefined") {
      let shareUrl = window.location.href;
      if (track.albumSlug || track.albumId) {
        shareUrl = `${window.location.origin}/albums/${track.albumSlug || track.albumId}`;
      }
      navigator.clipboard.writeText(shareUrl);
      showToast("Track link copied to clipboard");
    }
  };

  const canUsePortal = typeof document !== "undefined";

  return (
    <>
      {/* 3-Dots Trigger Button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        aria-label="Track options"
        className={buttonClassName}
        title="More options"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </button>

      {/* ==================== DESKTOP FLOATING DROPDOWN VIA PORTAL ==================== */}
      {isOpen &&
        dropdownPos &&
        canUsePortal &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: "fixed",
              top: dropdownPos.openUp ? undefined : `${dropdownPos.top}px`,
              bottom: dropdownPos.openUp
                ? `${window.innerHeight - dropdownPos.top}px`
                : undefined,
              left: `${dropdownPos.left}px`,
              zIndex: 99999,
            }}
            className="hidden sm:block w-52 border border-line bg-panel shadow-2xl py-1 divide-y divide-line/40 rounded-sm font-sans text-xs animate-in fade-in zoom-in-95 duration-100"
            onClick={(e) => e.stopPropagation()}
          >
            {!isLocked && (
              <div className="py-1">
                <button
                  type="button"
                  onClick={handlePlayNow}
                  className="w-full text-left px-3.5 py-2 hover:bg-canvas-deep flex items-center gap-2.5 text-ink cursor-pointer"
                >
                  <PlayIconSVG className="w-3.5 h-3.5 text-blue shrink-0" />
                  <span>Play Now</span>
                </button>
                <button
                  type="button"
                  onClick={handlePlayNext}
                  className="w-full text-left px-3.5 py-2 hover:bg-canvas-deep flex items-center gap-2.5 text-ink cursor-pointer"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="w-3.5 h-3.5 text-ink-soft shrink-0"
                  >
                    <polygon points="5 4 15 12 5 20 5 4" fill="currentColor" />
                    <line x1="19" y1="5" x2="19" y2="19" strokeWidth="2.5" />
                  </svg>
                  <span>Play Next</span>
                </button>
                <button
                  type="button"
                  onClick={handleAddToQueue}
                  className="w-full text-left px-3.5 py-2 hover:bg-canvas-deep flex items-center gap-2.5 text-ink cursor-pointer"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="w-3.5 h-3.5 text-ink-soft shrink-0"
                  >
                    <line x1="8" y1="6" x2="21" y2="6" />
                    <line x1="8" y1="12" x2="21" y2="12" />
                    <line x1="8" y1="18" x2="16" y2="18" />
                    <line x1="3" y1="6" x2="3.01" y2="6" strokeWidth="3" />
                    <line x1="3" y1="12" x2="3.01" y2="12" strokeWidth="3" />
                    <line x1="3" y1="18" x2="3.01" y2="18" strokeWidth="3" />
                  </svg>
                  <span>Add to Queue</span>
                </button>
                {activeJamRoom && (
                  <button
                    type="button"
                    onClick={handleAddToJam}
                    className="w-full text-left px-3.5 py-2 hover:bg-emerald-500/10 flex items-center gap-2.5 text-emerald-700 dark:text-emerald-400 font-medium cursor-pointer"
                  >
                    <span className="text-sm shrink-0">🎧</span>
                    <span>Add to Jam Queue</span>
                  </button>
                )}
              </div>
            )}

            <div className="py-1">
            {!shouldHideLike && (
              <button
                type="button"
                onClick={handleToggleLike}
                className="w-full text-left px-3.5 py-2 hover:bg-canvas-deep flex items-center gap-2.5 text-ink cursor-pointer"
              >
                <HeartIconSVG
                  filled={isLiked}
                  className={`w-3.5 h-3.5 shrink-0 ${
                    isLiked ? "text-red-500 fill-current" : "text-ink-soft"
                  }`}
                />
                <span>{isLiked ? "Remove from Liked" : "Save to Liked Songs"}</span>
              </button>
            )}
              {!hideAddToPlaylist && (
                <button
                  type="button"
                  onClick={handleOpenPlaylistModal}
                  className="w-full text-left px-3.5 py-2 hover:bg-canvas-deep flex items-center gap-2.5 text-ink cursor-pointer"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="w-3.5 h-3.5 text-ink-soft shrink-0"
                  >
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                  </svg>
                  <span>Add to Playlist...</span>
                </button>
              )}
              {onRemoveFromPlaylist && (
                <button
                  type="button"
                  onClick={handleRemoveFromPlaylist}
                  className="w-full text-left px-3.5 py-2 hover:bg-red-500/10 flex items-center gap-2.5 text-red-500 cursor-pointer"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="w-3.5 h-3.5 text-red-500 shrink-0"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <line x1="10" y1="11" x2="10" y2="17" />
                    <line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                  <span>Remove from Playlist</span>
                </button>
              )}
              {customActions?.map((act, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(false);
                    act.onClick(track);
                  }}
                  className={`w-full text-left px-3.5 py-2 flex items-center gap-2.5 cursor-pointer ${
                    act.danger
                      ? "text-red-500 hover:bg-red-500/10"
                      : "text-ink hover:bg-canvas-deep"
                  }`}
                >
                  {act.icon && (
                    <span className="w-3.5 h-3.5 shrink-0 flex items-center justify-center">
                      {act.icon}
                    </span>
                  )}
                  <span className="truncate">{act.label}</span>
                </button>
              ))}
            </div>

            <div className="py-1">
              {!hideGoToArtist && (track.artistSlug || track.artistId) && (
                <button
                  type="button"
                  onClick={handleGoToArtist}
                  className="w-full text-left px-3.5 py-2 hover:bg-canvas-deep flex items-center gap-2.5 text-ink cursor-pointer truncate"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="w-3.5 h-3.5 text-ink-soft shrink-0"
                  >
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  <span className="truncate">Go to Artist</span>
                </button>
              )}
              {!hideGoToAlbum && (track.albumSlug || track.albumId) && (
                <button
                  type="button"
                  onClick={handleGoToAlbum}
                  className="w-full text-left px-3.5 py-2 hover:bg-canvas-deep flex items-center gap-2.5 text-ink cursor-pointer truncate"
                >
                  <DiscIconSVG className="w-3.5 h-3.5 text-ink-soft shrink-0" />
                  <span className="truncate">Go to Release</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleShareTrack}
                className="w-full text-left px-3.5 py-2 hover:bg-canvas-deep flex items-center gap-2.5 text-ink cursor-pointer"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="w-3.5 h-3.5 text-ink-soft shrink-0"
                >
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
                <span>Share Track</span>
              </button>
            </div>
          </div>,
          document.body
        )}

      {/* ==================== MOBILE BOTTOM SHEET VIA PORTAL ==================== */}
      {isOpen &&
        canUsePortal &&
        createPortal(
          <div
            ref={sheetRef}
            style={{ zIndex: 999999 }}
            className="sm:hidden fixed inset-0 flex flex-col justify-end"
            role="dialog"
            aria-modal="true"
          >
            {/* Dimmed backdrop */}
            <div
              className="fixed inset-0 bg-ink/60 backdrop-blur-xs animate-in fade-in duration-200 cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
              }}
            />

            {/* Slide-up Sheet */}
            <div
              className="relative z-10 w-full max-h-[85vh] bg-panel border-t border-line shadow-2xl rounded-t-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200 pb-safe"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Grab indicator */}
              <div className="pt-3 pb-1 flex justify-center">
                <div className="w-10 h-1 bg-ink-soft/30 rounded-full" />
              </div>

              {/* Track context header */}
              <div className="px-5 py-3 flex items-center gap-3.5 border-b border-line/60">
                <div className="w-12 h-12 bg-canvas-deep border border-line rounded overflow-hidden shrink-0">
                  {track.coverImageUrl ? (
                    <img
                      src={track.coverImageUrl}
                      alt={track.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ProceduralCover
                      size="sm"
                      title={track.title}
                      artistName={track.artistName}
                      className="w-full h-full text-xs"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-serif italic text-base text-ink font-medium truncate">
                    {track.title}
                  </p>
                  <p className="font-sans text-xs text-ink-soft truncate">
                    {track.artistName || "Unknown Artist"}
                  </p>
                </div>
              </div>

              {/* Action rows */}
              <div className="overflow-y-auto max-h-[55vh] py-1 divide-y divide-line/30 font-sans text-sm">
                <div className="py-1">
                  {!shouldHideLike && (
                    <button
                      type="button"
                      onClick={handleToggleLike}
                      className="w-full h-12 px-5 flex items-center gap-3.5 text-ink hover:bg-canvas-deep active:bg-canvas-deep transition-colors text-left cursor-pointer"
                    >
                      <HeartIconSVG
                        filled={isLiked}
                        className={`w-5 h-5 shrink-0 ${
                          isLiked ? "text-red-500 fill-current" : "text-ink-soft"
                        }`}
                      />
                      <span className="font-medium">
                        {isLiked ? "Remove from Liked Songs" : "Save to Your Library"}
                      </span>
                    </button>
                  )}

                  {!isLocked && (
                    <>
                      <button
                        type="button"
                        onClick={handlePlayNow}
                        className="w-full h-12 px-5 flex items-center gap-3.5 text-ink hover:bg-canvas-deep active:bg-canvas-deep transition-colors text-left cursor-pointer"
                      >
                        <PlayIconSVG className="w-5 h-5 text-blue shrink-0" />
                        <span>Play Now</span>
                      </button>
                      <button
                        type="button"
                        onClick={handlePlayNext}
                        className="w-full h-12 px-5 flex items-center gap-3.5 text-ink hover:bg-canvas-deep active:bg-canvas-deep transition-colors text-left cursor-pointer"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          className="w-5 h-5 text-ink-soft shrink-0"
                        >
                          <polygon points="5 4 15 12 5 20 5 4" fill="currentColor" />
                          <line x1="19" y1="5" x2="19" y2="19" strokeWidth="2.5" />
                        </svg>
                        <span>Play Next</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleAddToQueue}
                        className="w-full h-12 px-5 flex items-center gap-3.5 text-ink hover:bg-canvas-deep active:bg-canvas-deep transition-colors text-left cursor-pointer"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          className="w-5 h-5 text-ink-soft shrink-0"
                        >
                          <line x1="8" y1="6" x2="21" y2="6" />
                          <line x1="8" y1="12" x2="21" y2="12" />
                          <line x1="8" y1="18" x2="16" y2="18" />
                          <line x1="3" y1="6" x2="3.01" y2="6" strokeWidth="3" />
                          <line x1="3" y1="12" x2="3.01" y2="12" strokeWidth="3" />
                          <line x1="3" y1="18" x2="3.01" y2="18" strokeWidth="3" />
                        </svg>
                        <span>Add to Queue</span>
                      </button>
                      {activeJamRoom && (
                        <button
                          type="button"
                          onClick={handleAddToJam}
                          className="w-full h-12 px-5 flex items-center gap-3.5 text-emerald-600 dark:text-emerald-400 font-medium hover:bg-emerald-500/10 active:bg-emerald-500/10 transition-colors text-left cursor-pointer"
                        >
                          <span className="text-base shrink-0">🎧</span>
                          <span>Add to Jam Queue</span>
                        </button>
                      )}
                    </>
                  )}
                </div>

                <div className="py-1">
                  {!hideAddToPlaylist && (
                    <button
                      type="button"
                      onClick={handleOpenPlaylistModal}
                      className="w-full h-12 px-5 flex items-center gap-3.5 text-ink hover:bg-canvas-deep active:bg-canvas-deep transition-colors text-left cursor-pointer"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="w-5 h-5 text-ink-soft shrink-0"
                      >
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                      </svg>
                      <span>Add to Playlist...</span>
                    </button>
                  )}
                  {onRemoveFromPlaylist && (
                    <button
                      type="button"
                      onClick={handleRemoveFromPlaylist}
                      className="w-full h-12 px-5 flex items-center gap-3.5 text-red-500 hover:bg-red-500/10 active:bg-red-500/10 transition-colors text-left cursor-pointer"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="w-5 h-5 text-red-500 shrink-0"
                      >
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <line x1="10" y1="11" x2="10" y2="17" />
                        <line x1="14" y1="11" x2="14" y2="17" />
                      </svg>
                      <span>Remove from this Playlist</span>
                    </button>
                  )}
                  {customActions?.map((act, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsOpen(false);
                        act.onClick(track);
                      }}
                      className={`w-full h-12 px-5 flex items-center gap-3.5 text-left cursor-pointer ${
                        act.danger
                          ? "text-red-500 hover:bg-red-500/10 active:bg-red-500/10"
                          : "text-ink hover:bg-canvas-deep active:bg-canvas-deep"
                      }`}
                    >
                      {act.icon && (
                        <span className="w-5 h-5 shrink-0 flex items-center justify-center">
                          {act.icon}
                        </span>
                      )}
                      <span className="truncate">{act.label}</span>
                    </button>
                  ))}
                </div>

                <div className="py-1">
                  {!hideGoToArtist && (track.artistSlug || track.artistId) && (
                    <button
                      type="button"
                      onClick={handleGoToArtist}
                      className="w-full h-12 px-5 flex items-center gap-3.5 text-ink hover:bg-canvas-deep active:bg-canvas-deep transition-colors text-left cursor-pointer"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="w-5 h-5 text-ink-soft shrink-0"
                      >
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                      <span className="truncate">Go to Artist</span>
                    </button>
                  )}
                  {!hideGoToAlbum && (track.albumSlug || track.albumId) && (
                    <button
                      type="button"
                      onClick={handleGoToAlbum}
                      className="w-full h-12 px-5 flex items-center gap-3.5 text-ink hover:bg-canvas-deep active:bg-canvas-deep transition-colors text-left cursor-pointer"
                    >
                      <DiscIconSVG className="w-5 h-5 text-ink-soft shrink-0" />
                      <span className="truncate">Go to Release</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleShareTrack}
                    className="w-full h-12 px-5 flex items-center gap-3.5 text-ink hover:bg-canvas-deep active:bg-canvas-deep transition-colors text-left cursor-pointer"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="w-5 h-5 text-ink-soft shrink-0"
                    >
                      <circle cx="18" cy="5" r="3" />
                      <circle cx="6" cy="12" r="3" />
                      <circle cx="18" cy="19" r="3" />
                      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                    </svg>
                    <span>Share Track</span>
                  </button>
                </div>
              </div>

              {/* Close button */}
              <div className="p-3 border-t border-line/60 bg-canvas/40">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(false);
                  }}
                  className="w-full py-3 text-center font-mono text-xs uppercase tracking-wider text-ink-soft hover:text-ink bg-panel border border-line rounded cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Visual Feedback Toast */}
      {toastMessage &&
        canUsePortal &&
        createPortal(
          <div
            style={{ zIndex: 9999999 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 font-mono text-[11px] uppercase tracking-wider py-2 px-4 bg-ink text-canvas shadow-xl rounded-md pointer-events-none animate-in fade-in duration-150"
          >
            ✓ {toastMessage}
          </div>,
          document.body
        )}
    </>
  );
}
