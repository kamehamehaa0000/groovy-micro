import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { playlistsApi } from '../lib/playlists.api'
import type { Playlist, CreatePlaylistInput } from '../types/playlist'
import { useAuthStore } from '../stores/auth.store'
import { usePlaylistsStore } from '../stores/playlists.store'
import { useAuthModalStore } from '../stores/auth-modal.store'
import { PlaylistCover } from '../components/PlaylistCover'
import { PlusIconSVG, HeartIconSVG } from '../components/icons'

export const Route = createFileRoute('/playlists/')({
  component: PlaylistsIndexComponent,
})

function PlaylistsIndexComponent() {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuthStore()
  const { isPlaylistSaved, toggleSavePlaylist, hydratePlaylists } = usePlaylistsStore()

  const [activeTab, setActiveTab] = useState<'discover' | 'my' | 'saved'>('discover')
  const [search, setSearch] = useState('')
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)

  // Create Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newVisibility, setNewVisibility] = useState<'PUBLIC' | 'UNLISTED' | 'PRIVATE'>('PUBLIC')
  const [newAllowDuplicates, setNewAllowDuplicates] = useState(false)
  const [newAllowComments, setNewAllowComments] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  // Load playlists based on active tab & search
  useEffect(() => {
    let isMounted = true

    const loadData = async () => {
      setIsLoading(true)
      try {
        if (activeTab === 'discover') {
          const res = await playlistsApi.searchPlaylists({
            search: search.trim() || undefined,
            limit: 24,
          })
          if (isMounted) {
            setPlaylists(res.data)
            setTotalCount(res.pagination.total)
            hydratePlaylists(res.data)
          }
        } else if (activeTab === 'my' && isAuthenticated) {
          const res = await playlistsApi.getUserPlaylists()
          if (isMounted) {
            const filtered = search.trim()
              ? res.playlists.filter((p) =>
                  p.title.toLowerCase().includes(search.toLowerCase())
                )
              : res.playlists
            setPlaylists(filtered)
            setTotalCount(filtered.length)
            hydratePlaylists(filtered)
          }
        } else if (activeTab === 'saved' && isAuthenticated) {
          const res = await playlistsApi.getUserSavedPlaylists()
          if (isMounted) {
            const filtered = search.trim()
              ? res.playlists.filter((p) =>
                  p.title.toLowerCase().includes(search.toLowerCase())
                )
              : res.playlists
            setPlaylists(filtered)
            setTotalCount(filtered.length)
            hydratePlaylists(filtered)
          }
        }
      } catch (err) {
        console.error('Failed to load playlists:', err)
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    const timer = setTimeout(loadData, 200)
    return () => {
      isMounted = false
      clearTimeout(timer)
    }
  }, [activeTab, search, isAuthenticated, hydratePlaylists])

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim()) {
      setModalError('Please provide a playlist title')
      return
    }

    setIsSubmitting(true)
    setModalError(null)

    try {
      const input: CreatePlaylistInput = {
        title: newTitle.trim(),
        description: newDescription.trim() || undefined,
        visibility: newVisibility,
        allowDuplicates: newAllowDuplicates,
        allowComments: newAllowComments,
      }

      const created = await playlistsApi.createPlaylist(input)
      hydratePlaylists([{ id: created.id, isSaved: true }])
      setIsCreateModalOpen(false)
      setNewTitle('')
      setNewDescription('')
      setNewVisibility('PUBLIC')
      setNewAllowDuplicates(false)
      setNewAllowComments(true)

      navigate({ to: '/playlists/$id', params: { id: created.id } })
    } catch (err: any) {
      setModalError(err.message || 'Failed to create playlist')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleToggleSave = async (e: React.MouseEvent, playlistId: string) => {
    e.preventDefault()
    e.stopPropagation()

    if (!isAuthenticated) {
      useAuthModalStore.getState().openAuthModal({
        category: 'Playlist Library',
        subtitle: 'Playlists',
        title: 'Save this playlist.',
        description:
          'Sign in or create an account to save playlists to your library and keep them synced across devices.',
      })
      return
    }

    try {
      await toggleSavePlaylist(playlistId)
      // Update local card savesCount optimistically
      setPlaylists((prev) =>
        prev.map((pl) => {
          if (pl.id !== playlistId) return pl
          const nextSaved = !isPlaylistSaved(playlistId)
          return {
            ...pl,
            isSaved: nextSaved,
            savesCount: Math.max(0, pl.savesCount + (nextSaved ? 1 : -1)),
          }
        })
      )
    } catch (err) {
      console.error('Failed to toggle playlist save:', err)
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 w-full">
      {/* ===================== HERO BANNER ===================== */}
      <div className="border-b border-line pb-8 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-blue block mb-2">
              Groovy Playlists & Curation
            </span>
            <h1 className="font-serif italic text-3xl sm:text-4xl text-ink tracking-tight">
              Community Soundtracks
            </h1>
            <p className="font-sans text-xs text-ink-soft max-w-lg mt-2 leading-relaxed">
              Explore public collections with real-time mosaic artworks, or craft your own collaborative mixtapes.
            </p>
          </div>

          {/* Action Button */}
          {isAuthenticated ? (
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.14em] py-2.5 px-4 bg-ink text-canvas hover:opacity-90 transition-opacity shrink-0 cursor-pointer shadow-xs"
            >
              <PlusIconSVG className="w-3.5 h-3.5" />
              <span>Create Playlist</span>
            </button>
          ) : (
            <Link
              to="/login"
              className="inline-flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.14em] py-2.5 px-4 bg-ink text-canvas hover:opacity-90 transition-opacity shrink-0 shadow-xs"
            >
              <span>Sign in to Curate</span>
            </Link>
          )}
        </div>

        {/* Navigation Tabs */}
        <div className="mt-8 flex items-center gap-6 border-b border-line pb-px font-mono text-[11px] uppercase tracking-[0.14em]">
          <button
            type="button"
            onClick={() => setActiveTab('discover')}
            className={`pb-2.5 transition-colors cursor-pointer border-b-2 ${
              activeTab === 'discover'
                ? 'text-ink font-semibold border-blue'
                : 'text-ink-soft hover:text-ink border-transparent'
            }`}
          >
            Public Discover
          </button>

          {isAuthenticated && (
            <>
              <button
                type="button"
                onClick={() => setActiveTab('my')}
                className={`pb-2.5 transition-colors cursor-pointer border-b-2 ${
                  activeTab === 'my'
                    ? 'text-ink font-semibold border-blue'
                    : 'text-ink-soft hover:text-ink border-transparent'
                }`}
              >
                Created by Me
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('saved')}
                className={`pb-2.5 transition-colors cursor-pointer border-b-2 ${
                  activeTab === 'saved'
                    ? 'text-ink font-semibold border-blue'
                    : 'text-ink-soft hover:text-ink border-transparent'
                }`}
              >
                Saved to Library
              </button>
            </>
          )}
        </div>

        {/* Search Filter Bar */}
        <div className="mt-6 flex items-center justify-between gap-4 flex-wrap">
          <div className="relative w-full max-w-md">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search playlists by title or theme..."
              className="w-full font-mono text-xs py-2.5 pl-3 pr-8 border border-line bg-panel text-ink placeholder:text-ink-soft/60 focus:outline-none focus:border-ink transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-xs text-ink-soft hover:text-ink cursor-pointer"
              >
                ×
              </button>
            )}
          </div>

          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-soft">
            {totalCount} {totalCount === 1 ? 'Playlist' : 'Playlists'}
          </span>
        </div>
      </div>

      {/* ===================== PLAYLIST CARDS GRID ===================== */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="animate-pulse flex flex-col gap-2.5">
              <div className="w-full aspect-square bg-line/40 border border-line" />
              <div className="h-3 bg-line/40 w-3/4" />
              <div className="h-2.5 bg-line/20 w-1/2" />
            </div>
          ))}
        </div>
      ) : playlists.length === 0 ? (
        <div className="p-16 border border-dashed border-line bg-panel text-center">
          <p className="font-serif italic text-lg text-ink">No playlists found</p>
          <p className="font-mono text-[10.5px] text-ink-soft mt-1.5">
            {activeTab === 'my'
              ? "You haven't created any playlists yet. Click 'Create Playlist' above to get started!"
              : activeTab === 'saved'
                ? "You haven't saved any playlists to your library yet."
                : 'No public playlists match your search query.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5">
          {playlists.map((pl) => {
            const saved = isPlaylistSaved(pl.id)

            return (
              <Link
                key={pl.id}
                to="/playlists/$id"
                params={{ id: pl.id }}
                className="group flex flex-col gap-2.5 text-inherit no-underline"
              >
                {/* 2x2 Mosaic or Custom Artwork */}
                <div className="w-full aspect-square border border-line bg-canvas-deep shadow-2xs overflow-hidden relative group">
                  <PlaylistCover
                    coverImageUrl={pl.coverImageUrl}
                    mosaicCovers={pl.mosaicCovers}
                    title={pl.title}
                    className="w-full h-full transition-transform duration-300 group-hover:scale-105"
                  />

                  {/* 0ms Optimistic Save Bookmark Button */}
                  <button
                    type="button"
                    onClick={(e) => handleToggleSave(e, pl.id)}
                    aria-label={saved ? 'Remove from library' : 'Save to library'}
                    className={`absolute bottom-2 right-2 p-2 border backdrop-blur-md transition-all cursor-pointer shadow-sm ${
                      saved
                        ? 'bg-blue text-canvas border-blue opacity-100'
                        : 'bg-canvas/85 text-ink-soft hover:text-ink border-line opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    <HeartIconSVG className="w-3.5 h-3.5" filled={saved} />
                  </button>

                  {/* Badges Overlay */}
                  <div className="absolute top-2 left-2 flex flex-col gap-1">
                    {pl.visibility !== 'PUBLIC' && (
                      <span className="font-mono text-[8px] uppercase tracking-[0.14em] px-1.5 py-0.5 border border-line bg-canvas/90 backdrop-blur-xs font-semibold text-ink">
                        {pl.visibility}
                      </span>
                    )}
                    {pl.isCollaborative && (
                      <span className="font-mono text-[8px] uppercase tracking-[0.14em] px-1.5 py-0.5 border border-blue/40 bg-blue/90 text-canvas font-semibold">
                        Collab
                      </span>
                    )}
                  </div>
                </div>

                {/* Metadata */}
                <div>
                  <h3 className="font-serif text-sm text-ink truncate group-hover:text-blue transition-colors">
                    {pl.title}
                  </h3>
                  <div className="flex items-center justify-between font-mono text-[10px] text-ink-soft mt-0.5">
                    <span className="truncate max-w-[65%]">
                      {pl.ownerDisplayName || 'Curator'}
                    </span>
                    <span>{pl.tracksCount ?? 0} cuts</span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {/* ===================== CREATE PLAYLIST MODAL ===================== */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-canvas/80 backdrop-blur-sm">
          <div className="w-full max-w-md border border-line bg-panel p-6 shadow-xl relative animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-line pb-3 mb-5">
              <h2 className="font-serif italic text-xl text-ink">Create New Playlist</h2>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="font-mono text-xs text-ink-soft hover:text-ink cursor-pointer"
              >
                ✕
              </button>
            </div>

            {modalError && (
              <div className="mb-4 p-3 border border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400 font-mono text-[10.5px]">
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft mb-1.5">
                  Title *
                </label>
                <input
                  type="text"
                  required
                  maxLength={150}
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Midnight Ambient & Tape Loops"
                  className="w-full font-mono text-xs p-2.5 border border-line bg-canvas text-ink placeholder:text-ink-soft/60 focus:outline-none focus:border-ink"
                />
              </div>

              <div>
                <label className="block font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft mb-1.5">
                  Description
                </label>
                <textarea
                  rows={2}
                  maxLength={1000}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Atmospheric soundscapes curated for deep work..."
                  className="w-full font-mono text-xs p-2.5 border border-line bg-canvas text-ink placeholder:text-ink-soft/60 focus:outline-none focus:border-ink resize-none"
                />
              </div>

              <div>
                <label className="block font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft mb-1.5">
                  Visibility
                </label>
                <select
                  value={newVisibility}
                  onChange={(e: any) => setNewVisibility(e.target.value)}
                  className="w-full font-mono text-xs p-2.5 border border-line bg-canvas text-ink focus:outline-none focus:border-ink"
                >
                  <option value="PUBLIC">Public</option>
                  <option value="UNLISTED">Unlisted</option>
                  <option value="PRIVATE">Private</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft mb-1.5">
                    Duplicate Songs
                  </label>
                  <label className="flex items-center gap-2 p-2.5 border border-line bg-canvas cursor-pointer hover:border-ink transition-colors">
                    <input
                      type="checkbox"
                      checked={newAllowDuplicates}
                      onChange={(e) => setNewAllowDuplicates(e.target.checked)}
                      className="accent-blue"
                    />
                    <span className="font-mono text-[10.5px] text-ink">Allow Dups</span>
                  </label>
                </div>

                <div>
                  <label className="block font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft mb-1.5">
                    Discussion & Comments
                  </label>
                  <label className="flex items-center gap-2 p-2.5 border border-line bg-canvas cursor-pointer hover:border-ink transition-colors">
                    <input
                      type="checkbox"
                      checked={newAllowComments}
                      onChange={(e) => setNewAllowComments(e.target.checked)}
                      className="accent-blue"
                    />
                    <span className="font-mono text-[10.5px] text-ink">Allow Comments</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-line mt-6">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="font-mono text-[11px] uppercase tracking-[0.14em] py-2 px-4 border border-line text-ink-soft hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="font-mono text-[11px] uppercase tracking-[0.14em] py-2 px-5 bg-ink text-canvas font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {isSubmitting ? 'Creating...' : 'Create Playlist'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
