import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { usePlayerStore } from "../../stores/player.store";
import { useLikesStore } from "../../stores/likes.store";
import { useFollowsStore } from "../../stores/follows.store";
import { useAuthStore } from "../../stores/auth.store";
import { useAuthModalStore } from "../../stores/auth-modal.store";
import { useJamStore } from "../../stores/jam.store";
import { artistsApi } from "../../lib/artists.api";
import {
  navigateToArtist,
  navigateToRelease,
  useResolvedTrackCredits,
} from "../../lib/artist-resolver";
import type { ArtistProfile } from "../../types/artist";
import { SongActionMenu } from "./SongActionMenu";
import {
  ChevronDownIconSVG,
  HeartIconSVG,
  PlayIconSVG,
  PauseIconSVG,
  VerifiedBadgeSVG,
} from "../icons";

function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

export function MobileExpandedPlayer() {
  const navigate = useNavigate();
  const isExpanded = usePlayerStore((s) => s.isNowPlayingExpanded);
  const setNowPlayingExpanded = usePlayerStore((s) => s.setNowPlayingExpanded);

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const playbackStatus = usePlayerStore((s) => s.playbackStatus);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const isShuffle = usePlayerStore((s) => s.isShuffle);
  const repeatMode = usePlayerStore((s) => s.repeatMode);
  const streamQuality = usePlayerStore((s) => s.streamQuality);
  const streamFormat = usePlayerStore((s) => s.streamFormat);
  const contextTitle = usePlayerStore((s) => s.contextTitle);
  const userQueue = usePlayerStore((s) => s.userQueue);
  const contextQueue = usePlayerStore((s) => s.contextQueue);
  const contextIndex = usePlayerStore((s) => s.contextIndex);

  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const next = usePlayerStore((s) => s.next);
  const previous = usePlayerStore((s) => s.previous);
  const seek = usePlayerStore((s) => s.seek);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const toggleRepeat = usePlayerStore((s) => s.toggleRepeat);
  const toggleQueueDrawer = usePlayerStore((s) => s.toggleQueueDrawer);

  // Jam Store
  const activeRoom = useJamStore((s) => s.activeRoom);
  const isHost = useJamStore((s) => s.isHost);
  const members = useJamStore((s) => s.members);
  const leaveRoom = useJamStore((s) => s.leaveRoom);
  const openJamModal = useJamStore((s) => s.openModal);

  // Likes & Follows
  const likedSongIds = useLikesStore((s) => s.likedSongIds);
  const toggleSongLike = useLikesStore((s) => s.toggleSongLike);
  const followedArtistIds = useFollowsStore((s) => s.followedArtistIds);
  const toggleFollow = useFollowsStore((s) => s.toggleFollow);
  const { isAuthenticated } = useAuthStore();
  const { openAuthModal } = useAuthModalStore();

  // Artist info state for "About the Artist" card
  const [artistDetails, setArtistDetails] = useState<ArtistProfile | null>(null);
  const [isFollowLoading, setIsFollowLoading] = useState(false);
  const [jamCopied, setJamCopied] = useState(false);

  // Scrubber drag state
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubPosition, setScrubPosition] = useState(0);
  const scrubBarRef = useRef<HTMLDivElement | null>(null);

  // Touch gesture state for fluid pull-down dismissal
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const touchStartRef = useRef<{ y: number; time: number; targetIsTop: boolean } | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Lock body scroll when open
  useEffect(() => {
    if (!isExpanded) {
      setDragY(0);
      setIsClosing(false);
      return;
    }
    const origOverflow = document.body.style.overflow;
    const origTouchAction = document.body.style.touchAction;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    return () => {
      document.body.style.overflow = origOverflow;
      document.body.style.touchAction = origTouchAction;
    };
  }, [isExpanded]);

  // Fetch artist details when track changes
  useEffect(() => {
    if (!currentTrack?.artistId && !currentTrack?.artistSlug) {
      setArtistDetails(null);
      return;
    }
    let isCancelled = false;
    const identifier = currentTrack.artistSlug || currentTrack.artistId;
    artistsApi
      .getByIdOrSlug(identifier)
      .then((profile) => {
        if (!isCancelled && profile) {
          setArtistDetails(profile);
        }
      })
      .catch(() => {
        if (!isCancelled) setArtistDetails(null);
      });

    return () => {
      isCancelled = true;
    };
  }, [currentTrack?.artistId, currentTrack?.artistSlug]);

  const resolvedCredits = useResolvedTrackCredits(currentTrack);

  if (!isExpanded && !isClosing) return null;
  if (!currentTrack) return null;

  const isPlaying = playbackStatus === "playing";
  const isLoading = playbackStatus === "loading";
  const isLiked = likedSongIds.has(currentTrack.id);
  const isFollowing = artistDetails ? followedArtistIds.has(artistDetails.id) : false;
  const parsedCredits = resolvedCredits;

  // Next track preview
  const nextTrack = userQueue.length > 0 ? userQueue[0] : contextQueue[contextIndex + 1] || null;

  const displayTime = isScrubbing ? scrubPosition : currentTime;
  const progressPercent = duration > 0 ? Math.min(100, (displayTime / duration) * 100) : 0;

  // Touch Drag-to-Dismiss Handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const scrollContainer = scrollContainerRef.current;
    const isAtTop = !scrollContainer || scrollContainer.scrollTop <= 2;
    touchStartRef.current = {
      y: e.touches[0].clientY,
      time: Date.now(),
      targetIsTop: isAtTop,
    };
    setIsDragging(false);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const currentY = e.touches[0].clientY;
    const deltaY = currentY - touchStartRef.current.y;

    // Only allow pull-down if starting from the top of the scroll container
    if (touchStartRef.current.targetIsTop && deltaY > 0) {
      setIsDragging(true);
      if (e.cancelable) e.preventDefault();
      // Elastic damping
      const damped = deltaY > 200 ? 200 + (deltaY - 200) * 0.4 : deltaY;
      setDragY(damped);
    }
  };

  const handleTouchEnd = () => {
    if (!touchStartRef.current) return;
    const elapsed = Date.now() - touchStartRef.current.time;
    const velocity = dragY / Math.max(elapsed, 1);

    touchStartRef.current = null;
    setIsDragging(false);

    // If dragged past 85px or flicked quickly downward, dismiss smoothly
    if (dragY > 85 || (velocity > 0.4 && dragY > 30)) {
      triggerDismiss();
    } else {
      // Snap back to top
      setDragY(0);
    }
  };

  const triggerDismiss = () => {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(10);
    }
    setIsClosing(true);
    setDragY(window.innerHeight);
    setTimeout(() => {
      setNowPlayingExpanded(false);
      setIsClosing(false);
      setDragY(0);
    }, 280);
  };

  // Scrubber Touch & Mouse Handlers
  const handleScrubStart = (clientX: number) => {
    if (!scrubBarRef.current || duration <= 0) return;
    setIsScrubbing(true);
    const rect = scrubBarRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setScrubPosition(ratio * duration);
  };

  const handleScrubMove = (clientX: number) => {
    if (!isScrubbing || !scrubBarRef.current || duration <= 0) return;
    const rect = scrubBarRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setScrubPosition(ratio * duration);
  };

  const handleScrubEnd = () => {
    if (!isScrubbing) return;
    seek(scrubPosition);
    setIsScrubbing(false);
  };

  const handleToggleLike = async () => {
    if (!isAuthenticated) {
      openAuthModal();
      return;
    }
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(12);
    }
    await toggleSongLike(currentTrack.id);
  };

  const handleToggleFollow = async () => {
    if (!artistDetails) return;
    if (!isAuthenticated) {
      openAuthModal();
      return;
    }
    setIsFollowLoading(true);
    try {
      await toggleFollow(artistDetails.id);
    } finally {
      setIsFollowLoading(false);
    }
  };

  const handleToggleArtistFollow = async (artistId: string) => {
    if (!isAuthenticated) {
      openAuthModal();
      return;
    }
    setIsFollowLoading(true);
    try {
      await toggleFollow(artistId);
    } finally {
      setIsFollowLoading(false);
    }
  };

  const handleCopyJamLink = () => {
    if (!activeRoom) return;
    const url = `${window.location.origin}/jam/${activeRoom.roomCode}`;
    navigator.clipboard.writeText(url);
    setJamCopied(true);
    setTimeout(() => setJamCopied(false), 2000);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Now Playing View"
      className="fixed inset-0 z-50 bg-canvas text-ink flex flex-col md:hidden select-none overflow-hidden"
      style={{
        transform: `translateY(${dragY}px)`,
        transition: isDragging
          ? "none"
          : "transform 0.28s cubic-bezier(0.2, 0.9, 0.3, 1)",
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Dynamic Ambient Background Tint */}
      <div className="absolute inset-0 bg-gradient-to-b from-panel via-canvas to-canvas pointer-events-none opacity-60" />

      {/* ===================== TOP HEADER & DRAG HANDLE ===================== */}
      <div className="relative z-10 shrink-0 px-4 pt-3 pb-2 flex flex-col items-center">
        {/* Subtle Pill Handle */}
        <div className="w-10 h-1 bg-line/60 rounded-full mb-3" />

        <div className="w-full flex items-center justify-between">
          {/* Collapse Chevron Button */}
          <button
            type="button"
            onClick={triggerDismiss}
            aria-label="Collapse Player"
            className="w-10 h-10 -ml-2 rounded-full flex items-center justify-center text-ink-soft hover:text-ink active:scale-90 transition-transform cursor-pointer"
          >
            <ChevronDownIconSVG className="w-6 h-6" />
          </button>

          {/* Context Title */}
          <button
            type="button"
            onClick={() =>
              navigateToRelease(currentTrack, navigate, () =>
                setNowPlayingExpanded(false)
              )
            }
            className="flex-1 min-w-0 px-2 text-center cursor-pointer group"
          >
            <span className="block font-mono text-[9px] uppercase tracking-[0.2em] text-ink-soft truncate group-hover:text-ink transition-colors">
              {contextTitle
                ? `Playing From ${contextTitle}`
                : currentTrack.albumTitle
                ? `Playing From Album`
                : "Groovy Catalog"}
            </span>
            <span className="block font-semibold text-xs text-ink truncate mt-0.5 group-hover:underline">
              {contextTitle || currentTrack.albumTitle || "Master Stream"}
            </span>
          </button>

          {/* 3-Dots Action Menu */}
          <div className="w-10 h-10 -mr-2 flex items-center justify-end">
            <SongActionMenu track={currentTrack} align="right" />
          </div>
        </div>
      </div>

      {/* ===================== SCROLLABLE CONTENT BODY ===================== */}
      <div
        ref={scrollContainerRef}
        className="relative z-10 flex-1 overflow-y-auto overflow-x-hidden px-6 pt-2 pb-12 space-y-6 no-scrollbar"
      >
        {/* Large 1:1 Album Artwork */}
        <button
          type="button"
          onClick={() =>
            navigateToRelease(currentTrack, navigate, () =>
              setNowPlayingExpanded(false)
            )
          }
          className="w-full max-w-[340px] aspect-square mx-auto rounded-2xl overflow-hidden shadow-2xl bg-panel border border-line/60 relative flex items-center justify-center cursor-pointer group hover:opacity-95 transition-opacity"
        >
          {currentTrack.coverImageUrl ? (
            <img
              src={currentTrack.coverImageUrl}
              alt={currentTrack.title}
              className="w-full h-full object-cover select-none"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center font-serif italic text-6xl text-ink-soft/40">
              ♪
            </div>
          )}
        </button>

        {/* Track Title, Artist & Like Button */}
        <div className="w-full max-w-[340px] mx-auto flex items-center justify-between gap-4 pt-1">
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() =>
                navigateToRelease(currentTrack, navigate, () =>
                  setNowPlayingExpanded(false)
                )
              }
              className="font-serif italic font-semibold text-2xl text-ink truncate leading-tight hover:underline cursor-pointer text-left block max-w-full"
            >
              {currentTrack.title}
            </button>
            <div className="flex items-center flex-wrap gap-x-1 gap-y-0.5 text-sm text-ink-soft mt-1">
              {parsedCredits.all.length > 0 ? (
                parsedCredits.all.map((artist, idx) => {
                  const isPrimary = idx === 0;
                  return (
                    <span key={artist.name + idx} className="inline-flex items-center">
                      <button
                        type="button"
                        onClick={() =>
                          navigateToArtist(artist, navigate, () =>
                            setNowPlayingExpanded(false)
                          )
                        }
                        className={`hover:text-ink hover:underline transition-colors truncate cursor-pointer text-left ${
                          isPrimary ? "font-medium text-ink" : "text-ink-soft"
                        }`}
                      >
                        {artist.name}
                      </button>
                      {idx < parsedCredits.all.length - 1 && (
                        <span className="text-ink-soft/60 mx-1 text-xs select-none">
                          {idx === 0 ? "feat." : "&"}
                        </span>
                      )}
                    </span>
                  );
                })
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    navigateToArtist(
                      {
                        name: currentTrack.artistName,
                        id: currentTrack.artistId,
                        slug: currentTrack.artistSlug,
                      },
                      navigate,
                      () => setNowPlayingExpanded(false)
                    )
                  }
                  className="font-medium text-ink hover:underline transition-colors truncate cursor-pointer text-left"
                >
                  {currentTrack.artistName || "Unknown Artist"}
                </button>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleToggleLike}
            aria-label={isLiked ? "Unlike song" : "Like song"}
            className="w-11 h-11 rounded-full flex items-center justify-center text-ink-soft hover:text-ink active:scale-125 transition-transform shrink-0 cursor-pointer"
          >
            <HeartIconSVG
              filled={isLiked}
              className={`w-6 h-6 ${isLiked ? "text-red-500 dark:text-red-400" : ""}`}
            />
          </button>
        </div>

        {/* Interactive Touch Scrubber */}
        <div className="w-full max-w-[340px] mx-auto space-y-1.5 pt-1">
          <div
            ref={scrubBarRef}
            className="relative h-6 flex items-center cursor-pointer touch-none"
            onMouseDown={(e) => handleScrubStart(e.clientX)}
            onMouseMove={(e) => isScrubbing && handleScrubMove(e.clientX)}
            onMouseUp={handleScrubEnd}
            onTouchStart={(e) => handleScrubStart(e.touches[0].clientX)}
            onTouchMove={(e) => handleScrubMove(e.touches[0].clientX)}
            onTouchEnd={handleScrubEnd}
          >
            {/* Scrubber Track */}
            <div className="w-full h-1.5 bg-line/40 rounded-full overflow-hidden relative">
              <div
                className="h-full bg-blue rounded-full relative"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Draggable Knob */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-ink rounded-full shadow-md pointer-events-none transition-transform"
              style={{ left: `calc(${progressPercent}% - 8px)` }}
            />
          </div>

          {/* Timestamps */}
          <div className="flex items-center justify-between text-[11px] font-mono text-ink-soft">
            <span>{formatTime(displayTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Main Transport Controls */}
        <div className="w-full max-w-[340px] mx-auto flex items-center justify-between px-2 pt-1">
          {/* Shuffle Button */}
          <button
            type="button"
            onClick={toggleShuffle}
            title={isShuffle ? "Shuffle On" : "Shuffle Off"}
            className={`p-2 transition-colors active:scale-90 ${
              isShuffle ? "text-blue" : "text-ink-soft"
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-5 h-5">
              <polyline points="16 3 21 3 21 8" />
              <line x1="4" y1="20" x2="21" y2="3" />
              <polyline points="21 16 21 21 16 21" />
              <line x1="15" y1="15" x2="21" y2="21" />
              <line x1="4" y1="4" x2="9" y2="9" />
            </svg>
          </button>

          {/* Previous Track */}
          <button
            type="button"
            onClick={previous}
            title="Previous track"
            className="p-2 text-ink active:scale-90 transition-transform"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
              <polygon points="19 20 9 12 19 4 19 20" />
              <line x1="5" y1="4" x2="5" y2="20" stroke="currentColor" strokeWidth="2.5" />
            </svg>
          </button>

          {/* Big Play/Pause Button */}
          <button
            type="button"
            onClick={togglePlay}
            disabled={isLoading}
            aria-label={isPlaying ? "Pause" : "Play"}
            className="w-16 h-16 rounded-full bg-ink text-canvas flex items-center justify-center shadow-xl active:scale-95 transition-transform cursor-pointer"
          >
            {isLoading ? (
              <div className="w-6 h-6 border-3 border-canvas border-t-transparent rounded-full animate-spin" />
            ) : isPlaying ? (
              <PauseIconSVG className="w-7 h-7 text-canvas" />
            ) : (
              <PlayIconSVG className="w-7 h-7 text-canvas ml-1" />
            )}
          </button>

          {/* Next Track */}
          <button
            type="button"
            onClick={next}
            title="Next track"
            className="p-2 text-ink active:scale-90 transition-transform"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
              <polygon points="5 4 15 12 5 20 5 4" />
              <line x1="19" y1="4" x2="19" y2="20" stroke="currentColor" strokeWidth="2.5" />
            </svg>
          </button>

          {/* Repeat Button */}
          <button
            type="button"
            onClick={toggleRepeat}
            title={`Repeat mode: ${repeatMode}`}
            className={`p-2 transition-colors active:scale-90 relative ${
              repeatMode !== "off" ? "text-blue" : "text-ink-soft"
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-5 h-5">
              <polyline points="17 1 21 5 17 9" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <polyline points="7 23 3 19 7 15" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
            {repeatMode === "one" && (
              <span className="absolute -top-1 -right-1 text-[9px] font-mono font-bold bg-blue text-canvas px-1 rounded-full">
                1
              </span>
            )}
          </button>
        </div>

        {/* Secondary Utility Row (Quality, Jam, Share, Queue) */}
        <div className="w-full max-w-[340px] mx-auto flex items-center justify-between pt-1 border-t border-line/40">
          {/* Audio Quality Badge */}
          <div className="flex items-center gap-1.5">
            {streamQuality === "lossless" ? (
              <span className="font-mono text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border border-blue text-blue bg-blue/10">
                Hi-Fi FLAC
              </span>
            ) : streamFormat === "hls" ? (
              <span className="font-mono text-[9px] uppercase font-bold text-emerald-500 px-2 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10">
                HLS 320K
              </span>
            ) : (
              <span className="font-mono text-[9px] uppercase text-ink-soft px-2 py-0.5 rounded border border-line">
                MP3 320K
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Live Jam Shortcut */}
            <button
              type="button"
              onClick={openJamModal}
              title={activeRoom ? `Live Jam: ${activeRoom.roomCode}` : "Live Jam"}
              className={`p-2 rounded-full transition-colors active:scale-90 ${
                activeRoom ? "text-emerald-500 bg-emerald-500/10" : "text-ink-soft hover:text-ink"
              }`}
            >
              <span className="text-base">🎧</span>
            </button>

            {/* Queue Toggle */}
            <button
              type="button"
              onClick={toggleQueueDrawer}
              title="Open Queue"
              className="p-2 text-ink-soft hover:text-ink active:scale-90 transition-transform"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* ===================== LIVE JAM SESSION CARD ===================== */}
        {activeRoom && (
          <div className="w-full max-w-[340px] mx-auto rounded-xl overflow-hidden bg-panel border border-emerald-500/30 p-4 space-y-3 shadow-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400 font-semibold">
                  Live Jam Active
                </span>
              </div>
              <span className="font-mono text-[8.5px] uppercase tracking-wider px-1.5 py-0.5 rounded-xs bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                {activeRoom.privacy.replace("_", " ")}
              </span>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-canvas-deep border border-line">
                <div className="min-w-0">
                  <span className="font-mono text-[9px] uppercase tracking-wider text-ink-soft block">
                    Invite Code
                  </span>
                  <span className="font-mono font-bold text-sm text-ink tracking-wider">
                    {activeRoom.roomCode}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyJamLink}
                  className="px-2.5 py-1 rounded-md text-[10px] font-mono uppercase tracking-wider font-semibold border border-line hover:border-emerald-500 bg-panel text-ink transition-colors cursor-pointer"
                >
                  {jamCopied ? "Copied!" : "Copy Link"}
                </button>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-ink-soft text-[11px]">
                  DJ: <strong className="text-ink font-semibold">{isHost ? "You (Host)" : activeRoom.hostName}</strong>
                </span>
                <span className="text-[11px] font-mono text-ink-soft">
                  {members.length} {members.length === 1 ? "listener" : "listeners"}
                </span>
              </div>

              {/* Members Avatar Preview */}
              {members.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto py-1 no-scrollbar">
                  {members.map((m) => (
                    <div
                      key={m.userId}
                      title={`${m.displayName}${m.role === "HOST" ? " (DJ)" : ""}`}
                      className="w-7 h-7 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-mono font-bold text-[10px] shrink-0 overflow-hidden"
                    >
                      {m.avatarUrl ? (
                        <img src={m.avatarUrl} alt={m.displayName} className="w-full h-full object-cover" />
                      ) : (
                        m.displayName.charAt(0).toUpperCase()
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <Link
                  to="/jam/$code"
                  params={{ code: activeRoom.roomCode }}
                  onClick={() => setNowPlayingExpanded(false)}
                  className="flex-1 py-1.5 rounded-lg border border-line bg-canvas hover:bg-panel text-center font-mono text-[10px] uppercase tracking-wider text-ink font-semibold transition-colors"
                >
                  Jam Page &rarr;
                </Link>
                <button
                  type="button"
                  onClick={leaveRoom}
                  className="px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 font-mono text-[10px] uppercase tracking-wider font-semibold transition-colors cursor-pointer"
                >
                  Leave
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===================== ABOUT THE ARTIST CARD ===================== */}
        {artistDetails && (
          <div className="w-full max-w-[340px] mx-auto rounded-xl overflow-hidden bg-panel border border-line p-4 space-y-3 shadow-md">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft font-semibold">
                About The Artist
              </span>
              <button
                type="button"
                onClick={() =>
                  navigateToArtist(
                    {
                      name: artistDetails.stageName,
                      slug: artistDetails.slug,
                      id: artistDetails.id,
                    },
                    navigate,
                    () => setNowPlayingExpanded(false)
                  )
                }
                className="font-mono text-[10px] uppercase tracking-wider text-blue hover:underline cursor-pointer"
              >
                Profile &rarr;
              </button>
            </div>

            {/* Artist Hero Banner / Avatar */}
            <div className="w-full h-32 rounded-lg bg-canvas-deep overflow-hidden relative border border-line/40">
              {artistDetails.bannerUrl ? (
                <img
                  src={artistDetails.bannerUrl}
                  alt={artistDetails.stageName}
                  className="w-full h-full object-cover"
                />
              ) : artistDetails.avatarUrl ? (
                <img
                  src={artistDetails.avatarUrl}
                  alt={artistDetails.stageName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center font-serif italic text-3xl text-ink-soft/40">
                  {artistDetails.stageName.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-bold text-base text-ink">{artistDetails.stageName}</h3>
                  {artistDetails.verified && <VerifiedBadgeSVG className="w-4 h-4 text-blue" />}
                </div>
                {artistDetails.monthlyListeners !== undefined && (
                  <p className="font-mono text-[10px] text-ink-soft mt-0.5">
                    {artistDetails.monthlyListeners.toLocaleString()} monthly listeners
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={handleToggleFollow}
                disabled={isFollowLoading}
                className={`font-mono text-[10px] uppercase tracking-wider px-3.5 py-1.5 rounded-full border transition-all cursor-pointer font-semibold ${
                  isFollowing
                    ? "border-line bg-canvas text-ink hover:border-red-400 hover:text-red-500"
                    : "border-ink bg-ink text-canvas hover:opacity-90"
                }`}
              >
                {isFollowLoading ? "..." : isFollowing ? "Following" : "Follow"}
              </button>
            </div>

            {artistDetails.bio && (
              <p className="text-xs text-ink-soft leading-relaxed line-clamp-3">
                {artistDetails.bio}
              </p>
            )}
          </div>
        )}

        {/* ===================== COLLABORATORS & FEATURED ARTISTS CARD ===================== */}
        {parsedCredits.collaborators.length > 0 && (
          <div className="w-full max-w-[340px] mx-auto rounded-xl overflow-hidden bg-panel border border-line p-4 space-y-3 shadow-md">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft font-semibold block">
              Featured &amp; Collaborators
            </span>

            <div className="space-y-2.5">
              {parsedCredits.collaborators.map((collab, idx) => {
                const isCollabFollowing = collab.id ? followedArtistIds.has(collab.id) : false;

                return (
                  <div
                    key={collab.name + idx}
                    className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-canvas-deep border border-line/60"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <button
                        type="button"
                        onClick={() =>
                          navigateToArtist(collab, navigate, () =>
                            setNowPlayingExpanded(false)
                          )
                        }
                        className="w-8 h-8 rounded-full bg-blue/10 text-blue font-mono font-bold text-xs flex items-center justify-center shrink-0 border border-blue/20 hover:scale-105 transition-transform cursor-pointer"
                      >
                        {collab.name.slice(0, 2).toUpperCase()}
                      </button>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              navigateToArtist(collab, navigate, () =>
                                setNowPlayingExpanded(false)
                              )
                            }
                            className="font-bold text-xs text-ink truncate hover:underline cursor-pointer text-left"
                          >
                            {collab.name}
                          </button>
                          {collab.verified && <VerifiedBadgeSVG className="w-3.5 h-3.5 text-blue" />}
                        </div>
                        <span className="font-mono text-[9px] text-ink-soft block uppercase tracking-wider">
                          {collab.role}
                        </span>
                      </div>
                    </div>

                    {collab.id && (
                      <button
                        type="button"
                        onClick={() => handleToggleArtistFollow(collab.id!)}
                        className={`font-mono text-[9px] uppercase tracking-wider px-2.5 py-1 rounded-full border transition-all cursor-pointer font-semibold shrink-0 ${
                          isCollabFollowing
                            ? "border-line bg-canvas text-ink hover:text-red-500 hover:border-red-400"
                            : "border-ink bg-ink text-canvas hover:opacity-90"
                        }`}
                      >
                        {isCollabFollowing ? "Following" : "Follow"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ===================== NEXT IN QUEUE PREVIEW ===================== */}
        {nextTrack && (
          <div className="w-full max-w-[340px] mx-auto rounded-xl bg-panel border border-line p-3.5 space-y-2 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-soft font-semibold">
                Next In Queue
              </span>
              <button
                type="button"
                onClick={toggleQueueDrawer}
                className="font-mono text-[9.5px] uppercase tracking-wider text-blue hover:underline cursor-pointer"
              >
                Open Queue
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-canvas-deep border border-line/60 overflow-hidden shrink-0">
                {nextTrack.coverImageUrl ? (
                  <img src={nextTrack.coverImageUrl} alt={nextTrack.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-serif italic text-xs text-ink-soft">
                    ♪
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-xs text-ink truncate">{nextTrack.title}</div>
                <div className="text-[11px] text-ink-soft truncate">{nextTrack.artistName}</div>
              </div>
            </div>
          </div>
        )}

        {/* ===================== RELEASE CREDITS & TECH SPECS ===================== */}
        <div className="w-full max-w-[340px] mx-auto rounded-xl bg-panel border border-line p-4 space-y-2.5 text-xs shadow-sm">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-ink-soft font-semibold block mb-1">
            Song Credits &amp; Specs
          </span>

          <div className="flex items-center justify-between py-1 border-b border-line/40">
            <span className="text-ink-soft">Primary Artist:</span>
            <span className="font-medium text-ink truncate max-w-[190px]">
              <button
                type="button"
                onClick={() =>
                  navigateToArtist(parsedCredits.primary, navigate, () =>
                    setNowPlayingExpanded(false)
                  )
                }
                className="hover:text-blue hover:underline cursor-pointer text-left truncate"
              >
                {parsedCredits.primary.name}
              </button>
            </span>
          </div>

          {parsedCredits.collaborators.length > 0 && (
            <div className="flex items-center justify-between py-1 border-b border-line/40">
              <span className="text-ink-soft">Featured:</span>
              <span className="font-medium text-ink truncate max-w-[190px]">
                {parsedCredits.collaborators.map((c, idx) => (
                  <span key={c.name + idx}>
                    <button
                      type="button"
                      onClick={() =>
                        navigateToArtist(c, navigate, () =>
                          setNowPlayingExpanded(false)
                        )
                      }
                      className="hover:text-blue hover:underline cursor-pointer text-left"
                    >
                      {c.name}
                    </button>
                    {idx < parsedCredits.collaborators.length - 1 && ", "}
                  </span>
                ))}
              </span>
            </div>
          )}

          {parsedCredits.producers.length > 0 && (
            <div className="flex items-center justify-between py-1 border-b border-line/40">
              <span className="text-ink-soft">Production:</span>
              <span className="font-medium text-ink truncate max-w-[190px]">
                {parsedCredits.producers.map((p) => p.name).join(", ")}
              </span>
            </div>
          )}

          {parsedCredits.writers.length > 0 && (
            <div className="flex items-center justify-between py-1 border-b border-line/40">
              <span className="text-ink-soft">Writing:</span>
              <span className="font-medium text-ink truncate max-w-[190px]">
                {parsedCredits.writers.map((w) => w.name).join(", ")}
              </span>
            </div>
          )}

          {currentTrack.albumTitle && (
            <div className="flex items-center justify-between py-1 border-b border-line/40">
              <span className="text-ink-soft">Release:</span>
              <span className="font-medium text-ink truncate max-w-[190px]">
                {currentTrack.albumTitle}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between py-1">
            <span className="text-ink-soft">Audio Engine:</span>
            <span className="font-mono text-[10px] text-blue font-bold uppercase tracking-wider">
              {currentTrack.hlsManifestUrl ? "Hi-Res HLS Stream" : "Lossless FLAC Master"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
