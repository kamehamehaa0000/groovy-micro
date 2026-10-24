import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import {
  Disc3,
  ListMusic,
  ListPlus,
  MoreVertical,
  Play,
  SkipForward,
  Trash2,
  User,
} from 'lucide-react'
import { usePlayerStore } from '../../stores/player.store'
import { useAddToPlaylistModalStore } from '../../stores/add-to-playlist-modal.store'
import type { PlayerTrack } from '../../types/player'
import { ProceduralCover } from './ProceduralCover'

/**
 * Minimal release shape shared by vault releases and album/release detail pages.
 * Album pages can also pass already-mapped `tracks` through the `tracks` prop.
 */
export interface ReleaseMenuTrack {
  id: string
  title: string
  durationSeconds?: number | null
  artistId?: string | null
  artistName?: string | null
  artistStageName?: string | null
  artistSlug?: string | null
  albumId?: string | null
  albumTitle?: string | null
  albumSlug?: string | null
  audioUrl?: string | null
  hlsManifestUrl?: string | null
  rawAudioKey?: string | null
  coverImageUrl?: string | null
  isExplicit?: boolean
  scope?: 'GLOBAL' | 'PERSONAL'
}

export interface ReleaseMenuRelease {
  id: string
  title: string
  slug: string
  coverImageUrl?: string | null
  artistId?: string | null
  artistName?: string | null
  artistStageName?: string | null
  artistSlug?: string | null
  scope?: 'GLOBAL' | 'PERSONAL'
  tracks?: ReleaseMenuTrack[]
}

export interface ReleaseActionMenuProps<
  R extends ReleaseMenuRelease = ReleaseMenuRelease,
> {
  release: R
  /** Pre-mapped player tracks. Falls back to `release.tracks`. */
  tracks?: PlayerTrack[]
  buttonClassName?: string
  align?: 'left' | 'right'
  hideGoToRelease?: boolean
  onDeleteRequest?: (release: R) => void
}

/**
 * Release-level overflow menu.
 *
 * The same menu powers vault releases and the album/release detail header.
 * Actions operate on the whole release: play, play next, add to queue, and
 * add to playlist (batch).
 */
export function ReleaseActionMenu<
  R extends ReleaseMenuRelease = ReleaseMenuRelease,
>({
  release,
  tracks,
  buttonClassName = 'p-1.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer rounded-full flex items-center justify-center hover:bg-muted/80',
  align = 'right',
  hideGoToRelease = false,
  onDeleteRequest,
}: ReleaseActionMenuProps<R>) {
  const [isOpen, setIsOpen] = useState(false)
  const [dropdownPos, setDropdownPos] = useState<{
    top: number
    left: number
    openUp: boolean
  } | null>(null)

  // Mobile snapping & drag-to-dismiss state
  const [sheetTranslateY, setSheetTranslateY] = useState(0)
  const [isDraggingSheet, setIsDraggingSheet] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const sheetTouchStartRef = useRef<{ y: number; time: number } | null>(null)

  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const navigate = useNavigate()

  const playTrack = usePlayerStore((s) => s.playTrack)
  const addToQueue = usePlayerStore((s) => s.addToQueue)
  const playNext = usePlayerStore((s) => s.playNext)

  const releaseArtistName =
    release.artistName || release.artistStageName || 'Unknown Artist'

  const getReleasePlayerTracks = (): PlayerTrack[] => {
    const source: PlayerTrack[] =
      tracks ??
      (release.tracks || []).map(
        (track): PlayerTrack => ({
          id: track.id,
          title: track.title,
          durationSeconds: track.durationSeconds ?? 0,
          artistId: track.artistId || release.artistId || '',
          artistName:
            track.artistName ||
            track.artistStageName ||
            release.artistName ||
            release.artistStageName ||
            'Unknown Artist',
          artistSlug: track.artistSlug || release.artistSlug || undefined,
          albumId: track.albumId || release.id,
          albumTitle: track.albumTitle || release.title,
          albumSlug: track.albumSlug || release.slug,
          coverImageUrl:
            track.coverImageUrl || release.coverImageUrl || undefined,
          audioUrl: track.audioUrl || '',
          hlsManifestUrl: track.hlsManifestUrl || undefined,
          rawAudioKey: track.rawAudioKey || undefined,
          scope: track.scope || release.scope || 'PERSONAL',
          isExplicit: track.isExplicit,
        }),
      )

    return source.filter((track) => track.isStreamable !== false)
  }

  // Playable tracks for this release (empty for upcoming/locked releases).
  const playableTracks = getReleasePlayerTracks()
  const canPlay = playableTracks.length > 0

  // Measure and position dropdown relative to viewport
  const updatePosition = () => {
    if (!buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const openUp = spaceBelow < 260 && rect.top > 260
    const menuWidth = 208 // 13rem = w-52
    let left = align === 'right' ? rect.right - menuWidth : rect.left
    left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8))
    const top = openUp ? rect.top - 6 : rect.bottom + 6
    setDropdownPos({ top, left, openUp })
  }

  // Smooth dismiss handler with animation on mobile
  const handleCloseSheet = () => {
    setIsClosing(true)
    setTimeout(() => {
      setIsOpen(false)
      setIsClosing(false)
      setSheetTranslateY(0)
    }, 220)
  }

  // Mobile pull-down-to-dismiss gesture handling
  const handleSheetTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return
    sheetTouchStartRef.current = { y: e.touches[0].clientY, time: Date.now() }
    setIsDraggingSheet(true)
  }

  const handleSheetTouchMove = (e: React.TouchEvent) => {
    if (!sheetTouchStartRef.current || e.touches.length !== 1) return
    const currentY = e.touches[0].clientY
    const deltaY = currentY - sheetTouchStartRef.current.y
    if (deltaY > 0) {
      setSheetTranslateY(deltaY)
      if (e.cancelable) e.preventDefault()
    } else {
      setSheetTranslateY(Math.max(-15, deltaY * 0.15))
    }
  }

  const handleSheetTouchEnd = () => {
    if (!sheetTouchStartRef.current) return
    const elapsed = Date.now() - sheetTouchStartRef.current.time
    const currentDeltaY = sheetTranslateY
    const velocity = currentDeltaY / Math.max(elapsed, 1)

    sheetTouchStartRef.current = null
    setIsDraggingSheet(false)

    if (currentDeltaY > 80 || (velocity > 0.4 && currentDeltaY > 25)) {
      setIsClosing(true)
      setTimeout(() => {
        setIsOpen(false)
        setIsClosing(false)
        setSheetTranslateY(0)
      }, 220)
    } else {
      setSheetTranslateY(0)
    }
  }

  // Body scroll lock on mobile when the sheet is open
  useEffect(() => {
    if (!isOpen) return
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640
    if (!isMobile) return

    const originalOverflow = document.body.style.overflow
    const originalTouchAction = document.body.style.touchAction

    document.body.style.overflow = 'hidden'
    document.body.style.touchAction = 'none'

    return () => {
      document.body.style.overflow = originalOverflow
      document.body.style.touchAction = originalTouchAction
    }
  }, [isOpen])

  // Close dropdown on outside click or Escape, and reposition on resize/scroll
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        buttonRef.current &&
        !buttonRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        sheetRef.current &&
        !sheetRef.current.contains(target)
      ) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }

    const handleScrollOrResize = () => {
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect()
        if (rect.top < -50 || rect.bottom > window.innerHeight + 50) {
          setIsOpen(false)
        } else {
          updatePosition()
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('scroll', handleScrollOrResize, true)
    window.addEventListener('resize', handleScrollOrResize)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', handleScrollOrResize, true)
      window.removeEventListener('resize', handleScrollOrResize)
    }
  }, [isOpen, align])

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isOpen) {
      updatePosition()
      setSheetTranslateY(0)
      setIsClosing(false)
      setIsOpen(true)
    } else {
      setIsOpen(false)
    }
  }

  const handlePlayRelease = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const queue = playableTracks
    if (queue.length === 0) {
      toast.error('No playable tracks in this release')
      setIsOpen(false)
      return
    }
    setIsOpen(false)
    playTrack(queue[0], queue)
  }

  const handlePlayNext = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const queue = playableTracks
    if (queue.length === 0) {
      toast.error('No playable tracks in this release')
      setIsOpen(false)
      return
    }
    setIsOpen(false)
    // Add tracks in reverse order with playNext so the first track plays next
    for (let i = queue.length - 1; i >= 0; i--) {
      playNext(queue[i])
    }
    toast.success(`Playing ${release.title} next`)
  }

  const handleAddToQueue = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const queue = playableTracks
    if (queue.length === 0) {
      toast.error('No playable tracks in this release')
      setIsOpen(false)
      return
    }
    setIsOpen(false)
    queue.forEach((track) => addToQueue(track))
    toast.success(
      `Added ${queue.length} ${queue.length === 1 ? 'track' : 'tracks'} to queue`,
    )
  }

  const handleAddToPlaylist = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const queue = playableTracks
    if (queue.length === 0) {
      toast.error('No playable tracks in this release')
      setIsOpen(false)
      return
    }
    setIsOpen(false)
    useAddToPlaylistModalStore
      .getState()
      .openModalForTracks(queue, release.title)
  }

  const handleGoToRelease = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsOpen(false)
    navigate({
      to: '/albums/$idOrSlug',
      params: { idOrSlug: release.slug || release.id },
    })
  }

  const handleGoToArtist = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsOpen(false)
    const target = release.artistSlug || release.artistId
    if (target) {
      navigate({
        to: '/artists/$idOrSlug',
        params: { idOrSlug: target },
      })
    }
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsOpen(false)
    onDeleteRequest?.(release)
  }

  const canUsePortal = typeof document !== 'undefined'

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        aria-label="Release options"
        className={buttonClassName}
        title="More options"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {/* ==================== DESKTOP FLOATING DROPDOWN VIA PORTAL ==================== */}
      {isOpen &&
        dropdownPos &&
        canUsePortal &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: 'fixed',
              top: dropdownPos.openUp ? undefined : `${dropdownPos.top}px`,
              bottom: dropdownPos.openUp
                ? `${window.innerHeight - dropdownPos.top}px`
                : undefined,
              left: `${dropdownPos.left}px`,
              zIndex: 99999,
            }}
            className="hidden sm:block w-52 border border-border bg-card shadow-floating py-1 divide-y divide-border/40 rounded-surface font-sans text-caption animate-in fade-in zoom-in-95 duration-100"
            onClick={(e) => e.stopPropagation()}
          >
            {canPlay && (
              <div className="py-1">
                <button
                  type="button"
                  onClick={handlePlayRelease}
                  className="w-full text-left px-3.5 py-2 hover:bg-muted flex items-center gap-2.5 text-foreground cursor-pointer"
                >
                  <Play className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span>Play Release</span>
                </button>
                <button
                  type="button"
                  onClick={handlePlayNext}
                  className="w-full text-left px-3.5 py-2 hover:bg-muted flex items-center gap-2.5 text-foreground cursor-pointer"
                >
                  <SkipForward className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span>Play Next</span>
                </button>
                <button
                  type="button"
                  onClick={handleAddToQueue}
                  className="w-full text-left px-3.5 py-2 hover:bg-muted flex items-center gap-2.5 text-foreground cursor-pointer"
                >
                  <ListPlus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span>Add to Queue</span>
                </button>
                <button
                  type="button"
                  onClick={handleAddToPlaylist}
                  className="w-full text-left px-3.5 py-2 hover:bg-muted flex items-center gap-2.5 text-foreground cursor-pointer"
                >
                  <ListMusic className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span>Add to Playlist</span>
                </button>
              </div>
            )}

            <div className="py-1">
              {!hideGoToRelease && (
                <button
                  type="button"
                  onClick={handleGoToRelease}
                  className="w-full text-left px-3.5 py-2 hover:bg-muted flex items-center gap-2.5 text-foreground cursor-pointer truncate"
                >
                  <Disc3 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">Go to Release</span>
                </button>
              )}
              {(release.artistSlug || release.artistId) && (
                <button
                  type="button"
                  onClick={handleGoToArtist}
                  className="w-full text-left px-3.5 py-2 hover:bg-muted flex items-center gap-2.5 text-foreground cursor-pointer truncate"
                >
                  <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">Go to Artist</span>
                </button>
              )}
            </div>

            {onDeleteRequest && (
              <div className="py-1">
                <button
                  type="button"
                  onClick={handleDelete}
                  className="w-full text-left px-3.5 py-2 hover:bg-destructive/20 flex items-center gap-2.5 text-destructive cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive shrink-0" />
                  <span>Delete from Vault</span>
                </button>
              </div>
            )}
          </div>,
          document.body,
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
            {/* Dimmed backdrop with dynamic drag-opacity */}
            <div
              className="fixed inset-0 bg-foreground/20 backdrop-blur-xs animate-in fade-in duration-200 cursor-pointer"
              style={{
                opacity: Math.max(0, 1 - sheetTranslateY / 260),
                transition: isDraggingSheet ? 'none' : 'opacity 0.2s ease-out',
                touchAction: 'none',
              }}
              onTouchMove={(e) => {
                e.preventDefault()
                e.stopPropagation()
              }}
              onClick={(e) => {
                e.stopPropagation()
                handleCloseSheet()
              }}
            />

            {/* Slide-up Sheet */}
            <div
              style={{
                transform: isClosing
                  ? 'translateY(100%)'
                  : `translateY(${sheetTranslateY}px)`,
                transition: isDraggingSheet
                  ? 'none'
                  : 'transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)',
              }}
              className="relative z-10 w-full max-h-[85vh] bg-card border-t border-border shadow-floating rounded-t-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200 pb-safe"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Grab indicator pill zone */}
              <div
                className="pt-3 pb-2 flex justify-center cursor-pointer select-none touch-none w-full"
                onTouchStart={handleSheetTouchStart}
                onTouchMove={handleSheetTouchMove}
                onTouchEnd={handleSheetTouchEnd}
                onTouchCancel={handleSheetTouchEnd}
                onClick={handleCloseSheet}
              >
                <div className="w-12 h-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50 rounded-full transition-colors" />
              </div>

              {/* Release context header */}
              <div
                className="px-5 py-3 flex items-center gap-3.5 border-b border-border/60 touch-none select-none"
                onTouchStart={handleSheetTouchStart}
                onTouchMove={handleSheetTouchMove}
                onTouchEnd={handleSheetTouchEnd}
                onTouchCancel={handleSheetTouchEnd}
              >
                <div className="w-12 h-12 bg-muted border border-border rounded-control overflow-hidden shrink-0">
                  {release.coverImageUrl ? (
                    <img
                      src={release.coverImageUrl}
                      alt={release.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ProceduralCover
                      size="sm"
                      title={release.title}
                      artistName={releaseArtistName}
                      className="w-full h-full text-caption"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-sans font-semibold text-body sm:text-title text-foreground truncate">
                    {release.title}
                  </p>
                  <p className="font-sans text-caption text-muted-foreground truncate">
                    {releaseArtistName}
                  </p>
                </div>
              </div>

              {/* Action rows */}
              <div
                className="overflow-y-auto max-h-[55vh] py-1 divide-y divide-border/30 font-sans text-body overscroll-contain"
                style={{ touchAction: 'pan-y' }}
              >
                {canPlay && (
                  <div className="py-1">
                    <button
                      type="button"
                      onClick={handlePlayRelease}
                      className="w-full text-left px-5 py-3.5 hover:bg-muted flex items-center gap-3.5 text-foreground cursor-pointer active:bg-muted"
                    >
                      <Play className="h-4 w-4 text-primary shrink-0" />
                      <span>Play Release</span>
                    </button>
                    <button
                      type="button"
                      onClick={handlePlayNext}
                      className="w-full text-left px-5 py-3.5 hover:bg-muted flex items-center gap-3.5 text-foreground cursor-pointer active:bg-muted"
                    >
                      <SkipForward className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span>Play Next</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleAddToQueue}
                      className="w-full text-left px-5 py-3.5 hover:bg-muted flex items-center gap-3.5 text-foreground cursor-pointer active:bg-muted"
                    >
                      <ListPlus className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span>Add to Queue</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleAddToPlaylist}
                      className="w-full text-left px-5 py-3.5 hover:bg-muted flex items-center gap-3.5 text-foreground cursor-pointer active:bg-muted"
                    >
                      <ListMusic className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span>Add to Playlist</span>
                    </button>
                  </div>
                )}

                <div className="py-1">
                  {!hideGoToRelease && (
                    <button
                      type="button"
                      onClick={handleGoToRelease}
                      className="w-full text-left px-5 py-3.5 hover:bg-muted flex items-center gap-3.5 text-foreground cursor-pointer active:bg-muted"
                    >
                      <Disc3 className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span>Go to Release</span>
                    </button>
                  )}
                  {(release.artistSlug || release.artistId) && (
                    <button
                      type="button"
                      onClick={handleGoToArtist}
                      className="w-full text-left px-5 py-3.5 hover:bg-muted flex items-center gap-3.5 text-foreground cursor-pointer active:bg-muted"
                    >
                      <User className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span>Go to Artist</span>
                    </button>
                  )}
                </div>

                {onDeleteRequest && (
                  <div className="py-1">
                    <button
                      type="button"
                      onClick={handleDelete}
                      className="w-full text-left px-5 py-3.5 hover:bg-destructive/20 flex items-center gap-3.5 text-destructive cursor-pointer active:bg-destructive-soft"
                    >
                      <Trash2 className="h-4 w-4 text-destructive shrink-0" />
                      <span>Delete from Vault</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
