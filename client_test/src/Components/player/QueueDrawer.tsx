import React, { useState, useEffect, useRef } from 'react'
import { usePlayerStore } from '../../stores/player.store'
import { useJamStore } from '../../stores/jam.store'
import { useAuthStore } from '../../stores/auth.store'
import { useAuthModalStore } from '../../stores/auth-modal.store'
import { useCreatePlaylistModalStore } from '../../stores/create-playlist-modal.store'
import { playerApi, type RecentHistoryItem } from '../../lib/player.api'
import { QueueSongRow } from './QueueSongRow'
import { UserQueueReorderList } from './UserQueueReorderList'
import { SongActionMenu } from './SongActionMenu'
import { ChevronDown, ListPlus, Shuffle, Trash2, X } from 'lucide-react'
import { IconButton } from '../ui'

function formatSeconds(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return '0:00'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

function formatTotalTime(sec: number): string {
  if (!sec || sec <= 0) return '0 min'
  const mins = Math.floor(sec / 60)
  if (mins < 60) return `${mins} min`
  const hrs = Math.floor(mins / 60)
  const remMins = mins % 60
  return `${hrs}h ${remMins > 0 ? `${remMins}m` : ''}`
}

function formatRelativeTime(isoDate: string): string {
  try {
    const diff = Date.now() - new Date(isoDate).getTime()
    const sec = Math.floor(diff / 1000)
    if (sec < 60) return 'Just now'
    const min = Math.floor(sec / 60)
    if (min < 60) return `${min}m ago`
    const hrs = Math.floor(min / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days}d ago`
    return new Date(isoDate).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return ''
  }
}

const jamTrackToPlayerTrack = (jt: any): any => ({
  id: jt.id,
  title: jt.title,
  artistName: jt.artistName || 'Unknown Artist',
  durationSeconds: jt.duration || 0,
  coverImageUrl: jt.artworkUrl || null,
  audioUrl: jt.audioUrl || null,
  hlsManifestUrl: jt.hlsManifestUrl || null,
  albumId: jt.albumId || null,
  albumTitle: jt.albumTitle || null,
})

const historySongToPlayerTrack = (s: RecentHistoryItem['song']): any => ({
  id: s.id,
  title: s.title,
  artistName: s.artistName,
  artistId: s.artistId,
  durationSeconds: s.durationSeconds,
  coverImageUrl: s.coverImageUrl,
  audioUrl: s.audioUrl,
  hlsManifestUrl: s.hlsManifestUrl,
  rawAudioKey: s.rawAudioKey,
  albumId: s.albumId,
  albumTitle: s.albumTitle || null,
})

interface QueueContentProps {
  mode: 'desktop' | 'mobile'
  onClose: () => void
  listRef?: React.RefObject<HTMLDivElement | null>
}

export function QueueContent({ mode, onClose, listRef }: QueueContentProps) {
  const localListRef = useRef<HTMLDivElement | null>(null)
  const activeListRef = listRef || localListRef

  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const playbackStatus = usePlayerStore((s) => s.playbackStatus)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const userQueue = usePlayerStore((s) => s.userQueue)
  const contextQueue = usePlayerStore((s) => s.contextQueue)
  const contextIndex = usePlayerStore((s) => s.contextIndex)
  const contextTitle = usePlayerStore((s) => s.contextTitle)
  const contextUri = usePlayerStore((s) => s.contextUri)

  const playTrack = usePlayerStore((s) => s.playTrack)
  const playUserQueueTrack = usePlayerStore((s) => s.playUserQueueTrack)
  const removeFromUserQueue = usePlayerStore((s) => s.removeFromUserQueue)
  const clearUserQueue = usePlayerStore((s) => s.clearUserQueue)
  const reorderUserQueue = usePlayerStore((s) => s.reorderUserQueue)
  const jumpToContextTrack = usePlayerStore((s) => s.jumpToContextTrack)
  const isShuffle = usePlayerStore((s) => s.isShuffle)
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle)

  const activeJamRoom = useJamStore((s) => s.activeRoom)
  const jamQueue = useJamStore((s) => s.jamQueue)
  const removeFromJamQueue = useJamStore((s) => s.removeFromJamQueue)

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const openAuthModal = useAuthModalStore((s) => s.openAuthModal)

  // Tabs: 'queue' vs 'history'
  const [activeTab, setActiveTab] = useState<'queue' | 'history'>('queue')

  // History state
  const [historyItems, setHistoryItems] = useState<RecentHistoryItem[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  // Load history when tab is opened
  useEffect(() => {
    if (activeTab === 'history' && isAuthenticated) {
      setIsLoadingHistory(true)
      playerApi
        .getRecentHistory()
        .then((res) => {
          setHistoryItems(res.history || [])
        })
        .catch(() => {})
        .finally(() => setIsLoadingHistory(false))
    }
  }, [activeTab, isAuthenticated])

  // Remaining tracks from current context
  const upcomingContext = contextQueue.slice(contextIndex + 1)

  // Detect if current session was launched from Recently Played history
  const isFromRecentlyPlayed = Boolean(
    contextUri?.startsWith('history:') ||
    contextUri?.includes('recent') ||
    contextTitle?.toLowerCase().includes('recently played') ||
    contextTitle?.toLowerCase().includes('recent'),
  )

  // Calculate total upcoming queue time
  const totalUpcomingSeconds =
    (currentTrack
      ? Math.max(0, currentTrack.durationSeconds - currentTime)
      : 0) +
    userQueue.reduce((acc, t) => acc + (t.durationSeconds || 0), 0) +
    upcomingContext.reduce((acc, t) => acc + (t.durationSeconds || 0), 0)

  const totalUpcomingTracks =
    (currentTrack ? 1 : 0) + userQueue.length + upcomingContext.length

  // Save current queue as playlist (omitting Next from: Recently Played songs)
  const handleSaveQueueAsPlaylist = () => {
    if (!isAuthenticated) {
      openAuthModal({
        title: 'Save Queue to Playlist',
        description:
          'Sign in to save your active queue and listening session as a personal playlist.',
      })
      return
    }

    const allTrackIds: string[] = []
    if (currentTrack) allTrackIds.push(currentTrack.id)
    userQueue.forEach((t) => allTrackIds.push(t.id))

    // Do NOT include upcomingContext songs if playback context is Recently Played
    if (!isFromRecentlyPlayed) {
      upcomingContext.forEach((t) => allTrackIds.push(t.id))
    }

    if (allTrackIds.length === 0) return

    // Deduplicate while preserving order
    const uniqueTrackIds = Array.from(new Set(allTrackIds))
    useCreatePlaylistModalStore.getState().openModal(uniqueTrackIds)
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-card text-foreground">
      {/* ===================== TOP HEADER & TABS ===================== */}
      <div className="h-14 border-b border-border px-3.5 sm:px-4 flex items-center justify-between shrink-0 gap-2 select-none">
        {/* Left: Tab Switcher (Queue / History) */}
        <div className="flex items-center gap-1 bg-secondary/30 p-1 rounded-control">
          <button
            type="button"
            onClick={() => setActiveTab('queue')}
            className={`font-eyebrow text-eyebrow uppercase tracking-wider px-3 py-1 rounded-control transition-all duration-150 cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'queue'
                ? 'bg-card text-foreground font-semibold shadow-raised'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>Queue</span>
            {totalUpcomingTracks > 0 && (
              <span className="font-mono text-eyebrow opacity-75">
                {totalUpcomingTracks}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`font-eyebrow text-eyebrow uppercase tracking-wider px-3 py-1 rounded-control transition-all duration-150 cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'history'
                ? 'bg-card text-foreground font-semibold shadow-raised'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>History</span>
          </button>
        </div>

        {/* Right Controls: Shuffle, Save as Playlist, Clear Queue, Close */}
        <div className="flex items-center gap-1 shrink-0">
          {activeTab === 'queue' && (
            <IconButton
              size="sm"
              onClick={toggleShuffle}
              className={
                isShuffle ? 'group text-primary! hover:text-primary!' : 'group'
              }
              aria-label={isShuffle ? 'Turn shuffle off' : 'Turn shuffle on'}
              title={isShuffle ? 'Turn shuffle off' : 'Turn shuffle on'}
              aria-pressed={isShuffle}
            >
              <Shuffle
                className={`h-4 w-4 transition-transform duration-300 ease-out group-hover:scale-110 group-active:scale-90 ${
                  isShuffle ? 'rotate-180' : 'rotate-0'
                }`}
              />
            </IconButton>
          )}

          {activeTab === 'queue' && totalUpcomingTracks > 0 && (
            <IconButton
              size="sm"
              onClick={handleSaveQueueAsPlaylist}
              aria-label={
                isFromRecentlyPlayed
                  ? 'Save priority queue songs as a new playlist'
                  : 'Save active queue as a new playlist'
              }
              title={
                isFromRecentlyPlayed
                  ? 'Save priority queue songs as a new playlist'
                  : 'Save active queue as a new playlist'
              }
            >
              <ListPlus className="h-4 w-4" />
            </IconButton>
          )}

          {activeTab === 'queue' && userQueue.length > 0 && (
            <IconButton
              size="sm"
              onClick={clearUserQueue}
              aria-label="Clear user queue"
              title="Clear user-queued songs"
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </IconButton>
          )}

          <IconButton
            size="sm"
            onClick={onClose}
            aria-label="Close queue"
            title="Close queue"
          >
            {mode === 'mobile' ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <X className="h-4 w-4" />
            )}
          </IconButton>
        </div>
      </div>

      {/* ===================== TAB CONTENT: QUEUE ===================== */}
      {activeTab === 'queue' ? (
        <div
          ref={activeListRef}
          data-queue-list="true"
          className="flex-1 overflow-y-auto px-3.5 sm:px-4 py-3 flex flex-col gap-3.5 min-h-0 overscroll-contain no-scrollbar"
          style={{ touchAction: 'pan-y' }}
        >
          {/* SECTION 1: NOW PLAYING */}
          <div className="flex flex-col gap-1.5 pt-1">
            <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-primary font-bold flex items-center justify-between">
              <span>Now Playing</span>
              <span>
                {totalUpcomingSeconds > 0 &&
                  formatTotalTime(totalUpcomingSeconds)}{' '}
                remaining
              </span>
            </span>

            {currentTrack ? (
              <div className="group relative flex items-center gap-3 p-2.5 sm:p-2.5 rounded-surface bg-primary/6 border border-primary/20 shadow-raised transition-all duration-200 hover:border-primary/35 hover:bg-primary/8">
                {/* Artwork with Equalizer Indicator */}
                <div className="relative w-12 h-12 sm:w-11 sm:h-11 rounded-control bg-background border border-border shrink-0 overflow-hidden shadow-raised">
                  {currentTrack.coverImageUrl ? (
                    <img
                      src={currentTrack.coverImageUrl}
                      alt={currentTrack.title}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-serif italic text-caption text-muted-foreground">
                      ♪
                    </div>
                  )}
                </div>

                {/* Title & Artist */}
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-body sm:text-caption font-sans font-semibold text-foreground truncate leading-tight">
                    {currentTrack.title}
                  </span>
                  <span className="text-caption sm:text-eyebrow text-muted-foreground truncate font-sans mt-0.5">
                    {currentTrack.artistName}
                  </span>
                </div>

                {/* Right Actions: Three-dot menu on desktop only */}
                <div className="hidden sm:block shrink-0">
                  <SongActionMenu track={currentTrack} align="right" />
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-muted-foreground italic font-serif text-caption border border-dashed border-border rounded-control">
                No track currently loaded
              </div>
            )}
          </div>

          {/* SECTION 2: LIVE JAM COLLABORATIVE QUEUE */}
          {activeJamRoom && (
            <div className="flex flex-col gap-2 pt-3">
              <div className="flex items-center justify-between">
                <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-success font-semibold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                  Jam Queue ({jamQueue.length})
                </span>
                <span className="text-eyebrow text-muted-foreground font-mono">
                  Room: {activeJamRoom.roomCode}
                </span>
              </div>

              {jamQueue.length === 0 ? (
                <p className="text-caption text-muted-foreground/70 italic py-2">
                  No tracks in Jam queue yet. Use "Add to Jam Queue" on any song
                  to contribute!
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  {jamQueue.map((track, idx) => (
                    <QueueSongRow
                      key={`jam-q-${track.id}-${idx}`}
                      track={jamTrackToPlayerTrack(track)}
                      index={idx}
                      isJamQueue
                      addedByDisplayName={track.addedByDisplayName}
                      onRemove={() => removeFromJamQueue(idx)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SECTION 3: NEXT IN QUEUE (User Priority Queue) */}
          <div className="flex flex-col gap-2 pt-3">
            <div className="flex items-center justify-between">
              <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-foreground font-semibold">
                Next In Queue ({userQueue.length})
              </span>
            </div>

            {userQueue.length === 0 ? (
              <div className="py-5 px-3 rounded-control border border-dashed border-border text-center space-y-1">
                <p className="font-serif italic text-caption text-muted-foreground">
                  Queue is empty.
                </p>
                <p className="font-sans text-eyebrow text-muted-foreground/70">
                  Swipe left on songs across Groovy or tap "Play Next" to add
                  them here.
                </p>
              </div>
            ) : (
              <UserQueueReorderList
                tracks={userQueue}
                scrollContainerRef={activeListRef}
                onReorder={reorderUserQueue}
                onPlayTrack={playUserQueueTrack}
                onRemoveTrack={removeFromUserQueue}
              />
            )}
          </div>

          {/* SECTION 4: NEXT FROM CONTEXT (Album / Playlist) */}
          <div className="flex flex-col gap-2 pt-3">
            <div className="flex items-center justify-between">
              <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground font-semibold truncate">
                {contextTitle
                  ? `Next from: ${contextTitle}`
                  : 'Next from Context'}
              </span>
              <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground/70">
                {upcomingContext.length} upcoming
              </span>
            </div>

            {upcomingContext.length === 0 ? (
              <p className="text-caption text-muted-foreground/70 italic py-2">
                End of album / playlist playback.
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {upcomingContext.map((track, offset) => {
                  const actualIndex = contextIndex + 1 + offset
                  return (
                    <QueueSongRow
                      key={`ctx-q-${track.id}-${actualIndex}`}
                      track={track}
                      index={actualIndex}
                      isContextQueue
                      onPlay={() => jumpToContextTrack(actualIndex)}
                    />
                  )
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ===================== TAB CONTENT: HISTORY ===================== */
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 flex flex-col gap-3 min-h-0 overscroll-contain"
          style={{ touchAction: 'pan-y' }}
        >
          <div className="flex items-center justify-between border-b border-border pb-2">
            <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-foreground font-semibold">
              Recently Listened
            </span>
            <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground">
              Past Sessions
            </span>
          </div>

          {!isAuthenticated ? (
            <div className="py-8 px-4 text-center space-y-3">
              <p className="font-serif italic text-body text-muted-foreground">
                Listening history requires an account
              </p>
              <p className="text-caption text-muted-foreground/80 max-w-xs mx-auto">
                Sign in to track recently played records, synchronize playbacks,
                and revisit past sessions.
              </p>
              <button
                type="button"
                onClick={() =>
                  openAuthModal({
                    title: 'Playback History',
                    description:
                      'Sign in to synchronize your listening history across devices.',
                  })
                }
                className="font-eyebrow text-eyebrow uppercase tracking-wider px-3 py-1.5 bg-foreground text-background rounded-control hover:bg-background hover:text-foreground border border-foreground transition-colors cursor-pointer"
              >
                Sign In
              </button>
            </div>
          ) : isLoadingHistory ? (
            <div className="py-8 text-center font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground animate-pulse">
              Loading listening history...
            </div>
          ) : historyItems.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground italic font-serif text-caption">
              No listening history recorded yet. Start spinning some records!
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {historyItems.map((item, idx) => {
                const playerTrack = historySongToPlayerTrack(item.song)
                return (
                  <div
                    key={`hist-${item.song.id}-${idx}`}
                    onClick={() => playTrack(playerTrack)}
                    className="group flex items-center justify-between gap-2.5 p-2 rounded-control hover:bg-muted bg-card transition-colors cursor-pointer border border-transparent hover:border-border"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {/* Artwork */}
                      <div className="relative w-8 h-8 rounded-control bg-background border border-border shrink-0 overflow-hidden group/thumb">
                        {playerTrack.coverImageUrl ? (
                          <img
                            src={playerTrack.coverImageUrl}
                            alt={playerTrack.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center font-serif italic text-caption text-muted-foreground">
                            ♪
                          </div>
                        )}
                        <div className="absolute inset-0 bg-foreground/40 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center transition-opacity text-background text-eyebrow">
                          ▶
                        </div>
                      </div>

                      {/* Song info & timestamp */}
                      <div className="flex flex-col min-w-0">
                        <span className="text-caption font-sans font-medium truncate text-foreground group-hover:text-primary transition-colors leading-tight">
                          {playerTrack.title}
                        </span>
                        <div className="flex items-center gap-1.5 text-caption text-muted-foreground truncate font-sans">
                          <span className="truncate">
                            {playerTrack.artistName}
                          </span>
                          {item.playedAt && (
                            <span className="font-mono text-eyebrow text-muted-foreground/70 shrink-0">
                              • {formatRelativeTime(item.playedAt)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Action Menu & Duration */}
                    <div
                      className="flex items-center gap-1.5 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <SongActionMenu track={playerTrack} align="right" />
                      <span className="font-mono text-eyebrow text-muted-foreground shrink-0 select-none">
                        {formatSeconds(playerTrack.durationSeconds)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Desktop Side Section
 * Integrated into the document flex layout beside <Outlet /> without any floating backdrop.
 */
export function QueueDesktopSection() {
  const isQueueOpen = usePlayerStore((s) => s.isQueueOpen)
  const setQueueOpen = usePlayerStore((s) => s.setQueueOpen)
  const currentTrack = usePlayerStore((s) => s.currentTrack)

  return (
    <aside
      aria-label="Queue & History Side Panel"
      style={{
        height: currentTrack
          ? 'calc(100vh - 3.5rem - 5rem)'
          : 'calc(100vh - 3.5rem)',
      }}
      className={`hidden md:flex flex-col shrink-0 sticky top-14 z-30 bg-card border-l border-border transition-[width,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden ${
        isQueueOpen
          ? 'w-95 lg:w-100 opacity-100'
          : 'w-0 opacity-0 border-l-0 pointer-events-none'
      }`}
    >
      <div className="w-95 lg:w-100 h-full flex flex-col min-h-0">
        <QueueContent mode="desktop" onClose={() => setQueueOpen(false)} />
      </div>
    </aside>
  )
}

/**
 * Mobile Bottom Sheet Drawer
 * Follows native Spotify/iOS drawer physics:
 * - Locks document body scroll so the page behind cannot scroll.
 * - Smooth slide-up on open, smooth slide-down on close.
 * - Tracks pull-down gesture across handle, header, and list (when at top).
 * - Release past threshold or flick snaps to dismiss; otherwise snaps back.
 */
export function QueueDrawer() {
  const isQueueOpen = usePlayerStore((s) => s.isQueueOpen)
  const setQueueOpen = usePlayerStore((s) => s.setQueueOpen)

  // Animated open/close state for smooth entrance/exit transitions
  const [isOpenAnimated, setIsOpenAnimated] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [sheetTranslateY, setSheetTranslateY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  const listRef = useRef<HTMLDivElement | null>(null)
  const touchDataRef = useRef<{
    startY: number
    startTime: number
    startScrollTop: number
    isActivelyDragging: boolean
  } | null>(null)

  // Body scroll lock on mobile when drawer is open
  useEffect(() => {
    if (!isQueueOpen) return

    // Desktop view uses the side panel (DesktopRightSidebar) and must NOT lock body scroll
    if (typeof window !== 'undefined' && window.innerWidth >= 768) return

    const originalOverflow = document.body.style.overflow
    const originalTouchAction = document.body.style.touchAction

    document.body.style.overflow = 'hidden'
    document.body.style.touchAction = 'none'

    return () => {
      document.body.style.overflow = originalOverflow
      document.body.style.touchAction = originalTouchAction
    }
  }, [isQueueOpen])

  // Slide-up entrance animation on open
  useEffect(() => {
    if (isQueueOpen) {
      setIsClosing(false)
      setSheetTranslateY(0)
      setIsDragging(false)
      // Double rAF ensures element mounts at translateY(100%) before animating to translateY(0)
      const frame = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsOpenAnimated(true)
        })
      })
      return () => cancelAnimationFrame(frame)
    } else {
      setIsOpenAnimated(false)
      setIsClosing(false)
      setSheetTranslateY(0)
      setIsDragging(false)
    }
  }, [isQueueOpen])

  if (!isQueueOpen) return null

  // Smooth dismiss handler with spring animation on mobile
  const handleClose = () => {
    if (isClosing) return
    setIsClosing(true)
    setIsDragging(false)
    setTimeout(() => {
      setQueueOpen(false)
      setIsClosing(false)
      setIsOpenAnimated(false)
      setSheetTranslateY(0)
    }, 280)
  }

  // Unified pull-down gesture across handle, header, and scrollable list
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return
    if (document.body.dataset.queueDragging === 'true') return

    // Never initiate drawer drag-down if touching a queue reorder handle or queue row
    const target = e.target as HTMLElement | null
    if (
      target?.closest('.drag-grip, [data-drag-handle], [data-queue-row-index]')
    ) {
      return
    }

    const touch = e.touches[0]
    const currentScrollTop = listRef.current ? listRef.current.scrollTop : 0

    touchDataRef.current = {
      startY: touch.clientY,
      startTime: Date.now(),
      startScrollTop: currentScrollTop,
      isActivelyDragging: false,
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (document.body.dataset.queueDragging === 'true') {
      touchDataRef.current = null
      return
    }

    if (!touchDataRef.current || e.touches.length !== 1) return

    const target = e.target as HTMLElement | null
    if (
      target?.closest('.drag-grip, [data-drag-handle], [data-queue-row-index]')
    ) {
      touchDataRef.current = null
      return
    }

    const touch = e.touches[0]
    const deltaY = touch.clientY - touchDataRef.current.startY
    const currentScrollTop = listRef.current ? listRef.current.scrollTop : 0

    // If already actively dragging sheet down
    if (touchDataRef.current.isActivelyDragging) {
      if (e.cancelable) e.preventDefault()
      if (deltaY > 0) {
        setSheetTranslateY(deltaY)
      } else {
        setSheetTranslateY(0)
      }
      return
    }

    // Start dragging sheet if pulling down and list is at the very top
    if (deltaY > 8 && currentScrollTop <= 0) {
      touchDataRef.current.isActivelyDragging = true
      setIsDragging(true)
      if (e.cancelable) e.preventDefault()
      setSheetTranslateY(deltaY)
    }
  }

  const handleTouchEnd = () => {
    if (!touchDataRef.current) return

    const { startTime, isActivelyDragging } = touchDataRef.current
    touchDataRef.current = null

    if (isActivelyDragging) {
      setIsDragging(false)
      const elapsed = Date.now() - startTime
      const velocity = sheetTranslateY / Math.max(elapsed, 1)

      // Snap decision: dismiss if pulled down > 110px or with downward flick velocity > 0.4
      if (sheetTranslateY > 110 || (velocity > 0.4 && sheetTranslateY > 30)) {
        handleClose()
      } else {
        // Snap back to open position with spring transition
        setSheetTranslateY(0)
      }
    }
  }

  return (
    <div className="md:hidden">
      {/* Dimmed backdrop with dynamic drag-opacity */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs transition-opacity cursor-pointer"
        style={{
          opacity:
            !isOpenAnimated || isClosing
              ? 0
              : Math.max(0, 1 - sheetTranslateY / 320),
          transition: isDragging ? 'none' : 'opacity 0.25s ease-out',
          touchAction: 'none',
        }}
        onTouchMove={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        onClick={handleClose}
      />

      {/* Responsive Bottom Sheet Drawer */}
      <aside
        aria-label="Queue & History Drawer"
        style={{
          transform:
            !isOpenAnimated || isClosing
              ? 'translateY(100%)'
              : isDragging || sheetTranslateY > 0
                ? `translateY(${sheetTranslateY}px)`
                : 'translateY(0%)',
          transition: isDragging
            ? 'none'
            : 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
        className="fixed inset-x-0 bottom-0 top-14 sm:top-16 z-50 bg-card border-t border-border rounded-t-2xl sm:rounded-t-3xl shadow-2xl flex flex-col overflow-hidden pb-safe select-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {/* Mobile Grab Handle Pill */}
        <div
          className="pt-3 pb-2 flex justify-center cursor-pointer select-none touch-none w-full shrink-0"
          onClick={handleClose}
        >
          <div className="w-12 h-1.5 bg-secondary/40 hover:bg-secondary/60 rounded-full transition-colors" />
        </div>

        <QueueContent mode="mobile" onClose={handleClose} listRef={listRef} />
      </aside>
    </div>
  )
}
