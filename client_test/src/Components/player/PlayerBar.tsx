import { Link } from "@tanstack/react-router";
import { usePlayerStore } from "../../stores/player.store";
import { useJamStore } from "../../stores/jam.store";
import { useLikesStore } from "../../stores/likes.store";
import { useAuthStore } from "../../stores/auth.store";
import { useAuthModalStore } from "../../stores/auth-modal.store";
import { SongActionMenu } from "./SongActionMenu";
import { LiveJamBar } from "../jam/LiveJamBar";

function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

// Icons
const PlayIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <polygon points="6 4 20 12 6 20 6 4" />
  </svg>
);

const PauseIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="6" y="4" width="4" height="16" />
    <rect x="14" y="4" width="4" height="16" />
  </svg>
);

const SkipForwardIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <polygon points="5 4 15 12 5 20 5 4" />
    <line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const SkipBackIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <polygon points="19 20 9 12 19 4 19 20" />
    <line x1="5" y1="5" x2="5" y2="19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const ShuffleIcon = ({ active, className = "w-4 h-4" }: { active: boolean; className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`${className} ${active ? "text-blue stroke-[2.5]" : "text-ink-soft hover:text-ink"}`}
  >
    <polyline points="16 3 21 3 21 8" />
    <line x1="4" y1="20" x2="21" y2="3" />
    <polyline points="21 16 21 21 16 21" />
    <line x1="15" y1="15" x2="21" y2="21" />
    <line x1="4" y1="4" x2="9" y2="9" />
  </svg>
);

const RepeatIcon = ({ mode, className = "w-4 h-4" }: { mode: "off" | "all" | "one"; className?: string }) => (
  <div className="relative flex items-center justify-center">
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${className} ${mode !== "off" ? "text-blue stroke-[2.5]" : "text-ink-soft hover:text-ink"}`}
    >
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
    {mode === "one" && (
      <span className="absolute -top-1.5 -right-2 text-[9px] font-mono font-bold text-blue bg-panel px-0.5 rounded">
        1
      </span>
    )}
  </div>
);

const VolumeIcon = ({ muted, volume, className = "w-4 h-4" }: { muted: boolean; volume: number; className?: string }) => {
  if (muted || volume === 0) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <line x1="23" y1="9" x2="17" y2="15" />
        <line x1="17" y1="9" x2="23" y2="15" />
      </svg>
    );
  }
  if (volume < 0.5) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
};

const QueueIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

const HeartIcon = ({ filled, className = "w-4 h-4" }: { filled: boolean; className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill={filled ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`${className} ${filled ? "text-red-500 fill-red-500" : "text-ink-soft hover:text-ink"}`}
  >
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);

export function PlayerBar() {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const playbackStatus = usePlayerStore((s) => s.playbackStatus);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const volume = usePlayerStore((s) => s.volume);
  const isMuted = usePlayerStore((s) => s.isMuted);
  const isShuffle = usePlayerStore((s) => s.isShuffle);
  const repeatMode = usePlayerStore((s) => s.repeatMode);
  const streamQuality = usePlayerStore((s) => s.streamQuality);
  const streamFormat = usePlayerStore((s) => s.streamFormat);
  const userQueue = usePlayerStore((s) => s.userQueue);
  const isQueueOpen = usePlayerStore((s) => s.isQueueOpen);

  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const next = usePlayerStore((s) => s.next);
  const previous = usePlayerStore((s) => s.previous);
  const seek = usePlayerStore((s) => s.seek);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const toggleMute = usePlayerStore((s) => s.toggleMute);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const toggleRepeat = usePlayerStore((s) => s.toggleRepeat);
  const toggleQueueDrawer = usePlayerStore((s) => s.toggleQueueDrawer);
  const supersededByDevice = usePlayerStore((s) => s.supersededByDevice);
  const takeoverPlayback = usePlayerStore((s) => s.takeoverPlayback);
  const dismissSuperseded = usePlayerStore((s) => s.dismissSuperseded);

  const likedSongIds = useLikesStore((s) => s.likedSongIds);
  const toggleSongLike = useLikesStore((s) => s.toggleSongLike);
  const { isAuthenticated } = useAuthStore();

  const activeRoom = useJamStore((s) => s.activeRoom);
  const isJamHost = useJamStore((s) => s.isHost);
  const openJamModal = useJamStore((s) => s.openModal);

  // If no track is queued or loaded, don't show player bar
  if (!currentTrack) return null;

  const isLiked = likedSongIds.has(currentTrack.id);
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const isPlaying = playbackStatus === "playing";
  const isLoading = playbackStatus === "loading";
  const albumTarget = currentTrack.albumSlug || currentTrack.albumId;

  const handleToggleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAuthenticated) {
      useAuthModalStore.getState().openAuthModal({
        category: "Favorites & Library",
        subtitle: "Library",
        title: "Save to your library.",
        description:
          "Sign in or create an account to like tracks, build custom playlists, and sync your music across devices.",
      });
      return;
    }
    try {
      await toggleSongLike(currentTrack.id);
    } catch (err) {
      console.error("Failed to toggle song like:", err);
    }
  };

  return (
    <>
      {/* ===================== MULTI-DEVICE TAKEOVER NOTIFICATION BANNER ===================== */}
      {supersededByDevice && (
        <div className="fixed bottom-16 sm:bottom-20 left-0 right-0 z-40 bg-canvas-deep/95 backdrop-blur-md border-t border-line px-4 py-2.5 flex items-center justify-between shadow-lg animate-in slide-in-from-bottom-2 duration-200 select-none">
          <div className="flex items-center gap-2.5 text-xs text-ink max-w-[70%] truncate">
            <span className="flex h-2 w-2 relative shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue"></span>
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-ink-soft">
              Listening on
            </span>
            <strong className="font-semibold text-ink truncate">
              {supersededByDevice.deviceName}
            </strong>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => takeoverPlayback()}
              className="bg-ink text-canvas hover:bg-blue hover:text-white px-3 py-1 font-mono text-[9.5px] uppercase tracking-[0.12em] transition-colors rounded-xs cursor-pointer shadow-xs font-medium"
            >
              Play here instead
            </button>
            <button
              type="button"
              onClick={() => dismissSuperseded()}
              className="text-ink-soft hover:text-ink p-1 cursor-pointer"
              aria-label="Dismiss"
            >
              <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5">
                <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Live Jam Floating Bar */}
      <div className="fixed bottom-[120px] md:bottom-20 left-0 right-0 z-40">
        <LiveJamBar />
      </div>

      <footer
        aria-label="Audio Player"
        className="fixed bottom-14 md:bottom-0 left-0 right-0 z-40 h-16 sm:h-20 bg-panel/95 backdrop-blur-md border-t border-line px-3 sm:px-8 flex items-center justify-between shadow-2xl transition-all duration-200 select-none"
      >
        {/* Pinned Top Scrubber Bar (Interactive & visible across all screens) */}
        <div
          className="absolute top-0 left-0 right-0 h-1 bg-stone/20 cursor-pointer group z-20"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          const ratio = Math.max(0, Math.min(1, clickX / rect.width));
          seek(ratio * duration);
        }}
      >
        <div
          className="h-full bg-blue transition-all duration-75 relative"
          style={{ width: `${progressPercent}%` }}
        >
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-blue rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow" />
        </div>
      </div>

      {/* LEFT: Track Artwork & Info + Like Button + Action Menu */}
      <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1 sm:flex-initial sm:w-1/4">
        {/* Cover Art (Clickable to Album) */}
        {albumTarget ? (
          <Link
            to="/albums/$idOrSlug"
            params={{ idOrSlug: albumTarget }}
            className="relative w-10 h-10 sm:w-12 sm:h-12 rounded bg-stone/40 border border-line shrink-0 overflow-hidden shadow-xs hover:opacity-90 transition-opacity"
            title={`View ${currentTrack.albumTitle || "Release"}`}
          >
            {currentTrack.coverImageUrl ? (
              <img
                src={currentTrack.coverImageUrl}
                alt={currentTrack.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center font-serif italic text-base text-ink-soft">
                ♪
              </div>
            )}
          </Link>
        ) : (
          <div className="relative w-10 h-10 sm:w-12 sm:h-12 rounded bg-stone/40 border border-line shrink-0 overflow-hidden shadow-xs">
            {currentTrack.coverImageUrl ? (
              <img
                src={currentTrack.coverImageUrl}
                alt={currentTrack.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center font-serif italic text-base text-ink-soft">
                ♪
              </div>
            )}
          </div>
        )}

        {/* Metadata */}
        <div className="flex flex-col min-w-0 pr-1 flex-1">
          {albumTarget ? (
            <Link
              to="/albums/$idOrSlug"
              params={{ idOrSlug: albumTarget }}
              className="text-xs sm:text-sm font-semibold text-ink truncate tracking-tight hover:text-blue transition-colors block"
              title={currentTrack.title}
            >
              {currentTrack.title}
            </Link>
          ) : (
            <span
              className="text-xs sm:text-sm font-semibold text-ink truncate tracking-tight"
              title={currentTrack.title}
            >
              {currentTrack.title}
            </span>
          )}

          <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-ink-soft truncate mt-0.5">
            {currentTrack.artistId ? (
              <Link
                to="/artists/$idOrSlug"
                params={{ idOrSlug: currentTrack.artistSlug || currentTrack.artistId }}
                className="hover:text-ink truncate transition-colors"
              >
                {currentTrack.artistName}
              </Link>
            ) : (
              <span className="truncate">{currentTrack.artistName}</span>
            )}
            {currentTrack.albumTitle && (
              <>
                <span className="text-[10px] text-ink-soft/40 hidden sm:inline">•</span>
                <Link
                  to="/albums/$idOrSlug"
                  params={{ idOrSlug: albumTarget || "" }}
                  className="truncate text-ink-soft/80 hover:text-ink transition-colors hidden sm:inline"
                  title={currentTrack.albumTitle}
                >
                  {currentTrack.albumTitle}
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Like Button */}
        <button
          type="button"
          onClick={handleToggleLike}
          aria-label={isLiked ? "Unlike song" : "Like song"}
          className="p-1.5 rounded-full hover:bg-stone/20 cursor-pointer transition-colors shrink-0"
          title={isLiked ? "Saved in your library (L)" : "Save to library (L)"}
        >
          <HeartIcon filled={isLiked} className="w-4 h-4" />
        </button>

        {/* Action Menu (Play Next, Add to Queue, Add to Playlist...) */}
        <div className="shrink-0 hidden xs:block">
          <SongActionMenu track={currentTrack} align="left" />
        </div>
      </div>

      {/* MOBILE RIGHT CONTROLS: Compact Play/Pause & Queue Toggle (< sm) */}
      <div className="flex sm:hidden items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={togglePlay}
          disabled={isLoading}
          aria-label={isPlaying ? "Pause" : "Play"}
          title={isPlaying ? "Pause (Space)" : "Play (Space)"}
          className="w-9 h-9 rounded-full bg-ink text-canvas flex items-center justify-center active:scale-95 cursor-pointer shadow-md transition-all"
        >
          {isLoading ? (
            <div className="w-3.5 h-3.5 border-2 border-canvas border-t-transparent rounded-full animate-spin" />
          ) : isPlaying ? (
            <PauseIcon className="w-4 h-4 text-canvas" />
          ) : (
            <PlayIcon className="w-4 h-4 text-canvas ml-0.5" />
          )}
        </button>

        <button
          type="button"
          onClick={toggleQueueDrawer}
          title="Toggle Queue"
          className={`relative p-1.5 rounded-md transition-colors cursor-pointer ${
            isQueueOpen ? "bg-blue/10 text-blue font-semibold" : "text-ink-soft hover:text-ink"
          }`}
        >
          <QueueIcon className="w-4 h-4" />
          {userQueue.length > 0 && (
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-blue text-white rounded-full text-[8px] font-mono font-bold flex items-center justify-center">
              {userQueue.length > 9 ? "9+" : userQueue.length}
            </span>
          )}
        </button>
      </div>

      {/* DESKTOP CENTER: Playback Controls & Scrubber (hidden on mobile, sm:flex) */}
      <div className="hidden sm:flex flex-col items-center gap-1.5 w-2/4 max-w-xl px-2">
        {/* Button Controls */}
        <div className="flex items-center gap-4 sm:gap-6">
          {/* Shuffle */}
          <button
            type="button"
            onClick={toggleShuffle}
            title={isShuffle ? "Shuffle on (S)" : "Shuffle off (S)"}
            className="p-1 cursor-pointer transition-colors"
          >
            <ShuffleIcon active={isShuffle} className="w-4 h-4" />
          </button>

          {/* Previous */}
          <button
            type="button"
            onClick={previous}
            title="Previous (Shift + ←)"
            className="text-ink-soft hover:text-ink cursor-pointer transition-colors p-1"
          >
            <SkipBackIcon className="w-4 h-4" />
          </button>

          {/* Play / Pause Circular Button */}
          <button
            type="button"
            onClick={togglePlay}
            disabled={isLoading}
            title={
              activeRoom && !isJamHost
                ? `Playback controlled by DJ (${activeRoom.hostName})`
                : isPlaying
                ? "Pause (Space)"
                : "Play (Space)"
            }
            aria-label={isPlaying ? "Pause" : "Play"}
            className="w-10 h-10 rounded-full bg-ink text-canvas flex items-center justify-center hover:scale-105 active:scale-95 cursor-pointer shadow-md transition-all duration-150"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-canvas border-t-transparent rounded-full animate-spin" />
            ) : isPlaying ? (
              <PauseIcon className="w-4 h-4 text-canvas" />
            ) : (
              <PlayIcon className="w-4 h-4 text-canvas ml-0.5" />
            )}
          </button>

          {/* Next */}
          <button
            type="button"
            onClick={next}
            title="Next (Shift + →)"
            className="text-ink-soft hover:text-ink cursor-pointer transition-colors p-1"
          >
            <SkipForwardIcon className="w-4 h-4" />
          </button>

          {/* Repeat */}
          <button
            type="button"
            onClick={toggleRepeat}
            title={`Repeat mode: ${repeatMode} (R)`}
            className="p-1 cursor-pointer transition-colors"
          >
            <RepeatIcon mode={repeatMode} className="w-4 h-4" />
          </button>
        </div>

        {/* Progress Bar & Timestamps */}
        <div className="w-full flex items-center gap-2.5 text-[11px] font-mono text-ink-soft">
          <span className="w-10 text-right select-none">{formatTime(currentTime)}</span>
          <div
            className="relative flex-1 h-1.5 bg-stone/40 rounded-full cursor-pointer group flex items-center"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const clickX = e.clientX - rect.left;
              const ratio = Math.max(0, Math.min(1, clickX / rect.width));
              seek(ratio * duration);
            }}
          >
            <div
              className="h-full bg-ink rounded-full relative transition-all duration-75"
              style={{ width: `${progressPercent}%` }}
            >
              {/* Scrubber Knob */}
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-ink rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
          <span className="w-10 select-none">{formatTime(duration)}</span>
        </div>
      </div>

      {/* DESKTOP RIGHT: Quality Badge, Volume Slider & Queue Drawer Toggle */}
      <div className="hidden sm:flex items-center justify-end gap-3.5 w-1/4">
        {/* Stream Quality Tag */}
        {streamQuality === "lossless" ? (
          <span
            title="Hi-Res Lossless FLAC Quality Stream"
            className="hidden lg:inline-flex items-center gap-1 font-mono text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded border border-blue text-blue bg-blue/10"
          >
            Hi-Fi FLAC
          </span>
        ) : streamFormat === "hls" ? (
          <span
            title="Adaptive Bitrate HLS Stream (up to 320 kbps AAC)"
            className="hidden lg:inline-flex items-center gap-1 font-mono text-[9px] uppercase font-bold text-emerald-500 px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10"
          >
            HLS ABR
          </span>
        ) : (
          <span
            title="Direct Progressive Audio Stream (MP3 320k)"
            className="hidden lg:inline-flex items-center gap-1 font-mono text-[9px] uppercase text-ink-soft/70 px-1.5 py-0.5 rounded border border-line"
          >
            MP3 320K
          </span>
        )}

        {/* Volume Control */}
        <div className="hidden sm:flex items-center gap-2">
          <button
            type="button"
            onClick={toggleMute}
            aria-label={isMuted ? "Unmute" : "Mute"}
            title={isMuted ? "Unmute (M)" : "Mute (M)"}
            className="text-ink-soft hover:text-ink cursor-pointer p-1 transition-colors"
          >
            <VolumeIcon muted={isMuted} volume={volume} className="w-4 h-4" />
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={isMuted ? 0 : volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            aria-label="Volume"
            className="w-16 md:w-24 h-1 bg-stone/40 rounded-lg appearance-none cursor-pointer accent-blue"
          />
        </div>

        {/* Live Jam Button */}
        <button
          type="button"
          onClick={openJamModal}
          title={activeRoom ? `Live Jam: ${activeRoom.roomCode}` : "Start or Join Live Jam"}
          className={`relative p-2 rounded-md transition-colors cursor-pointer ${
            activeRoom
              ? "bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/30"
              : "text-ink-soft hover:text-ink hover:bg-stone/20"
          }`}
        >
          <span className="text-sm">🎧</span>
          {activeRoom && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
          )}
        </button>

        {/* Queue Drawer Toggle */}
        <button
          type="button"
          onClick={toggleQueueDrawer}
          title="Toggle Queue"
          className={`relative p-2 rounded-md transition-colors cursor-pointer ${
            isQueueOpen ? "bg-blue/10 text-blue font-semibold" : "text-ink-soft hover:text-ink hover:bg-stone/20"
          }`}
        >
          <QueueIcon className="w-4 h-4" />
          {userQueue.length > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue text-white rounded-full text-[9px] font-mono font-bold flex items-center justify-center">
              {userQueue.length > 9 ? "9+" : userQueue.length}
            </span>
          )}
        </button>
      </div>
    </footer>
    </>
  );
}
