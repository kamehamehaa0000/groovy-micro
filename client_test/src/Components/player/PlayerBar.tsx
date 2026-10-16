import { Link } from '@tanstack/react-router'
import { usePlayerStore } from '../../stores/player.store'
import { useJamStore } from '../../stores/jam.store'
import { useLikesStore } from '../../stores/likes.store'
import { useAuthStore } from '../../stores/auth.store'
import { useAuthModalStore } from '../../stores/auth-modal.store'
import { SongActionMenu } from './SongActionMenu'
import { LiveJamBar } from '../jam/LiveJamBar'
import { MobileMiniPlayer } from './MobileMiniPlayer'
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  Volume1,
  VolumeX,
  Heart,
  ListMusic,
  Headphones,
  ChevronUp,
  MoreHorizontal,
  X,
} from 'lucide-react'

function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00'
  const mins = Math.floor(totalSeconds / 60)
  const secs = Math.floor(totalSeconds % 60)
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`
}

export function PlayerBar() {
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const playbackStatus = usePlayerStore((s) => s.playbackStatus)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const duration = usePlayerStore((s) => s.duration)
  const volume = usePlayerStore((s) => s.volume)
  const isMuted = usePlayerStore((s) => s.isMuted)
  const isShuffle = usePlayerStore((s) => s.isShuffle)
  const repeatMode = usePlayerStore((s) => s.repeatMode)
  const isQueueOpen = usePlayerStore((s) => s.isQueueOpen)
  const desktopRightSidebarView = usePlayerStore(
    (s) => s.desktopRightSidebarView,
  )

  const togglePlay = usePlayerStore((s) => s.togglePlay)
  const next = usePlayerStore((s) => s.next)
  const previous = usePlayerStore((s) => s.previous)
  const seek = usePlayerStore((s) => s.seek)
  const setVolume = usePlayerStore((s) => s.setVolume)
  const toggleMute = usePlayerStore((s) => s.toggleMute)
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle)
  const toggleRepeat = usePlayerStore((s) => s.toggleRepeat)
  const toggleQueueDrawer = usePlayerStore((s) => s.toggleQueueDrawer)
  const toggleDesktopRightSidebar = usePlayerStore(
    (s) => s.toggleDesktopRightSidebar,
  )
  const supersededByDevice = usePlayerStore((s) => s.supersededByDevice)
  const takeoverPlayback = usePlayerStore((s) => s.takeoverPlayback)
  const dismissSuperseded = usePlayerStore((s) => s.dismissSuperseded)

  const likedSongIds = useLikesStore((s) => s.likedSongIds)
  const toggleSongLike = useLikesStore((s) => s.toggleSongLike)
  const { isAuthenticated } = useAuthStore()

  const activeRoom = useJamStore((s) => s.activeRoom)
  const isJamHost = useJamStore((s) => s.isHost)
  const openJamModal = useJamStore((s) => s.openModal)

  // If no track is queued or loaded, don't show player bar
  if (!currentTrack) return null

  const isLiked = likedSongIds.has(currentTrack.id)
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0
  const isPlaying = playbackStatus === 'playing'
  const isLoading = playbackStatus === 'loading'
  const albumTarget = currentTrack.albumSlug || currentTrack.albumId

  const handleToggleLike = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isAuthenticated) {
      useAuthModalStore.getState().openAuthModal({
        category: 'Favorites & Library',
        subtitle: 'Library',
        title: 'Save to your library.',
        description:
          'Sign in or create an account to like tracks, build custom playlists, and sync your music across devices.',
      })
      return
    }
    try {
      await toggleSongLike(currentTrack.id)
    } catch (err) {
      console.error('Failed to toggle song like:', err)
    }
  }

  /* ── Volume icon picker ────────────────────────────────────────────── */
  const VolumeIcon =
    isMuted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2

  /* ── Repeat icon picker ────────────────────────────────────────────── */
  const RepeatIcon = repeatMode === 'one' ? Repeat1 : Repeat

  return (
    <>
      {/* ===================== MULTI-DEVICE TAKEOVER NOTIFICATION ===================== */}
      {supersededByDevice && (
        <div className="fixed bottom-[calc(7.875rem+env(safe-area-inset-bottom))] md:bottom-[92px] left-0 right-0 z-40 bg-muted/95 backdrop-blur-md border-t border-border px-5 py-2.5 flex items-center justify-between shadow-lg animate-in slide-in-from-bottom-2 duration-200 select-none">
          <div className="flex items-center gap-3 text-caption text-foreground max-w-[70%] truncate">
            <span className="flex h-2.5 w-2.5 relative shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"></span>
            </span>
            <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground">
              Listening on
            </span>
            <strong className="font-semibold text-foreground truncate">
              {supersededByDevice.deviceName}
            </strong>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => takeoverPlayback()}
              className="bg-foreground text-background hover:bg-primary hover:text-primary-foreground px-3.5 py-1.5 font-eyebrow text-eyebrow uppercase tracking-wider transition-colors rounded-control cursor-pointer shadow-raised font-medium"
            >
              Play here instead
            </button>
            <button
              type="button"
              onClick={() => dismissSuperseded()}
              className="text-muted-foreground hover:text-foreground p-1.5 rounded-full hover:bg-secondary/40 cursor-pointer transition-colors"
              aria-label="Dismiss"
            >
              <X size={15} strokeWidth={2} />
            </button>
          </div>
        </div>
      )}

      {/* Live Jam Floating Bar */}
      <div className="fixed bottom-[calc(7.875rem+env(safe-area-inset-bottom))] left-3 right-3 md:bottom-[92px] md:left-0 md:right-0 z-40 select-none pointer-events-auto">
        <LiveJamBar />
      </div>

      {/* Mobile Floating Mini Player (docked above bottom nav bar) */}
      <MobileMiniPlayer />

      {/* ===================== DESKTOP BOTTOM PLAYER BAR ===================== */}
      <footer
        aria-label="Audio Player"
        className="hidden md:flex fixed bottom-0 left-0 right-0 z-40 h-[88px] pb-safe bg-card/95 dark:bg-[#121212]/95 backdrop-blur-xl border-t border-border px-5 lg:px-8 items-center justify-between shadow-[0_-4px_24px_rgba(0,0,0,0.06)] dark:shadow-[0_-4px_24px_rgba(0,0,0,0.35)] transition-all duration-200 select-none"
      >
        {/* ━━━━━━━━ LEFT: Track Artwork & Info + Actions ━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div className="flex items-center gap-3.5 min-w-0 w-[30%] min-w-[220px] max-w-[360px]">
          {/* Cover Art (56x56px) — toggles Now Playing view */}
          <button
            type="button"
            onClick={() => toggleDesktopRightSidebar('now-playing')}
            className={`group relative w-14 h-14 rounded-md bg-secondary/40 border transition-all shrink-0 overflow-hidden shadow-sm cursor-pointer ${
              desktopRightSidebarView === 'now-playing'
                ? 'border-primary ring-2 ring-primary/30'
                : 'border-border/80 hover:border-foreground/30'
            }`}
            title={
              desktopRightSidebarView === 'now-playing'
                ? 'Collapse Now Playing'
                : 'Expand Now Playing'
            }
          >
            {currentTrack.coverImageUrl ? (
              <img
                src={currentTrack.coverImageUrl}
                alt={currentTrack.title}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center font-serif italic text-lg text-muted-foreground">
                ♪
              </div>
            )}
            {/* Hover overlay with chevron */}
            <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
              <ChevronUp
                size={18}
                strokeWidth={2.5}
                className={`transition-transform duration-200 ${
                  desktopRightSidebarView === 'now-playing' ? 'rotate-180' : ''
                }`}
              />
            </div>
          </button>

          {/* Title & Artist */}
          <div className="flex flex-col min-w-0 flex-1 justify-center">
            {albumTarget ? (
              <Link
                to="/albums/$idOrSlug"
                params={{ idOrSlug: albumTarget }}
                className="font-sans text-sm font-semibold text-foreground truncate tracking-tight hover:underline transition-colors leading-snug"
                title={currentTrack.title}
              >
                {currentTrack.title}
              </Link>
            ) : (
              <span
                className="font-sans text-sm font-semibold text-foreground truncate tracking-tight leading-snug"
                title={currentTrack.title}
              >
                {currentTrack.title}
              </span>
            )}

            <div className="flex items-center gap-1.5 text-xs text-muted-foreground truncate mt-0.5 leading-normal">
              {currentTrack.artistId ? (
                <Link
                  to="/artists/$idOrSlug"
                  params={{
                    idOrSlug: currentTrack.artistSlug || currentTrack.artistId,
                  }}
                  className="hover:text-foreground hover:underline truncate transition-colors"
                >
                  {currentTrack.artistName}
                </Link>
              ) : (
                <span className="truncate">{currentTrack.artistName}</span>
              )}
              {currentTrack.albumTitle && (
                <>
                  <span className="text-muted-foreground/40 hidden sm:inline">
                    •
                  </span>
                  <Link
                    to="/albums/$idOrSlug"
                    params={{ idOrSlug: albumTarget || '' }}
                    className="truncate text-muted-foreground/70 hover:text-foreground hover:underline transition-colors hidden sm:inline"
                    title={currentTrack.albumTitle}
                  >
                    {currentTrack.albumTitle}
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Quick Actions: Like Button & 3-Dot Menu */}
          <div className="flex items-center gap-0.5 shrink-0 ml-1">
            <button
              type="button"
              onClick={handleToggleLike}
              aria-label={isLiked ? 'Unlike song' : 'Like song'}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-secondary/40 active:scale-95 cursor-pointer transition-all shrink-0"
              title={
                isLiked ? 'Saved in your library (L)' : 'Save to library (L)'
              }
            >
              <Heart
                size={20}
                strokeWidth={isLiked ? 0 : 2}
                fill={isLiked ? 'currentColor' : 'none'}
                className={
                  isLiked
                    ? 'text-red-500 fill-red-500'
                    : 'text-muted-foreground hover:text-foreground transition-colors'
                }
              />
            </button>

            <div className="shrink-0 hidden xs:block">
              <SongActionMenu
                track={currentTrack}
                align="left"
                buttonClassName="w-9 h-9 flex items-center justify-center rounded-full hover:bg-secondary/40 active:scale-95 text-muted-foreground hover:text-foreground transition-all cursor-pointer shrink-0"
                triggerIcon={<MoreHorizontal size={20} strokeWidth={2} />}
              />
            </div>
          </div>
        </div>

        {/* ── MOBILE RIGHT CONTROLS (< sm breakpoint) ───────────────── */}
        <div className="flex sm:hidden items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={togglePlay}
            disabled={isLoading}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            className="w-10 h-10 rounded-full bg-foreground text-background flex items-center justify-center active:scale-95 cursor-pointer shadow-md transition-all"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-background border-t-transparent rounded-full animate-spin" />
            ) : isPlaying ? (
              <Pause size={18} fill="currentColor" strokeWidth={0} />
            ) : (
              <Play size={18} fill="currentColor" strokeWidth={0} className="ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={toggleQueueDrawer}
            title="Toggle Queue"
            className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors cursor-pointer ${
              isQueueOpen
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/40'
            }`}
          >
            <ListMusic size={20} strokeWidth={2} />
          </button>
        </div>

        {/* ━━━━━━━━ CENTER: Playback Controls & Scrubber ━━━━━━━━━━━━━ */}
        <div className="hidden sm:flex flex-1 max-w-[700px] flex-col items-center justify-center px-4">
          {/* Transport buttons row */}
          <div className="flex items-center gap-5 sm:gap-6">
            {/* Shuffle */}
            <button
              type="button"
              onClick={toggleShuffle}
              title={isShuffle ? 'Shuffle on (S)' : 'Shuffle off (S)'}
              className="relative w-9 h-9 flex items-center justify-center rounded-full transition-colors cursor-pointer hover:bg-secondary/40"
            >
              <Shuffle
                size={19}
                strokeWidth={isShuffle ? 2.5 : 2}
                className={
                  isShuffle
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground transition-colors'
                }
              />
              {isShuffle && (
                <span className="absolute bottom-1 w-1 h-1 rounded-full bg-primary" />
              )}
            </button>

            {/* Previous */}
            <button
              type="button"
              onClick={previous}
              title="Previous (Shift + ←)"
              className="w-9 h-9 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/40 active:scale-90 transition-all cursor-pointer"
            >
              <SkipBack size={21} fill="currentColor" strokeWidth={2} />
            </button>

            {/* Play / Pause Circular Hero Button */}
            <button
              type="button"
              onClick={togglePlay}
              disabled={isLoading}
              title={
                activeRoom && !isJamHost
                  ? `Playback controlled by DJ (${activeRoom.hostName})`
                  : isPlaying
                    ? 'Pause (Space)'
                    : 'Play (Space)'
              }
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-foreground text-background flex items-center justify-center hover:scale-105 active:scale-95 shadow-md hover:shadow-lg transition-all duration-150 cursor-pointer"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-background border-t-transparent rounded-full animate-spin" />
              ) : isPlaying ? (
                <Pause size={22} fill="currentColor" strokeWidth={0} />
              ) : (
                <Play size={22} fill="currentColor" strokeWidth={0} className="ml-0.5" />
              )}
            </button>

            {/* Next */}
            <button
              type="button"
              onClick={next}
              title="Next (Shift + →)"
              className="w-9 h-9 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/40 active:scale-90 transition-all cursor-pointer"
            >
              <SkipForward size={21} fill="currentColor" strokeWidth={2} />
            </button>

            {/* Repeat */}
            <button
              type="button"
              onClick={toggleRepeat}
              title={`Repeat mode: ${repeatMode} (R)`}
              className="relative w-9 h-9 flex items-center justify-center rounded-full transition-colors cursor-pointer hover:bg-secondary/40"
            >
              <RepeatIcon
                size={19}
                strokeWidth={repeatMode !== 'off' ? 2.5 : 2}
                className={
                  repeatMode !== 'off'
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground transition-colors'
                }
              />
              {repeatMode !== 'off' && (
                <span className="absolute bottom-1 w-1 h-1 rounded-full bg-primary" />
              )}
            </button>
          </div>

          {/* Progress bar & timestamps row */}
          <div className="w-full flex items-center gap-3 mt-1.5 select-none">
            <span className="w-11 text-right text-[11px] font-mono text-muted-foreground/80 tabular-nums">
              {formatTime(currentTime)}
            </span>

            {/* Scrubber track container with comfortable hit padding */}
            <div
              className="relative flex-1 py-2 flex items-center cursor-pointer group"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                const clickX = e.clientX - rect.left
                const ratio = Math.max(0, Math.min(1, clickX / rect.width))
                seek(ratio * duration)
              }}
            >
              {/* Background track */}
              <div className="w-full h-1 group-hover:h-1.5 bg-secondary/50 rounded-full overflow-hidden transition-all duration-150">
                {/* Active progress fill */}
                <div
                  className="h-full bg-foreground group-hover:bg-primary rounded-full transition-[width] duration-75 relative"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {/* Scrubber thumb knob on hover */}
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-foreground group-hover:bg-primary rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                style={{ left: `${progressPercent}%` }}
              />
            </div>

            <span className="w-11 text-left text-[11px] font-mono text-muted-foreground/80 tabular-nums">
              {formatTime(duration)}
            </span>
          </div>
        </div>

        {/* ━━━━━━━━ RIGHT: Volume Slider, Jam, Queue ━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div className="hidden sm:flex items-center justify-end gap-2 w-[30%] min-w-[220px] max-w-[360px]">
          {/* Volume Control */}
          <div className="flex items-center gap-1.5 group/vol">
            <button
              type="button"
              onClick={toggleMute}
              aria-label={isMuted ? 'Unmute' : 'Mute'}
              title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
              className="w-9 h-9 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/40 cursor-pointer transition-colors"
            >
              <VolumeIcon size={20} strokeWidth={2} />
            </button>
            <div className="relative flex items-center py-2">
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={isMuted ? 0 : volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                aria-label="Volume"
                className="w-24 lg:w-28 h-1 bg-secondary/50 hover:bg-secondary/70 rounded-full appearance-none cursor-pointer accent-primary transition-all"
              />
            </div>
          </div>

          {/* Live Jam Button */}
          <button
            type="button"
            onClick={openJamModal}
            title={
              activeRoom
                ? `Live Jam: ${activeRoom.roomCode}`
                : 'Start or Join Live Jam'
            }
            className={`relative w-9 h-9 flex items-center justify-center rounded-full transition-all cursor-pointer ${
              activeRoom
                ? 'bg-success/15 text-success ring-1 ring-success/30'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/40'
            }`}
          >
            <Headphones size={20} strokeWidth={2} />
            {activeRoom && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-success rounded-full animate-pulse ring-2 ring-card" />
            )}
          </button>

          {/* Queue Drawer Toggle */}
          <button
            type="button"
            onClick={() => toggleDesktopRightSidebar('queue')}
            title="Toggle Queue"
            className={`relative w-9 h-9 flex items-center justify-center rounded-full transition-all cursor-pointer ${
              desktopRightSidebarView === 'queue'
                ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/40'
            }`}
          >
            <ListMusic size={20} strokeWidth={2} />
          </button>
        </div>
      </footer>
    </>
  )
}
