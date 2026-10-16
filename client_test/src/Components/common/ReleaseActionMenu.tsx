import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from '@tanstack/react-router'
import { usePlayerStore } from '../../stores/player.store'
import type { PersonalRelease } from '../../lib/storage.api'
import type { PlayerTrack } from '../../types/player'
import { ProceduralCover } from './ProceduralCover'
import { PlayIconSVG, TrashIconSVG, DiscIconSVG } from '../icons'

export interface ReleaseActionMenuProps {
  release: PersonalRelease
  buttonClassName?: string
  align?: 'left' | 'right'
  onDeleteRequest?: (release: PersonalRelease) => void
}

export function ReleaseActionMenu({
  release,
  buttonClassName = 'p-1.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer rounded-full flex items-center justify-center hover:bg-muted/80',
  align = 'right',
  onDeleteRequest,
}: ReleaseActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [dropdownPos, setDropdownPos] = useState<{
    top: number
    left: number
    openUp: boolean
  } | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Mobile Snapping & Drag-to-Dismiss State
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

  // Convert PersonalRelease tracks to PlayerTracks
  const getReleasePlayerTracks = (): PlayerTrack[] => {
    return (release.tracks || []).map((t) => ({
      id: t.id,
      title: t.title,
      durationSeconds: t.durationSeconds || 0,
      artistId: t.artistId || release.artistId,
      artistName: t.artistName || release.artistName,
      artistSlug: release.artistSlug,
      albumId: release.id,
      albumTitle: release.title,
      albumSlug: release.slug,
      coverImageUrl: release.coverImageUrl || t.coverImageUrl,
      audioUrl: t.audioUrl || '',
      hlsManifestUrl: t.hlsManifestUrl || undefined,
      rawAudioKey: t.rawAudioKey,
      scope: 'PERSONAL',
      isExplicit: t.isExplicit,
    }))
  }

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

  // Body scroll lock on mobile when sheet is open
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

  // Close dropdown on outside click or Escape key, and reposition on resize/scroll
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

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 2200)
  }

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
    const tracks = getReleasePlayerTracks()
    if (tracks.length === 0) {
      showToast('No tracks available in this release')
      setIsOpen(false)
      return
    }
    setIsOpen(false)
    playTrack(tracks[0], tracks)
  }

  const handlePlayNext = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const tracks = getReleasePlayerTracks()
    if (tracks.length === 0) {
      showToast('No tracks available in this release')
      setIsOpen(false)
      return
    }
    setIsOpen(false)
    // Add tracks in reverse order with playNext so the first track plays next
    for (let i = tracks.length - 1; i >= 0; i--) {
      playNext(tracks[i])
    }
    showToast(`Playing ${release.title} next`)
  }

  const handleAddToQueue = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const tracks = getReleasePlayerTracks()
    if (tracks.length === 0) {
      showToast('No tracks available in this release')
      setIsOpen(false)
      return
    }
    setIsOpen(false)
    tracks.forEach((t) => addToQueue(t))
    showToast(`Added ${tracks.length} ${tracks.length === 1 ? 'track' : 'tracks'} to queue`)
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
      {/* 3-Dots Trigger Button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        aria-label="Release options"
        className={buttonClassName}
        title="More options"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>

      {/* Floating Temporary Toast */}
      {toastMessage &&
        canUsePortal &&
        createPortal(
          <div
            style={{ zIndex: 9999999 }}
            className="fixed bottom-[calc(env(safe-area-inset-bottom)+8rem)] sm:bottom-12 left-1/2 -translate-x-1/2 bg-foreground text-background font-mono text-[11px] uppercase tracking-wider py-2 px-4 rounded shadow-2xl animate-in fade-in duration-150 pointer-events-none"
          >
            {toastMessage}
          </div>,
          document.body,
        )}

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
            className="hidden sm:block w-52 border border-border bg-card shadow-2xl py-1 divide-y divide-border/40 rounded-lg font-sans text-xs animate-in fade-in zoom-in-95 duration-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="py-1">
              <button
                type="button"
                onClick={handlePlayRelease}
                className="w-full text-left px-3.5 py-2 hover:bg-muted flex items-center gap-2.5 text-foreground cursor-pointer"
              >
                <PlayIconSVG className="w-3.5 h-3.5 text-primary shrink-0" />
                <span>Play Release</span>
              </button>
              <button
                type="button"
                onClick={handlePlayNext}
                className="w-full text-left px-3.5 py-2 hover:bg-muted flex items-center gap-2.5 text-foreground cursor-pointer"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="w-3.5 h-3.5 text-muted-foreground shrink-0"
                >
                  <polygon points="5 4 15 12 5 20 5 4" fill="currentColor" />
                  <line x1="19" y1="5" x2="19" y2="19" strokeWidth="2.5" />
                </svg>
                <span>Play Next</span>
              </button>
              <button
                type="button"
                onClick={handleAddToQueue}
                className="w-full text-left px-3.5 py-2 hover:bg-muted flex items-center gap-2.5 text-foreground cursor-pointer"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="w-3.5 h-3.5 text-muted-foreground shrink-0"
                >
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" strokeWidth="3" />
                  <line x1="3" y1="12" x2="3.01" y2="12" strokeWidth="3" />
                  <line x1="3" y1="18" x2="3.01" y2="18" strokeWidth="3" />
                </svg>
                <span>Add to Queue</span>
              </button>
            </div>

            <div className="py-1">
              <button
                type="button"
                onClick={handleGoToRelease}
                className="w-full text-left px-3.5 py-2 hover:bg-muted flex items-center gap-2.5 text-foreground cursor-pointer truncate"
              >
                <DiscIconSVG className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="truncate">Go to Release</span>
              </button>
              {(release.artistSlug || release.artistId) && (
                <button
                  type="button"
                  onClick={handleGoToArtist}
                  className="w-full text-left px-3.5 py-2 hover:bg-muted flex items-center gap-2.5 text-foreground cursor-pointer truncate"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="w-3.5 h-3.5 text-muted-foreground shrink-0"
                  >
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  <span className="truncate">Go to Artist</span>
                </button>
              )}
            </div>

            {onDeleteRequest && (
              <div className="py-1">
                <button
                  type="button"
                  onClick={handleDelete}
                  className="w-full text-left px-3.5 py-2 hover:bg-red-500/10 flex items-center gap-2.5 text-red-500 cursor-pointer"
                >
                  <TrashIconSVG className="w-3.5 h-3.5 text-red-500 shrink-0" />
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
              className="relative z-10 w-full max-h-[85vh] bg-card border-t border-border shadow-2xl rounded-t-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200 pb-safe"
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
                <div className="w-12 h-12 bg-muted border border-border rounded overflow-hidden shrink-0">
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
                      artistName={release.artistName}
                      className="w-full h-full text-xs"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-sans font-semibold text-sm sm:text-base text-foreground truncate">
                    {release.title}
                  </p>
                  <p className="font-sans text-xs text-muted-foreground truncate">
                    {release.artistName || 'Unknown Artist'}
                  </p>
                </div>
              </div>

              {/* Action rows */}
              <div
                className="overflow-y-auto max-h-[55vh] py-1 divide-y divide-border/30 font-sans text-sm overscroll-contain"
                style={{ touchAction: 'pan-y' }}
              >
                <div className="py-1">
                  <button
                    type="button"
                    onClick={handlePlayRelease}
                    className="w-full text-left px-5 py-3.5 hover:bg-muted flex items-center gap-3.5 text-foreground cursor-pointer active:bg-muted"
                  >
                    <PlayIconSVG className="w-4 h-4 text-primary shrink-0" />
                    <span>Play Release</span>
                  </button>
                  <button
                    type="button"
                    onClick={handlePlayNext}
                    className="w-full text-left px-5 py-3.5 hover:bg-muted flex items-center gap-3.5 text-foreground cursor-pointer active:bg-muted"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="w-4 h-4 text-muted-foreground shrink-0"
                    >
                      <polygon points="5 4 15 12 5 20 5 4" fill="currentColor" />
                      <line x1="19" y1="5" x2="19" y2="19" strokeWidth="2.5" />
                    </svg>
                    <span>Play Next</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAddToQueue}
                    className="w-full text-left px-5 py-3.5 hover:bg-muted flex items-center gap-3.5 text-foreground cursor-pointer active:bg-muted"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="w-4 h-4 text-muted-foreground shrink-0"
                    >
                      <line x1="8" y1="6" x2="21" y2="6" />
                      <line x1="8" y1="12" x2="21" y2="12" />
                      <line x1="8" y1="18" x2="21" y2="18" />
                      <line x1="3" y1="6" x2="3.01" y2="6" strokeWidth="3" />
                      <line x1="3" y1="12" x2="3.01" y2="12" strokeWidth="3" />
                      <line x1="3" y1="18" x2="3.01" y2="18" strokeWidth="3" />
                    </svg>
                    <span>Add to Queue</span>
                  </button>
                </div>

                <div className="py-1">
                  <button
                    type="button"
                    onClick={handleGoToRelease}
                    className="w-full text-left px-5 py-3.5 hover:bg-muted flex items-center gap-3.5 text-foreground cursor-pointer active:bg-muted"
                  >
                    <DiscIconSVG className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span>Go to Release</span>
                  </button>
                  {(release.artistSlug || release.artistId) && (
                    <button
                      type="button"
                      onClick={handleGoToArtist}
                      className="w-full text-left px-5 py-3.5 hover:bg-muted flex items-center gap-3.5 text-foreground cursor-pointer active:bg-muted"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="w-4 h-4 text-muted-foreground shrink-0"
                      >
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                      <span>Go to Artist</span>
                    </button>
                  )}
                </div>

                {onDeleteRequest && (
                  <div className="py-1">
                    <button
                      type="button"
                      onClick={handleDelete}
                      className="w-full text-left px-5 py-3.5 hover:bg-red-500/10 flex items-center gap-3.5 text-red-500 cursor-pointer active:bg-red-500/10"
                    >
                      <TrashIconSVG className="w-4 h-4 text-red-500 shrink-0" />
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
