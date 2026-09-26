import React, { useState, useEffect, useRef } from 'react'
import { Link } from '@tanstack/react-router'
import { usePlayerStore } from '../../stores/player.store'
import { useJamStore } from '../../stores/jam.store'
import { useAuthStore } from '../../stores/auth.store'
import { useAuthModalStore } from '../../stores/auth-modal.store'
import { useCreatePlaylistModalStore } from '../../stores/create-playlist-modal.store'
import { useLikesStore } from '../../stores/likes.store'
import { playerApi, type RecentHistoryItem } from '../../lib/player.api'
import { QueueSongRow } from './QueueSongRow'
import { UserQueueReorderList } from './UserQueueReorderList'
import { SongActionMenu } from './SongActionMenu'

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
  const likedSongIds = useLikesStore((s) => s.likedSongIds)
  const toggleSongLike = useLikesStore((s) => s.toggleSongLike)

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

  // Parse source context badge
  const renderSourceContextBadge = () => {
    if (!contextUri && !contextTitle) return null

    if (contextUri?.startsWith('album:')) {
      const albumId = contextUri.replace('album:', '')
      return (
        <Link
          to="/albums/$idOrSlug"
          params={{ idOrSlug: albumId }}
          onClick={() => {
            if (mode === 'mobile') onClose()
          }}
          className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-blue hover:underline max-w-50 truncate"
          title={`Album: ${contextTitle || 'View Release'}`}
        >
          <span>✦ Album:</span>
          <span className="truncate">{contextTitle || 'Release'}</span>
        </Link>
      )
    }

    if (contextUri?.startsWith('playlist:')) {
      const playlistId = contextUri.replace('playlist:', '')
      return (
        <Link
          to="/playlists/$id"
          params={{ id: playlistId }}
          onClick={() => {
            if (mode === 'mobile') onClose()
          }}
          className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-blue hover:underline max-w-50 truncate"
          title={`Playlist: ${contextTitle || 'View Playlist'}`}
        >
          <span>✦ Playlist:</span>
          <span className="truncate">{contextTitle || 'Playlist'}</span>
        </Link>
      )
    }

    return (
      <span className="font-mono text-[9px] uppercase tracking-wider text-ink-soft max-w-50 truncate">
        ✦ From: {contextTitle || 'Catalog'}
      </span>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-panel text-ink">
      {/* ===================== TOP HEADER & TABS ===================== */}
      <div className="h-14 border-b border-line px-4 sm:px-5 flex items-center justify-between shrink-0 gap-2 select-none">
        {/* Left: Tab Switcher (Queue / History) */}
        <div className="flex items-center gap-1 bg-canvas border border-line p-0.5 rounded">
          <button
            type="button"
            onClick={() => setActiveTab('queue')}
            className={`font-mono text-[10px] uppercase tracking-wider px-2.5 py-1 rounded transition-colors cursor-pointer ${
              activeTab === 'queue'
                ? 'bg-panel text-ink font-semibold shadow-2xs border border-line/60'
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            Queue{' '}
            {totalUpcomingTracks > 0 && (
              <span className="font-mono text-[9px] opacity-75">
                ({totalUpcomingTracks})
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`font-mono text-[10px] uppercase tracking-wider px-2.5 py-1 rounded transition-colors cursor-pointer ${
              activeTab === 'history'
                ? 'bg-panel text-ink font-semibold shadow-2xs border border-line/60'
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            History
          </button>
        </div>

        {/* Right Controls: Shuffle, Save as Playlist, Clear Queue, Close */}
        <div className="flex items-center gap-1.5 shrink-0">
          {activeTab === 'queue' && (
            <button
              type="button"
              onClick={toggleShuffle}
              title={
                isShuffle
                  ? 'Shuffle is on - click to disable'
                  : 'Shuffle is off - click to enable'
              }
              aria-label={isShuffle ? 'Disable shuffle' : 'Enable shuffle'}
              className={`font-mono text-[9.5px] uppercase tracking-wider px-2 py-1 rounded transition-colors cursor-pointer flex items-center gap-1.5 border ${
                isShuffle
                  ? 'bg-blue/15 text-blue border-blue/40 font-semibold'
                  : 'text-ink-soft bg-canvas hover:bg-canvas-deep border-line hover:text-ink'
              }`}
            >
              <svg
                className="w-3.5 h-3.5 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="16 3 21 3 21 8" />
                <line x1="4" y1="20" x2="21" y2="3" />
                <polyline points="21 16 21 21 16 21" />
                <line x1="15" y1="15" x2="21" y2="21" />
                <line x1="4" y1="4" x2="9" y2="9" />
              </svg>
              <span className="hidden sm:inline">Shuffle</span>
              {isShuffle && (
                <span className="w-1.5 h-1.5 rounded-full bg-blue shrink-0 animate-pulse" />
              )}
            </button>
          )}

          {activeTab === 'queue' && totalUpcomingTracks > 0 && (
            <button
              type="button"
              onClick={handleSaveQueueAsPlaylist}
              title={
                isFromRecentlyPlayed
                  ? 'Save priority queue songs as a new playlist'
                  : 'Save active queue as a new playlist'
              }
              className="font-mono text-[9.5px] uppercase tracking-wider text-ink bg-canvas hover:bg-canvas-deep border border-line hover:border-ink/60 px-2 py-1 rounded transition-colors cursor-pointer flex items-center gap-1"
            >
              <svg
                className="w-3 h-3 text-ink-soft shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              <span className="hidden sm:inline">Save Queue</span>
            </button>
          )}

          {activeTab === 'queue' && userQueue.length > 0 && (
            <button
              type="button"
              onClick={clearUserQueue}
              className="font-mono text-[9.5px] uppercase tracking-wider text-ink-soft hover:text-red-500 cursor-pointer px-2 py-1 rounded transition-colors"
              title="Clear user-queued songs"
            >
              Clear
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Queue"
            title="Close Queue"
            className="p-1.5 rounded-md text-ink-soft hover:text-ink hover:bg-canvas cursor-pointer transition-colors"
          >
            {mode === 'mobile' ? (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="w-4 h-4"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* ===================== TAB CONTENT: QUEUE ===================== */}
      {activeTab === 'queue' ? (
        <div
          ref={activeListRef}
          data-queue-list="true"
          className="flex-1 overflow-y-auto px-4 sm:px-5 py-3.5 flex flex-col gap-5 divide-y divide-line/60 min-h-0 overscroll-contain"
          style={{ touchAction: 'pan-y' }}
        >
          {/* Queue Telemetry Meta */}
          {totalUpcomingTracks > 0 && (
            <div className="flex items-center justify-between text-ink-soft font-mono text-[9.5px] uppercase tracking-wider pb-1">
              <span>{totalUpcomingTracks} tracks in session</span>
              <span>{formatTotalTime(totalUpcomingSeconds)} remaining</span>
            </div>
          )}

          {/* SECTION 1: NOW PLAYING */}
          <div className="flex flex-col gap-2 pt-2">
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-blue font-bold flex items-center justify-between">
              <span>Now Playing</span>
              {renderSourceContextBadge()}
            </span>

            {currentTrack ? (
              <div className="flex items-center gap-3 p-2.5 rounded-lg bg-blue/5 border border-blue/20 shadow-2xs">
                {/* Artwork with Equalizer Indicator */}
                <div className="relative w-12 h-12 rounded bg-canvas border border-line shrink-0 overflow-hidden">
                  {currentTrack.coverImageUrl ? (
                    <img
                      src={currentTrack.coverImageUrl}
                      alt={currentTrack.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-serif italic text-sm text-ink-soft">
                      ♪
                    </div>
                  )}
                  {playbackStatus === 'playing' && (
                    <div className="absolute inset-0 bg-ink/45 flex items-center justify-center gap-0.5">
                      <span className="w-0.5 h-3 bg-canvas rounded-full animate-pulse" />
                      <span className="w-0.5 h-4 bg-canvas rounded-full animate-pulse delay-75" />
                      <span className="w-0.5 h-2 bg-canvas rounded-full animate-pulse delay-150" />
                    </div>
                  )}
                </div>

                {/* Title & Artist */}
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-xs font-serif italic font-semibold text-ink truncate leading-tight">
                    {currentTrack.title}
                  </span>
                  <span className="text-[11px] text-ink-soft truncate font-sans">
                    {currentTrack.artistName}
                  </span>
                </div>

                {/* Right Actions: Like Heart, Duration, Action Menu */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => toggleSongLike(currentTrack.id)}
                    title={
                      likedSongIds.has(currentTrack.id)
                        ? 'Remove from Liked Songs'
                        : 'Save to Liked Songs'
                    }
                    className="p-1 cursor-pointer transition-colors text-ink-soft hover:text-ink"
                  >
                    <svg
                      className={`w-3.5 h-3.5 transition-colors ${
                        likedSongIds.has(currentTrack.id)
                          ? 'fill-red-500 text-red-500'
                          : 'fill-transparent text-neutral-400 hover:text-ink dark:text-neutral-300 dark:hover:text-white'
                      }`}
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                  </button>

                  <SongActionMenu track={currentTrack} align="right" />

                  <span className="font-mono text-[10.5px] text-ink-soft shrink-0 select-none">
                    {formatSeconds(currentTrack.durationSeconds)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-ink-soft italic font-serif text-xs border border-dashed border-line rounded">
                No track currently loaded
              </div>
            )}
          </div>

          {/* SECTION 2: LIVE JAM COLLABORATIVE QUEUE */}
          {activeJamRoom && (
            <div className="flex flex-col gap-2 pt-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Jam Queue ({jamQueue.length})
                </span>
                <span className="text-[10px] text-ink-soft font-mono">
                  Room: {activeJamRoom.roomCode}
                </span>
              </div>

              {jamQueue.length === 0 ? (
                <p className="text-xs text-ink-soft/70 italic py-2">
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
              <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink font-semibold">
                Next In Queue ({userQueue.length})
              </span>
              {userQueue.length > 0 && (
                <span className="font-mono text-[9px] uppercase tracking-wider text-ink-soft/70">
                  Swipe left to remove · Drag to reorder
                </span>
              )}
            </div>

            {userQueue.length === 0 ? (
              <div className="py-5 px-3 rounded border border-dashed border-line text-center space-y-1">
                <p className="font-serif italic text-xs text-ink-soft">
                  Priority queue is empty
                </p>
                <p className="font-sans text-[11px] text-ink-soft/70">
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
              <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-soft font-semibold truncate">
                {contextTitle
                  ? `Next from: ${contextTitle}`
                  : 'Next from Context'}
              </span>
              <span className="font-mono text-[9px] uppercase tracking-wider text-ink-soft/70">
                {upcomingContext.length} upcoming
              </span>
            </div>

            {upcomingContext.length === 0 ? (
              <p className="text-xs text-ink-soft/70 italic py-2">
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
          <div className="flex items-center justify-between border-b border-line pb-2">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink font-semibold">
              Recently Listened
            </span>
            <span className="font-mono text-[9px] uppercase tracking-wider text-ink-soft">
              Past Sessions
            </span>
          </div>

          {!isAuthenticated ? (
            <div className="py-8 px-4 text-center space-y-3">
              <p className="font-serif italic text-sm text-ink-soft">
                Listening history requires an account
              </p>
              <p className="text-xs text-ink-soft/80 max-w-xs mx-auto">
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
                className="font-mono text-[10px] uppercase tracking-wider px-3 py-1.5 bg-ink text-canvas rounded hover:bg-canvas hover:text-ink border border-ink transition-colors cursor-pointer"
              >
                Sign In
              </button>
            </div>
          ) : isLoadingHistory ? (
            <div className="py-8 text-center font-mono text-[10.5px] uppercase tracking-wider text-ink-soft animate-pulse">
              Loading listening history...
            </div>
          ) : historyItems.length === 0 ? (
            <div className="py-8 text-center text-ink-soft italic font-serif text-xs">
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
                    className="group flex items-center justify-between gap-2.5 p-2 rounded-md hover:bg-canvas-deep bg-panel transition-colors cursor-pointer border border-transparent hover:border-line"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {/* Artwork */}
                      <div className="relative w-8 h-8 rounded bg-canvas border border-line shrink-0 overflow-hidden group/thumb">
                        {playerTrack.coverImageUrl ? (
                          <img
                            src={playerTrack.coverImageUrl}
                            alt={playerTrack.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center font-serif italic text-xs text-ink-soft">
                            ♪
                          </div>
                        )}
                        <div className="absolute inset-0 bg-ink/40 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center transition-opacity text-canvas text-[9px]">
                          ▶
                        </div>
                      </div>

                      {/* Song info & timestamp */}
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-serif italic truncate text-ink group-hover:text-blue transition-colors leading-tight">
                          {playerTrack.title}
                        </span>
                        <div className="flex items-center gap-1.5 text-[10.5px] text-ink-soft truncate font-sans">
                          <span className="truncate">
                            {playerTrack.artistName}
                          </span>
                          {item.playedAt && (
                            <span className="font-mono text-[9px] text-ink-soft/70 shrink-0">
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
                      <span className="font-mono text-[10.5px] text-ink-soft shrink-0 select-none">
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
      className={`hidden md:flex flex-col shrink-0 sticky top-14 z-30 bg-panel border-l border-line transition-[width,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden ${
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
        className="fixed inset-x-0 bottom-0 top-12 sm:top-16 z-50 bg-panel border-t border-line rounded-t-2xl sm:rounded-t-3xl shadow-2xl flex flex-col overflow-hidden pb-safe select-none"
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
          <div className="w-12 h-1.5 bg-stone/40 hover:bg-stone/60 rounded-full transition-colors" />
        </div>

        <QueueContent mode="mobile" onClose={handleClose} listRef={listRef} />
      </aside>
    </div>
  )
}
