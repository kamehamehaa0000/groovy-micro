import React, { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { usePlayerStore } from '../../stores/player.store'
import type { PlayerTrack } from '../../types/player'
import { PlaylistCover } from '../PlaylistCover'
import {
  PlayIconSVG,
  TrashIconSVG,
  EditIconSVG,
} from '../icons'

export interface PlaylistActionMenuProps {
  playlist: {
    id: string
    title: string
    description?: string | null
    coverImageUrl?: string | null
    mosaicCovers?: string[]
    mosaicCoverUrls?: string[]
    visibility?: 'PUBLIC' | 'UNLISTED' | 'PRIVATE'
    isCollaborative?: boolean
    collaborationToken?: string | null
    shareToken?: string | null
    tracksCount?: number
  }
  tracks?: PlayerTrack[]
  isOwner?: boolean
  canEdit?: boolean
  onClone?: () => void
  onOpenSettings?: () => void
  onDeleteRequest?: () => void
  buttonClassName?: string
  align?: 'left' | 'right'
}

export function PlaylistActionMenu({
  playlist,
  tracks = [],
  isOwner = false,
  canEdit = false,
  onClone,
  onOpenSettings,
  onDeleteRequest,
  buttonClassName = 'p-2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer rounded-full flex items-center justify-center hover:bg-muted border border-border bg-card shadow-raised',
  align = 'right',
}: PlaylistActionMenuProps) {
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

  const addToQueue = usePlayerStore((s) => s.addToQueue)
  const playNext = usePlayerStore((s) => s.playNext)

  // Measure and position dropdown relative to viewport
  const updatePosition = () => {
    if (!buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const openUp = spaceBelow < 260 && rect.top > 260
    const menuWidth = 216 // 13.5rem
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

  const handlePlayNext = () => {
    if (tracks.length === 0) {
      showToast('No playable tracks in this playlist')
      return
    }
    // Reverse when adding playNext so track 1 plays next in order
    const reversed = [...tracks].reverse()
    reversed.forEach((t) => playNext(t))
    showToast(`Queued ${tracks.length} ${tracks.length === 1 ? 'cut' : 'cuts'} to play next`)
    setIsOpen(false)
  }

  const handleAddToQueue = () => {
    if (tracks.length === 0) {
      showToast('No playable tracks in this playlist')
      return
    }
    tracks.forEach((t) => addToQueue(t))
    showToast(`Added ${tracks.length} ${tracks.length === 1 ? 'cut' : 'cuts'} to queue`)
    setIsOpen(false)
  }

  const handleShare = async () => {
    let shareUrl = `${window.location.origin}/playlists/${playlist.id}`
    if (playlist.visibility === 'UNLISTED' && playlist.shareToken) {
      shareUrl = `${window.location.origin}/playlists/${playlist.id}?shareToken=${playlist.shareToken}`
    }

    if (navigator.share) {
      try {
        await navigator.share({
          title: playlist.title,
          text: `Check out ${playlist.title} on Groovy`,
          url: shareUrl,
        })
        setIsOpen(false)
        return
      } catch {
        // Fallback to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl)
      showToast('Share link copied to clipboard!')
    } catch {
      showToast('Could not copy link')
    }
    setIsOpen(false)
  }

  const handleCopyCollabLink = async () => {
    if (!playlist.collaborationToken) return
    const url = `${window.location.origin}/playlists/${playlist.id}?collabToken=${playlist.collaborationToken}`
    try {
      await navigator.clipboard.writeText(url)
      showToast('Collaboration invite link copied!')
    } catch {
      showToast('Could not copy link')
    }
    setIsOpen(false)
  }

  const handleCloneClick = () => {
    setIsOpen(false)
    if (onClone) {
      onClone()
    }
  }

  const handleOpenSettingsClick = () => {
    setIsOpen(false)
    if (onOpenSettings) {
      onOpenSettings()
    }
  }

  const handleDeleteClick = () => {
    setIsOpen(false)
    if (onDeleteRequest) {
      onDeleteRequest()
    }
  }

  const mosaicCovers = playlist.mosaicCovers || playlist.mosaicCoverUrls

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          if (!isOpen) {
            updatePosition()
            setIsOpen(true)
          } else {
            setIsOpen(false)
          }
        }}
        className={buttonClassName}
        title="More playlist options"
        aria-label="Playlist options"
      >
        <span className="font-mono text-body leading-none tracking-widest text-foreground select-none">
          •••
        </span>
      </button>

      {/* Floating Action Menu Portal */}
      {typeof document !== 'undefined' &&
        createPortal(
          <>
            {/* ================= DESKTOP POPUP ================= */}
            {isOpen && (
              <div
                ref={dropdownRef}
                style={{
                  position: 'fixed',
                  top: dropdownPos?.top ?? 0,
                  left: dropdownPos?.left ?? 0,
                  zIndex: 9999,
                }}
                className={`hidden sm:block w-54 bg-card border border-border rounded-xl shadow-xl py-1.5 font-mono text-caption select-none divide-y divide-border/40 animate-in fade-in zoom-in-95 duration-100 ${
                  dropdownPos?.openUp ? 'origin-bottom' : 'origin-top'
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Section 1: Clone & Queueing */}
                <div className="py-1">
                  {onClone && (
                    <button
                      type="button"
                      onClick={handleCloneClick}
                      className="w-full text-left px-3.5 py-2 hover:bg-muted/70 text-foreground transition-colors cursor-pointer flex items-center gap-2.5 font-medium"
                    >
                      <span className="text-primary text-body">✦</span>
                      <span>Clone to Library</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handlePlayNext}
                    className="w-full text-left px-3.5 py-2 hover:bg-muted/70 text-foreground transition-colors cursor-pointer flex items-center gap-2.5"
                  >
                    <PlayIconSVG className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span>Play Next</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleAddToQueue}
                    className="w-full text-left px-3.5 py-2 hover:bg-muted/70 text-foreground transition-colors cursor-pointer flex items-center gap-2.5"
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
                      <line x1="3" y1="6" x2="3.01" y2="6" />
                      <line x1="3" y1="12" x2="3.01" y2="12" />
                      <line x1="3" y1="18" x2="3.01" y2="18" />
                    </svg>
                    <span>Add to Queue</span>
                  </button>
                </div>

                {/* Section 2: Sharing & Collaboration */}
                <div className="py-1">
                  <button
                    type="button"
                    onClick={handleShare}
                    className="w-full text-left px-3.5 py-2 hover:bg-muted/70 text-foreground transition-colors cursor-pointer flex items-center gap-2.5"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="w-3.5 h-3.5 text-muted-foreground shrink-0"
                    >
                      <circle cx="18" cy="5" r="3" />
                      <circle cx="6" cy="12" r="3" />
                      <circle cx="18" cy="19" r="3" />
                      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                    </svg>
                    <span>Share Playlist</span>
                  </button>

                  {playlist.isCollaborative && playlist.collaborationToken && (
                    <button
                      type="button"
                      onClick={handleCopyCollabLink}
                      className="w-full text-left px-3.5 py-2 hover:bg-muted/70 text-foreground transition-colors cursor-pointer flex items-center gap-2.5"
                    >
                      <span className="text-caption">🤝</span>
                      <span>Copy Invite Link</span>
                    </button>
                  )}
                </div>

                {/* Section 3: Settings & Governance (Owner / Editor) */}
                {(isOwner || canEdit) && (
                  <div className="py-1">
                    {onOpenSettings && (
                      <button
                        type="button"
                        onClick={handleOpenSettingsClick}
                        className="w-full text-left px-3.5 py-2 hover:bg-muted/70 text-foreground transition-colors cursor-pointer flex items-center gap-2.5"
                      >
                        <EditIconSVG className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span>Settings</span>
                      </button>
                    )}

                    {isOwner && onDeleteRequest && (
                      <button
                        type="button"
                        onClick={handleDeleteClick}
                        className="w-full text-left px-3.5 py-2 hover:bg-destructive/20 text-destructive hover:text-destructive transition-colors cursor-pointer flex items-center gap-2.5"
                      >
                        <TrashIconSVG className="w-3.5 h-3.5 text-destructive shrink-0" />
                        <span>Delete Playlist</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ================= MOBILE BOTTOM SHEET ================= */}
            {isOpen && (
              <div
                className="fixed inset-0 z-9999 sm:hidden flex flex-col justify-end"
                onClick={(e) => {
                  e.stopPropagation()
                  handleCloseSheet()
                }}
              >
                {/* Backdrop */}
                <div
                  className={`fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-200 ${
                    isClosing ? 'opacity-0' : 'opacity-100'
                  }`}
                />

                {/* Sheet Panel */}
                <div
                  ref={sheetRef}
                  style={{
                    transform: isDraggingSheet
                      ? `translateY(${sheetTranslateY}px)`
                      : isClosing
                      ? 'translateY(100%)'
                      : 'translateY(0)',
                    transition: isDraggingSheet ? 'none' : 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                  className="relative z-10 w-full bg-card border-t border-border rounded-t-2xl shadow-2xl overflow-hidden pb-8 max-h-[85vh] flex flex-col"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Pull Handle */}
                  <div
                    onTouchStart={handleSheetTouchStart}
                    onTouchMove={handleSheetTouchMove}
                    onTouchEnd={handleSheetTouchEnd}
                    className="w-full pt-3 pb-2 flex flex-col items-center justify-center cursor-grab active:cursor-grabbing touch-none select-none"
                  >
                    <div className="w-10 h-1 rounded-full bg-secondary/40" />
                  </div>

                  {/* Playlist Header in Sheet */}
                  <div className="px-5 pb-4 flex items-center gap-3.5 border-b border-border">
                    <div className="w-12 h-12 rounded-md bg-muted border border-border overflow-hidden shrink-0">
                      <PlaylistCover
                        coverImageUrl={playlist.coverImageUrl}
                        mosaicCovers={mosaicCovers}
                        title={playlist.title}
                        className="w-full h-full"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="font-sans font-semibold text-body sm:text-title text-foreground truncate">
                        {playlist.title}
                      </h4>
                      <p className="font-mono text-eyebrow text-muted-foreground truncate mt-0.5">
                        {playlist.tracksCount ?? tracks.length} tracks &bull;{' '}
                        {playlist.visibility || 'PUBLIC'}
                      </p>
                    </div>
                  </div>

                  {/* Action List in Sheet */}
                  <div className="py-2 overflow-y-auto divide-y divide-border/40 font-mono text-caption">
                    {/* Section 1: Clone & Queueing */}
                    <div className="py-1">
                      {onClone && (
                        <button
                          type="button"
                          onClick={handleCloneClick}
                          className="w-full text-left px-5 py-3 hover:bg-muted/70 active:bg-muted text-foreground transition-colors flex items-center gap-3 font-medium"
                        >
                          <span className="text-primary text-title">✦</span>
                          <span className="text-body">Clone to Library</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={handlePlayNext}
                        className="w-full text-left px-5 py-3 hover:bg-muted/70 active:bg-muted text-foreground transition-colors flex items-center gap-3"
                      >
                        <PlayIconSVG className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="text-body">Play Next</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleAddToQueue}
                        className="w-full text-left px-5 py-3 hover:bg-muted/70 active:bg-muted text-foreground transition-colors flex items-center gap-3"
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
                          <line x1="3" y1="6" x2="3.01" y2="6" />
                          <line x1="3" y1="12" x2="3.01" y2="12" />
                          <line x1="3" y1="18" x2="3.01" y2="18" />
                        </svg>
                        <span className="text-body">Add to Queue</span>
                      </button>
                    </div>

                    {/* Section 2: Sharing & Collaboration */}
                    <div className="py-1">
                      <button
                        type="button"
                        onClick={handleShare}
                        className="w-full text-left px-5 py-3 hover:bg-muted/70 active:bg-muted text-foreground transition-colors flex items-center gap-3"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          className="w-4 h-4 text-muted-foreground shrink-0"
                        >
                          <circle cx="18" cy="5" r="3" />
                          <circle cx="6" cy="12" r="3" />
                          <circle cx="18" cy="19" r="3" />
                          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                        </svg>
                        <span className="text-body">Share Playlist</span>
                      </button>

                      {playlist.isCollaborative && playlist.collaborationToken && (
                        <button
                          type="button"
                          onClick={handleCopyCollabLink}
                          className="w-full text-left px-5 py-3 hover:bg-muted/70 active:bg-muted text-foreground transition-colors flex items-center gap-3"
                        >
                          <span className="text-body">🤝</span>
                          <span className="text-body">Copy Invite Link</span>
                        </button>
                      )}
                    </div>

                    {/* Section 3: Settings & Governance (Owner / Editor) */}
                    {(isOwner || canEdit) && (
                      <div className="py-1">
                        {onOpenSettings && (
                          <button
                            type="button"
                            onClick={handleOpenSettingsClick}
                            className="w-full text-left px-5 py-3 hover:bg-muted/70 active:bg-muted text-foreground transition-colors flex items-center gap-3"
                          >
                            <EditIconSVG className="w-4 h-4 text-muted-foreground shrink-0" />
                            <span className="text-body">Settings</span>
                          </button>
                        )}

                        {isOwner && onDeleteRequest && (
                          <button
                            type="button"
                            onClick={handleDeleteClick}
                            className="w-full text-left px-5 py-3 hover:bg-destructive/20 active:bg-destructive-soft text-destructive transition-colors flex items-center gap-3"
                          >
                            <TrashIconSVG className="w-4 h-4 text-destructive shrink-0" />
                            <span className="text-body">Delete Playlist</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Optional Floating Feedback Toast */}
            {toastMessage && (
              <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+8rem)] left-1/2 -translate-x-1/2 z-10000 bg-foreground text-background font-mono text-caption px-4 py-2 rounded-full shadow-lg pointer-events-none animate-in fade-in zoom-in-95 duration-150">
                {toastMessage}
              </div>
            )}
          </>,
          document.body
        )}
    </>
  )
}
