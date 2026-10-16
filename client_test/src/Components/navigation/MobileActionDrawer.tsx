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
    navigate({ to: '/vault' })
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-foreground/40 backdrop-blur-xs z-50 transition-opacity"
        onClick={onClose}
      />

      {/* Slide-out Drawer from Right */}
      <aside
        aria-label="Quick Actions Drawer"
        className="fixed top-0 right-0 bottom-0 z-50 w-72 bg-card border-l border-border p-5 flex flex-col justify-between shadow-2xl transition-transform duration-200 ease-in-out"
      >
        <div className="space-y-5 overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <div className="font-eyebrow text-eyebrow uppercase tracking-widest text-primary">
                Quick Actions
              </div>
              <h3 className="font-serif italic text-title font-bold text-foreground">
                Create &amp; Collect
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-muted-foreground hover:text-foreground border border-border hover:border-foreground rounded-control cursor-pointer transition-colors"
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
            <div className="font-eyebrow text-eyebrow uppercase tracking-widest text-primary mb-2">
              Creation Desk
            </div>
            <nav className="flex flex-col gap-1 font-eyebrow text-caption uppercase tracking-wider">
              <button
                type="button"
                onClick={handleOpenJam}
                className="w-full flex items-center justify-between p-2 text-foreground hover:bg-background rounded-control border border-transparent hover:border-border text-left cursor-pointer transition-colors"
              >
                <span className="flex items-center gap-2">
                  <span>Start / Join Live Jam</span>
                  {activeJamRoom && (
                    <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                  )}
                </span>
                <span className="text-muted-foreground">&rarr;</span>
              </button>

              <button
                type="button"
                onClick={handleCreatePlaylist}
                className="w-full flex items-center justify-between p-2 text-foreground hover:bg-background rounded-control border border-transparent hover:border-border text-left cursor-pointer transition-colors"
              >
                <span>Create Playlist</span>
                <span className="text-muted-foreground">&rarr;</span>
              </button>

              <button
                type="button"
                onClick={handleOpenCollection}
                className="w-full flex items-center justify-between p-2 text-foreground hover:bg-background rounded-control border border-transparent hover:border-border text-left cursor-pointer transition-colors"
              >
                <span>Personal Vault</span>
                <span className="text-muted-foreground">&rarr;</span>
              </button>
            </nav>
          </div>
        </div>

        {/* Footer info */}
        <div className="pt-4 border-t border-border font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground text-center">
          Groovy High-Fidelity Creation Desk
        </div>
      </aside>
    </>
  )
}
