import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useJamStore } from '../../stores/jam.store'
import { useAuthStore } from '../../stores/auth.store'
import { useAuthModalStore } from '../../stores/auth-modal.store'
import { useCreatePlaylistModalStore } from '../../stores/create-playlist-modal.store'

interface MobileActionDrawerProps {
  isOpen: boolean
  onClose: () => void
}

export function MobileActionDrawer({ isOpen, onClose }: MobileActionDrawerProps) {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuthStore()
  const openAuthModal = useAuthModalStore((s) => s.openAuthModal)
  const openCreatePlaylistModal = useCreatePlaylistModalStore((s) => s.openModal)
  const activeJamRoom = useJamStore((s) => s.activeRoom)

  // ESC key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  const handleOpenJam = () => {
    onClose()
    useJamStore.getState().openModal()
  }

  const handleCreatePlaylist = () => {
    onClose()
    if (!isAuthenticated) {
      openAuthModal({
        title: 'Create Playlists',
        description: 'Sign in to build custom playlists and collaborative mixes on Groovy.',
      })
      return
    }
    openCreatePlaylistModal()
  }

  const handleOpenCollection = () => {
    onClose()
    if (!isAuthenticated) {
      openAuthModal({
        title: 'Personal Locker Access',
        description: 'Sign in to access and upload lossless audio in your personal collection.',
      })
      return
    }
    navigate({ to: '/collection' })
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-ink/40 backdrop-blur-xs z-50 transition-opacity"
        onClick={onClose}
      />

      {/* Slide-out Drawer from Right */}
      <aside
        aria-label="Quick Actions Drawer"
        className="fixed top-0 right-0 bottom-0 z-50 w-72 bg-panel border-l border-line p-5 flex flex-col justify-between shadow-2xl transition-transform duration-200 ease-in-out"
      >
        <div className="space-y-5 overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-line pb-4">
            <div>
              <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-blue-deep dark:text-blue-400">
                Quick Actions
              </div>
              <h3 className="font-serif italic text-base font-bold text-ink">
                Create &amp; Collect
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-ink-soft hover:text-ink border border-line hover:border-ink rounded cursor-pointer transition-colors"
              aria-label="Close action drawer"
            >
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Simple Navigation Actions matching Left Sidebar */}
          <div className="space-y-1">
            <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-blue-deep dark:text-blue-400 mb-2">
              Creation Desk
            </div>
            <nav className="flex flex-col gap-1 font-mono text-xs uppercase tracking-[0.14em]">
              <button
                type="button"
                onClick={handleOpenJam}
                className="w-full flex items-center justify-between p-2 text-ink hover:bg-canvas rounded border border-transparent hover:border-line text-left cursor-pointer transition-colors"
              >
                <span className="flex items-center gap-2">
                  <span>Start / Join Live Jam</span>
                  {activeJamRoom && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  )}
                </span>
                <span className="text-ink-soft">&rarr;</span>
              </button>

              <button
                type="button"
                onClick={handleCreatePlaylist}
                className="w-full flex items-center justify-between p-2 text-ink hover:bg-canvas rounded border border-transparent hover:border-line text-left cursor-pointer transition-colors"
              >
                <span>Create Playlist</span>
                <span className="text-ink-soft">&rarr;</span>
              </button>

              <button
                type="button"
                onClick={handleOpenCollection}
                className="w-full flex items-center justify-between p-2 text-ink hover:bg-canvas rounded border border-transparent hover:border-line text-left cursor-pointer transition-colors"
              >
                <span>Personal Collection</span>
                <span className="text-ink-soft">&rarr;</span>
              </button>
            </nav>
          </div>
        </div>

        {/* Footer info */}
        <div className="pt-4 border-t border-line font-mono text-[9px] uppercase tracking-wider text-ink-soft text-center">
          Groovy High-Fidelity Creation Desk
        </div>
      </aside>
    </>
  )
}
