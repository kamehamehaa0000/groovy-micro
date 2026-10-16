import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useMemo, useRef } from 'react'
import { useAuthStore } from '../stores/auth.store'
import {
  storageApi,
  type PersonalRelease,
  type PersonalArtist,
  type PersonalTrack,
} from '../lib/storage.api'
import { usePlayerStore } from '../stores/player.store'
import type { PlayerTrack } from '../types/player'
import { ProceduralCover } from '../components/common/ProceduralCover'
import { ReleaseActionMenu } from '../components/common/ReleaseActionMenu'
import {
  PlayIconSVG,
  PauseIconSVG,
  TrashIconSVG,
  UploadCloudSVG,
  ShuffleIconSVG,
  GridIconSVG,
  ListIconSVG,
  SearchIconSVG,
} from '../components/icons'

export const Route = createFileRoute('/vault/')({
  component: PersonalCollectionExplorePage,
})

type FilterPill =
  'all' | 'singles' | 'albums' | 'mixtapes' | 'eps' | 'lps' | 'artists'

type ViewMode = 'grid' | 'list'

function PersonalCollectionExplorePage() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuthStore()
  const navigate = useNavigate()

  // Data states
  const [personalReleases, setPersonalReleases] = useState<PersonalRelease[]>(
    [],
  )
  const [isLoadingReleases, setIsLoadingReleases] = useState(false)
  const [personalArtists, setPersonalArtists] = useState<PersonalArtist[]>([])
  const [isLoadingArtists, setIsLoadingArtists] = useState(false)

  // Filter & Search states (matched to /library pattern)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [activePill, setActivePill] = useState<FilterPill>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Deletion state & modal
  const [deleteConfirm, setDeleteConfirm] = useState<{
    id: string
    title: string
  } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Toast notice
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Audio Player Store
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const playbackStatus = usePlayerStore((s) => s.playbackStatus)
  const playTrack = usePlayerStore((s) => s.playTrack)
  const togglePlay = usePlayerStore((s) => s.togglePlay)

  // Auth gate
  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      navigate({ to: '/login', search: { redirect: '/vault' } })
    }
  }, [isAuthLoading, isAuthenticated, navigate])

  // Initial load: fetch releases
  useEffect(() => {
    if (isAuthenticated) {
      loadReleases()
    }
  }, [isAuthenticated])

  // Load artists when switching to artists pill
  useEffect(() => {
    if (activePill === 'artists' && personalArtists.length === 0) {
      loadArtists()
    }
  }, [activePill])

  // Focus search input when toggled open
  useEffect(() => {
    if (isSearchOpen && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [isSearchOpen])

  // Auto-dismiss toast
  useEffect(() => {
    if (!toastMessage) return
    const timer = setTimeout(() => setToastMessage(null), 3200)
    return () => clearTimeout(timer)
  }, [toastMessage])

  const loadReleases = async () => {
    try {
      setIsLoadingReleases(true)
      const res = await storageApi.getPersonalReleases()
      setPersonalReleases(res.releases || [])
    } catch (err: any) {
      console.warn('Could not load releases:', err)
    } finally {
      setIsLoadingReleases(false)
    }
  }

  const loadArtists = async () => {
    try {
      setIsLoadingArtists(true)
      const res = await storageApi.getPersonalArtists()
      setPersonalArtists(res.artists || [])
    } catch (err: any) {
      console.warn('Could not load personal artists:', err)
    } finally {
      setIsLoadingArtists(false)
    }
  }

  // Helper to map PersonalTrack to PlayerTrack
  const toPlayerTrack = (
    release: PersonalRelease,
    t: PersonalTrack,
  ): PlayerTrack => {
    const primaryCredit =
      t.credits?.find((c) => c.role === 'PRIMARY') || t.credits?.[0]
    return {
      id: t.id,
      title: t.title,
      artistId: primaryCredit?.artistId || release.artistId || '',
      artistName: t.artistName || release.artistName || 'Personal Artist',
      artistSlug: primaryCredit?.slug || release.artistSlug,
      albumId: release.id,
      albumTitle: release.title,
      albumSlug: release.slug,
      durationSeconds: t.durationSeconds || 0,
      audioUrl: t.audioUrl || '',
      hlsManifestUrl: t.hlsManifestUrl || undefined,
      rawAudioKey: t.rawAudioKey,
      coverImageUrl: release.coverImageUrl || t.coverImageUrl,
      scope: 'PERSONAL',
      isStreamable: true,
      isExplicit: t.isExplicit,
    }
  }

  // Play release
  const handlePlayRelease = (release: PersonalRelease) => {
    if (!release.tracks || release.tracks.length === 0) {
      setToastMessage('No audio tracks in this release.')
      return
    }
    const playerTracks = release.tracks.map((t) => toPlayerTrack(release, t))
    if (currentTrack?.albumId === release.id) {
      togglePlay()
    } else {
      playTrack(playerTracks[0], playerTracks)
      setToastMessage(`Playing ${release.title}`)
    }
  }

  // Shuffle entire vault
  const handleShuffleVault = () => {
    const allTracks: PlayerTrack[] = []
    personalReleases.forEach((r) => {
      ;(r.tracks || []).forEach((t) => {
        allTracks.push(toPlayerTrack(r, t))
      })
    })
    if (allTracks.length === 0) {
      setToastMessage('Your personal vault is empty.')
      return
    }
    // Fisher-Yates shuffle
    const shuffled = [...allTracks]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    playTrack(shuffled[0], shuffled)
    setToastMessage(`Shuffling ${shuffled.length} tracks from your vault`)
  }

  // Confirm delete release
  const handleDeleteRelease = async (releaseId: string) => {
    try {
      setIsDeleting(true)
      await storageApi.deletePersonalRelease(releaseId)
      setPersonalReleases((prev) => prev.filter((r) => r.id !== releaseId))
      setToastMessage('Release moved to 30-day recycle bin.')
      setDeleteConfirm(null)
    } catch (err: any) {
      setToastMessage(err.message || 'Failed to delete release.')
    } finally {
      setIsDeleting(false)
    }
  }

  // Filtered releases based on search & pill
  const filteredReleases = useMemo(() => {
    let list = personalReleases

    if (activePill === 'singles') {
      list = list.filter((r) => r.albumType === 'SINGLE')
    } else if (activePill === 'albums') {
      list = list.filter((r) => r.albumType === 'ALBUM')
    } else if (activePill === 'mixtapes') {
      list = list.filter((r) => r.albumType === 'MIXTAPE')
    } else if (activePill === 'eps') {
      list = list.filter((r) => r.albumType === 'EP')
    } else if (activePill === 'lps') {
      list = list.filter((r) => r.albumType === 'LP')
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.artistName.toLowerCase().includes(q) ||
          (r.genre && r.genre.toLowerCase().includes(q)) ||
          r.tracks?.some((t) => t.title.toLowerCase().includes(q)),
      )
    }

    return list
  }, [personalReleases, activePill, searchQuery])

  // Filtered artists based on search
  const filteredArtists = useMemo(() => {
    let list = personalArtists
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter(
        (a) =>
          a.stageName.toLowerCase().includes(q) ||
          (a.bio && a.bio.toLowerCase().includes(q)),
      )
    }
    return list
  }, [personalArtists, searchQuery])

  const filterPills: Array<{ key: FilterPill; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'singles', label: 'Singles' },
    { key: 'albums', label: 'Albums' },
    { key: 'mixtapes', label: 'Mixtapes' },
    { key: 'eps', label: 'EPs' },
    { key: 'lps', label: 'LPs' },
    { key: 'artists', label: 'Artists' },
  ]

  const isSearchActive = isSearchOpen || searchQuery.trim().length > 0

  return (
    <div className="max-w-5xl mx-auto px-1 sm:px-6 pt-2 pb-24 md:pb-16 select-none">
      {/* ===================== STICKY APP HEADER WITH PILLS (Matched to /library) ===================== */}
      <header className="sticky top-12 z-30 bg-canvas backdrop:backdrop-blur-2xl pt-2.5 pb-2.5 transition-colors">
        {/* Horizontal Scrollable Filter Pills + Search Button */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scrollbar-none py-0.5 select-none -mx-1">
          {/* Quick Search Toggle Button */}
          <button
            type="button"
            onClick={() => {
              setIsSearchOpen((prev) => !prev)
              if (isSearchOpen && searchQuery) {
                setSearchQuery('')
              }
            }}
            aria-label="Search in vault"
            className={`shrink-0 w-8 h-8 rounded-md flex items-center justify-center transition-all duration-150 cursor-pointer ${
              isSearchActive
                ? 'bg-ink text-canvas shadow-xs'
                : 'bg-panel border border-line text-ink-soft hover:text-ink hover:bg-canvas-soft'
            }`}
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>

          {/* Active Filter Clear Chip (✕) */}
          {activePill !== 'all' && (
            <button
              type="button"
              onClick={() => setActivePill('all')}
              aria-label="Clear active filter"
              className="shrink-0 w-7 h-7 rounded-md bg-canvas border border-line flex items-center justify-center text-ink-soft hover:text-ink hover:bg-canvas-soft transition-colors font-mono text-xs font-bold cursor-pointer"
            >
              ✕
            </button>
          )}

          {/* Category Filter Pills */}
          {filterPills.map((pill) => {
            const isSelected = activePill === pill.key
            return (
              <button
                key={pill.key}
                type="button"
                onClick={() => setActivePill(isSelected ? 'all' : pill.key)}
                className={`shrink-0 font-mono text-[11px] rounded-md uppercase tracking-wider px-3.5 py-1.5 transition-all cursor-pointer font-medium ${
                  isSelected
                    ? 'bg-ink text-canvas font-semibold shadow-xs'
                    : 'bg-panel text-ink-soft hover:text-ink border border-line'
                }`}
              >
                {pill.label}
              </button>
            )
          })}
        </div>

        {/* Expandable Search Input */}
        {isSearchOpen && (
          <div className="mt-2.5 flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="relative flex-1">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  activePill === 'artists'
                    ? 'Find in Vault Artists...'
                    : 'Find in Personal Collection...'
                }
                className="w-full font-mono text-xs py-2.5 pl-9 pr-9 border border-line bg-panel rounded-xl text-ink placeholder:text-ink-soft/60 focus:outline-none focus:border-ink/70 transition-all shadow-2xs"
              />
              <SearchIconSVG className="w-4 h-4 text-ink-soft absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />

              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft hover:text-ink transition-colors cursor-pointer text-xs p-1"
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setIsSearchOpen(false)
                setSearchQuery('')
              }}
              className="font-mono text-xs text-ink-soft hover:text-ink px-2 py-1.5 transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        )}
      </header>

      {/* ===================== CONTROLS BAR (Play, Shuffle, Manage & View Mode) ===================== */}
      <div className="flex items-center justify-between py-3 px-1 text-xs select-none">
        {/* Left: Actions (Play, Shuffle, Manage) */}
        <div className="flex items-center gap-2">
          {personalReleases.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => handlePlayRelease(personalReleases[0])}
                className="rounded-full inline-flex items-center justify-center gap-1.5 h-8 px-4 bg-blue text-canvas font-medium text-xs hover:opacity-90 transition-opacity shadow-xs cursor-pointer"
              >
                <PlayIconSVG className="w-3 h-3 text-canvas" />
                <span>Play</span>
              </button>
              <button
                type="button"
                onClick={handleShuffleVault}
                className="rounded-full inline-flex items-center justify-center gap-1.5 h-8 px-3.5 border border-line bg-panel hover:bg-canvas-soft text-ink font-medium text-xs transition-colors cursor-pointer group"
                title="Shuffle all vault releases"
              >
                <ShuffleIconSVG className="w-3.5 h-3.5 text-ink-soft group-hover:text-ink transition-colors" />
                <span>Shuffle</span>
              </button>
            </>
          )}

          <Link
            to="/vault/manage"
            className="rounded-full inline-flex items-center justify-center gap-1.5 h-8 px-3.5 border border-line bg-panel hover:bg-canvas-soft text-ink-soft hover:text-ink text-xs transition-colors cursor-pointer"
            title="Manage storage and upload files"
          >
            <svg
              className="w-3.5 h-3.5 text-ink-soft"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span className="hidden sm:inline">Manage Locker</span>
            <span className="sm:hidden">Manage</span>
          </Link>
        </div>

        {/* Right: Count and View Switcher */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] uppercase tracking-wider text-ink-soft hidden sm:inline">
            {activePill === 'artists'
              ? `${filteredArtists.length} ${filteredArtists.length === 1 ? 'Artist' : 'Artists'}`
              : `${filteredReleases.length} ${filteredReleases.length === 1 ? 'Release' : 'Releases'}`}
          </span>

          {activePill !== 'artists' && (
            <button
              type="button"
              onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
              aria-label={`Switch to ${viewMode === 'list' ? 'Grid' : 'List'} view`}
              className="w-8 h-8 rounded-full flex items-center justify-center text-ink-soft hover:text-ink hover:bg-canvas-soft transition-colors cursor-pointer"
            >
              {viewMode === 'list' ? (
                <GridIconSVG className="w-5 h-5" />
              ) : (
                <ListIconSVG className="w-5 h-5" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* ===================== TAB CONTENT ===================== */}
      {activePill === 'artists' ? (
        /* ===================== ARTISTS VIEW (Clean & Minimal) ===================== */
        <div>
          {isLoadingArtists ? (
            <div className="py-24 text-center font-mono text-xs uppercase tracking-widest text-ink-soft animate-pulse">
              Loading vault artists...
            </div>
          ) : filteredArtists.length === 0 ? (
            <div className="p-12 text-center text-ink-soft text-xs font-mono border border-line bg-panel rounded-xl">
              {searchQuery
                ? `No artists match "${searchQuery}".`
                : 'No personal artists found in your vault.'}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">
              {filteredArtists.map((artist) => (
                <Link
                  key={artist.id}
                  to="/artists/$idOrSlug"
                  params={{ idOrSlug: artist.slug || artist.id }}
                  className="group relative flex flex-col items-center p-2.5 rounded-xl hover:bg-canvas-soft/70 active:scale-[0.98] transition-all duration-150 select-none text-center"
                >
                  <div className="relative aspect-square w-full mb-2.5 flex items-center justify-center overflow-hidden rounded-full border border-line bg-canvas shrink-0 shadow-sm group-hover:scale-105 transition-transform duration-300">
                    {artist.bannerUrl ? (
                      <img
                        src={artist.bannerUrl}
                        alt={artist.stageName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-serif italic text-2xl text-blue bg-blue/10">
                        {artist.stageName.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="w-full">
                    <div className="font-semibold text-sm text-ink group-hover:text-blue transition-colors truncate">
                      {artist.stageName}
                    </div>
                    <div className="text-xs text-ink-soft truncate mt-0.5">
                      {artist.releaseCount}{' '}
                      {artist.releaseCount === 1 ? 'release' : 'releases'}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ===================== RELEASES VIEW ===================== */
        <div>
          {isLoadingReleases ? (
            <div className="py-24 text-center font-mono text-xs uppercase tracking-widest text-ink-soft animate-pulse">
              Loading personal vault...
            </div>
          ) : personalReleases.length === 0 ? (
            /* Empty Collection State */
            <div className="p-12 border border-dashed border-line bg-panel/40 text-center space-y-4 my-6 rounded-2xl select-none">
              <div className="w-14 h-14 bg-panel border border-line text-blue flex items-center justify-center mx-auto rounded-full shadow-md">
                <UploadCloudSVG className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h3 className="font-serif italic text-2xl text-ink font-normal">
                  Your Personal Vault is Empty
                </h3>
                <p className="font-sans text-xs text-ink-soft max-w-md mx-auto leading-relaxed">
                  Upload your offline audio files in the Locker Manager to start
                  building your private listening library.
                </p>
              </div>
              <Link
                to="/vault/manage"
                className="mt-2 font-mono text-[11px] uppercase tracking-wider py-2.5 px-5 bg-ink text-canvas hover:opacity-90 transition-opacity font-semibold cursor-pointer inline-flex items-center gap-2 shadow-xs rounded-full"
              >
                <UploadCloudSVG className="w-4 h-4" />
                <span>Go to Locker Manager</span>
              </Link>
            </div>
          ) : filteredReleases.length === 0 ? (
            <div className="p-12 text-center text-ink-soft text-xs font-mono border border-line bg-panel rounded-xl">
              No releases match "{searchQuery}" under {activePill.toUpperCase()}
              .
            </div>
          ) : viewMode === 'grid' ? (
            /* ===================== RELEASES GRID VIEW (Clean & Minimal, Artist Page Styling) ===================== */
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">
              {filteredReleases.map((release) => {
                const isPlayingThisRelease =
                  currentTrack?.albumId === release.id &&
                  playbackStatus === 'playing'

                return (
                  <div
                    key={release.id}
                    className="group relative flex flex-col p-2.5 rounded-xl hover:bg-canvas-soft/70 active:scale-[0.98] transition-all duration-150 select-none"
                  >
                    {/* Artwork Container */}
                    <div className="relative aspect-square w-full mb-2.5 flex items-center justify-center overflow-hidden rounded-md bg-panel shadow-sm">
                      <Link
                        to="/albums/$idOrSlug"
                        params={{ idOrSlug: release.slug || release.id }}
                        className="w-full h-full block text-inherit no-underline"
                      >
                        {release.coverImageUrl ? (
                          <img
                            src={release.coverImageUrl}
                            alt={release.title}
                            loading="lazy"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <ProceduralCover
                            size="lg"
                            title={release.title}
                            artistName={release.artistName}
                            className="w-full h-full rounded-none"
                          />
                        )}
                      </Link>

                      {/* Play Button Overlay */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          handlePlayRelease(release)
                        }}
                        className={`absolute bottom-2 right-2 w-9 h-9 bg-blue text-canvas rounded-full shadow-lg flex items-center justify-center transition-all cursor-pointer ${
                          isPlayingThisRelease
                            ? 'opacity-100 scale-100 ring-2 ring-white/50'
                            : 'opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100 hover:scale-105'
                        }`}
                        title="Play release"
                      >
                        {isPlayingThisRelease ? (
                          <PauseIconSVG className="w-3.5 h-3.5 text-white" />
                        ) : (
                          <PlayIconSVG className="w-3.5 h-3.5 text-white ml-0.5" />
                        )}
                      </button>

                      {/* Global Action Menu 3-Dot Button */}
                      <div className="absolute top-1.5 right-1.5 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                        <ReleaseActionMenu
                          release={release}
                          onDeleteRequest={setDeleteConfirm}
                          buttonClassName="w-7 h-7 rounded-full bg-canvas/80 backdrop-blur-xs border border-line/60 text-ink shadow-sm flex items-center justify-center hover:bg-canvas transition-colors cursor-pointer"
                        />
                      </div>
                    </div>

                    {/* Clean Text Information (NO release type bubble, NO 'cuts' text!) */}
                    <div className="w-full">
                      <Link
                        to="/albums/$idOrSlug"
                        params={{ idOrSlug: release.slug || release.id }}
                        className="font-semibold text-sm truncate group-hover:text-blue transition-colors block text-inherit no-underline"
                        title={release.title}
                      >
                        {release.title}
                      </Link>
                      <div className="text-xs text-ink-soft truncate mt-0.5 flex items-center gap-1.5">
                        <Link
                          to="/artists/$idOrSlug"
                          params={{
                            idOrSlug: release.artistSlug || release.artistId,
                          }}
                          className="hover:underline hover:text-ink truncate text-inherit no-underline"
                          title={release.artistName}
                        >
                          {release.artistName}
                        </Link>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            /* ===================== RELEASES LIST VIEW (Clean & Minimal, Artist Page Styling) ===================== */
            <div className="flex flex-col gap-1.5">
              {filteredReleases.map((release) => {
                const releaseYear = release.releaseDate
                  ? new Date(release.releaseDate).getFullYear()
                  : release.createdAt
                    ? new Date(release.createdAt).getFullYear()
                    : null

                return (
                  <div
                    key={release.id}
                    className="group flex items-center justify-between p-2 rounded-xl hover:bg-canvas-soft/80 active:scale-[0.99] transition-all select-none"
                  >
                    <Link
                      to="/albums/$idOrSlug"
                      params={{ idOrSlug: release.slug || release.id }}
                      className="flex items-center gap-3.5 flex-1 min-w-0 text-inherit no-underline"
                    >
                      {/* Thumbnail Artwork */}
                      <div className="w-12 h-12 rounded-md bg-canvas-deep border border-line shrink-0 overflow-hidden relative shadow-xs">
                        {release.coverImageUrl ? (
                          <img
                            src={release.coverImageUrl}
                            alt={release.title}
                            loading="lazy"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <ProceduralCover
                            size="sm"
                            title={release.title}
                            artistName={release.artistName}
                            className="w-full h-full rounded-none"
                          />
                        )}
                      </div>

                      {/* Text Information (NO release type bubble, NO cuts!) */}
                      <div className="min-w-0 flex-1 pr-2">
                        <h3 className="font-semibold text-sm text-ink group-hover:text-blue transition-colors truncate">
                          {release.title}
                        </h3>
                        <div className="flex items-center gap-1.5 text-xs text-ink-soft mt-0.5 truncate">
                          <span className="truncate">{release.artistName}</span>
                          {releaseYear && (
                            <>
                              <span className="opacity-40">·</span>
                              <span>{releaseYear}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </Link>

                    {/* Right Side: Duration & Global Action Menu */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-xs text-ink-soft hidden sm:inline">
                        {formatDuration(release.totalDurationSeconds)}
                      </span>
                      <ReleaseActionMenu
                        release={release}
                        onDeleteRequest={setDeleteConfirm}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================== DELETE CONFIRMATION MODAL ===================== */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 bg-ink/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150"
          onClick={() => !isDeleting && setDeleteConfirm(null)}
        >
          <div
            className="border border-line bg-panel p-6 max-w-md w-full shadow-2xl space-y-4 rounded-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-red-500">
              <TrashIconSVG className="w-5 h-5 shrink-0" />
              <h3 className="font-serif italic font-bold text-lg text-ink">
                Move Release to Recycle Bin?
              </h3>
            </div>
            <p className="font-sans text-xs text-ink-soft leading-relaxed">
              Are you sure you want to move{' '}
              <strong className="text-ink font-semibold">
                "{deleteConfirm.title}"
              </strong>{' '}
              to the 30-day recycle bin? You can restore it anytime within 30
              days from Locker Manager.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 border border-line bg-panel hover:bg-canvas text-ink text-xs font-medium rounded-full cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => handleDeleteRelease(deleteConfirm.id)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-full cursor-pointer transition-colors shadow-xs"
              >
                {isDeleting ? 'Moving to Trash...' : 'Move to Trash'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== TOAST NOTIFICATION ===================== */}
      {toastMessage && (
        <div className="fixed bottom-24 sm:bottom-12 left-1/2 -translate-x-1/2 z-50 bg-ink text-canvas font-mono text-[11px] uppercase tracking-wider py-2 px-4 rounded-full shadow-2xl animate-in fade-in duration-150 pointer-events-none">
          {toastMessage}
        </div>
      )}
    </div>
  )
}

function formatDuration(totalSeconds: number): string {
  if (!totalSeconds || isNaN(totalSeconds)) return '0:00'
  const mins = Math.floor(totalSeconds / 60)
  const secs = Math.floor(totalSeconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
