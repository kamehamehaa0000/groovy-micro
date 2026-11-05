import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useState, useEffect, useMemo, useRef } from 'react'
import { useAuthStore } from '../stores/auth.store'
import {
  storageApi,
  type PersonalRelease,
  type PersonalArtist,
  type PersonalTrack,
} from '../lib/storage.api'
import { usePlayerStore } from '../stores/player.store'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'
import type { PlayerTrack } from '../types/player'
import { ProceduralCover } from '../components/common/ProceduralCover'
import { ArtistCard } from '../components/artists/ArtistCard'
import { ReleaseActionMenu } from '../components/common/ReleaseActionMenu'
import { SortMenu, type SortOption } from '../Components/ui'
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

type VaultReleaseSort = 'recent' | 'title' | 'artist' | 'releaseDate'
type VaultArtistSort = 'name' | 'releases' | 'tracks' | 'recent'

const RELEASE_SORT_OPTIONS: SortOption<VaultReleaseSort>[] = [
  { value: 'recent', label: 'Recently added', defaultDirection: 'desc' },
  { value: 'title', label: 'Title', defaultDirection: 'asc' },
  { value: 'artist', label: 'Artist', defaultDirection: 'asc' },
  { value: 'releaseDate', label: 'Release date', defaultDirection: 'desc' },
]

const ARTIST_SORT_OPTIONS: SortOption<VaultArtistSort>[] = [
  { value: 'name', label: 'Name (A–Z)', defaultDirection: 'asc' },
  { value: 'releases', label: 'Most releases', defaultDirection: 'desc' },
  { value: 'tracks', label: 'Most tracks', defaultDirection: 'desc' },
  { value: 'recent', label: 'Recently added', defaultDirection: 'desc' },
]

function PersonalCollectionExplorePage() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuthStore()
  const navigate = useNavigate()

  // Filter, Sort & Search states
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [activePill, setActivePill] = useState<FilterPill>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [releaseSort, setReleaseSort] = useState<VaultReleaseSort>('recent')
  const [releaseDir, setReleaseDir] = useState<'asc' | 'desc'>('desc')
  const [artistSort, setArtistSort] = useState<VaultArtistSort>('name')
  const [artistDir, setArtistDir] = useState<'asc' | 'desc'>('asc')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const debouncedSearch = useDebouncedValue(searchQuery, 300).trim()

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

  // ===================== RELEASES QUERY (Paginated + Infinite Scroll) =====================
  const releaseTypeParam =
    activePill === 'artists' || activePill === 'all'
      ? 'ALL'
      : activePill.toUpperCase()

  const releasesQuery = useInfiniteQuery({
    queryKey: [
      'vault',
      'releases',
      releaseTypeParam,
      releaseSort,
      releaseDir,
      debouncedSearch,
    ],
    queryFn: ({ pageParam = 1 }) =>
      storageApi.getPersonalReleases({
        page: pageParam,
        limit: 24,
        type: releaseTypeParam,
        sort: releaseSort,
        order: releaseDir,
        search: debouncedSearch || undefined,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.pagination &&
      lastPage.pagination.page < lastPage.pagination.totalPages
        ? lastPage.pagination.page + 1
        : undefined,
    enabled: isAuthenticated && activePill !== 'artists',
    staleTime: 60_000,
  })

  const personalReleases = useMemo(() => {
    const list: PersonalRelease[] = []
    for (const page of releasesQuery.data?.pages ?? []) {
      list.push(...page.releases)
    }
    return list
  }, [releasesQuery.data])

  const totalReleases =
    releasesQuery.data?.pages[0]?.pagination?.total ?? personalReleases.length
  const isLoadingReleases = releasesQuery.isLoading

  const loadMoreReleasesRef = useInfiniteScroll({
    enabled:
      releasesQuery.hasNextPage &&
      !releasesQuery.isFetching &&
      !releasesQuery.isError,
    onLoadMore: () => void releasesQuery.fetchNextPage(),
  })

  // ===================== ARTISTS QUERY (Paginated + Infinite Scroll) =====================
  const artistsQuery = useInfiniteQuery({
    queryKey: [
      'vault',
      'artists',
      artistSort,
      artistDir,
      debouncedSearch,
    ],
    queryFn: ({ pageParam = 1 }) =>
      storageApi.getPersonalArtists({
        page: pageParam,
        limit: 24,
        sort: artistSort,
        order: artistDir,
        search: debouncedSearch || undefined,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.pagination &&
      lastPage.pagination.page < lastPage.pagination.totalPages
        ? lastPage.pagination.page + 1
        : undefined,
    enabled: isAuthenticated && activePill === 'artists',
    staleTime: 60_000,
  })

  const personalArtists = useMemo(() => {
    const list: PersonalArtist[] = []
    for (const page of artistsQuery.data?.pages ?? []) {
      list.push(...page.artists)
    }
    return list
  }, [artistsQuery.data])

  const totalArtists =
    artistsQuery.data?.pages[0]?.pagination?.total ?? personalArtists.length
  const isLoadingArtists = artistsQuery.isLoading

  const loadMoreArtistsRef = useInfiniteScroll({
    enabled:
      artistsQuery.hasNextPage &&
      !artistsQuery.isFetching &&
      !artistsQuery.isError,
    onLoadMore: () => void artistsQuery.fetchNextPage(),
  })

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

  // Play a specific release
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

  // Play first release from the vault
  const handlePlayFirstRelease = () => {
    const first = personalReleases[0]
    if (!first) {
      setToastMessage('Your personal vault is empty.')
      return
    }
    handlePlayRelease(first)
  }

  // Shuffle vault tracks via dedicated endpoint
  const handleShuffleVault = async () => {
    try {
      setToastMessage('Shuffling vault...')
      const res = await storageApi.getPersonalTracks({
        shuffle: true,
        limit: 250,
        albumType:
          activePill !== 'all' && activePill !== 'artists'
            ? activePill.toUpperCase()
            : undefined,
        search: debouncedSearch || undefined,
      })
      if (!res.tracks || res.tracks.length === 0) {
        setToastMessage('Your personal vault is empty.')
        return
      }
      playTrack(res.tracks[0], res.tracks)
      setToastMessage(`Shuffling ${res.tracks.length} tracks from your vault`)
    } catch {
      setToastMessage('Failed to shuffle vault tracks.')
    }
  }

  // Confirm delete release
  const handleDeleteRelease = async (releaseId: string) => {
    try {
      setIsDeleting(true)
      await storageApi.deletePersonalRelease(releaseId)
      await Promise.all([releasesQuery.refetch(), artistsQuery.refetch()])
      setToastMessage('Release moved to 30-day recycle bin.')
      setDeleteConfirm(null)
    } catch (err: any) {
      setToastMessage(err.message || 'Failed to delete release.')
    } finally {
      setIsDeleting(false)
    }
  }

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
    <div className="select-none">
      {/* ===================== STICKY APP HEADER WITH PILLS (Matched to /library) ===================== */}
      <header className="sticky top-14 z-30 bg-background backdrop:backdrop-blur-2xl pt-2.5 pb-2.5 transition-colors">
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
                ? 'bg-foreground text-background shadow-xs'
                : 'bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-muted'
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
              className="shrink-0 w-9 h-9 rounded-md bg-background border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors font-mono text-caption font-bold cursor-pointer"
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
                className={`shrink-0 font-eyebrow text-eyebrow rounded-md uppercase tracking-wider px-3.5 py-1.5 transition-all cursor-pointer font-medium ${
                  isSelected
                    ? 'bg-foreground text-background font-semibold shadow-xs'
                    : 'bg-card text-muted-foreground hover:text-foreground border border-border'
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
                className="w-full font-mono text-caption py-2.5 pl-9 pr-9 border border-border bg-card rounded-xl text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-foreground/70 transition-all shadow-raised"
              />
              <SearchIconSVG className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />

              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer text-caption p-1"
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
              className="font-mono text-caption text-muted-foreground hover:text-foreground px-2 py-1.5 transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        )}
      </header>

      {/* ===================== CONTROLS BAR (Play, Shuffle, Manage, Sort & View Mode) ===================== */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 py-3 px-1 text-caption select-none">
        {/* Left: Actions (Play, Shuffle, Manage) */}
        <div className="flex items-center gap-2">
          {totalReleases > 0 && activePill !== 'artists' && (
            <>
              <button
                type="button"
                onClick={handlePlayFirstRelease}
                className="rounded-full inline-flex items-center justify-center gap-1.5 h-8 px-4 bg-primary text-background font-medium text-caption hover:opacity-90 transition-opacity shadow-xs cursor-pointer"
              >
                <PlayIconSVG className="w-3 h-3 text-background" />
                <span>Play</span>
              </button>
              <button
                type="button"
                onClick={handleShuffleVault}
                className="rounded-full inline-flex items-center justify-center gap-1.5 h-8 px-3.5 border border-border bg-card hover:bg-muted text-foreground font-medium text-caption transition-colors cursor-pointer group"
                title="Shuffle vault releases"
              >
                <ShuffleIconSVG className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                <span>Shuffle</span>
              </button>
            </>
          )}

          <Link
            to="/vault/manage"
            className="rounded-full inline-flex items-center justify-center gap-1.5 h-8 px-3.5 border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground text-caption transition-colors cursor-pointer"
            title="Manage storage and upload files"
          >
            <svg
              className="w-3.5 h-3.5 text-muted-foreground"
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

        {/* Right: Sort, Count and View Switcher */}
        <div className="flex items-center gap-3 ml-auto">
          {activePill === 'artists' ? (
            <SortMenu
              options={ARTIST_SORT_OPTIONS}
              value={artistSort}
              onChange={setArtistSort}
              direction={artistDir}
              onDirectionChange={setArtistDir}
            />
          ) : (
            <SortMenu
              options={RELEASE_SORT_OPTIONS}
              value={releaseSort}
              onChange={setReleaseSort}
              direction={releaseDir}
              onDirectionChange={setReleaseDir}
            />
          )}

          <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground hidden sm:inline">
            {activePill === 'artists'
              ? `${totalArtists} ${totalArtists === 1 ? 'Artist' : 'Artists'}`
              : `${totalReleases} ${totalReleases === 1 ? 'Release' : 'Releases'}`}
          </span>

          {activePill !== 'artists' && (
            <button
              type="button"
              onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
              aria-label={`Switch to ${viewMode === 'list' ? 'Grid' : 'List'} view`}
              className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
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
          {isLoadingArtists && personalArtists.length === 0 ? (
            <div className="py-24 text-center font-eyebrow text-caption uppercase tracking-widest text-muted-foreground animate-pulse">
              Loading vault artists...
            </div>
          ) : personalArtists.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground text-caption font-mono border border-border bg-card rounded-xl">
              {searchQuery
                ? `No artists match "${searchQuery}".`
                : 'No personal artists found in your vault.'}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">
                {personalArtists.map((artist) => (
                  <ArtistCard
                    key={artist.id}
                    name={artist.stageName}
                    slug={artist.slug || artist.id}
                    imageUrl={artist.bannerUrl}
                    subtitle={`${artist.releaseCount} ${
                      artist.releaseCount === 1 ? 'release' : 'releases'
                    }`}
                  />
                ))}
              </div>
              <div ref={loadMoreArtistsRef} className="h-6" />
            </>
          )}
        </div>
      ) : (
        /* ===================== RELEASES VIEW ===================== */
        <div>
          {isLoadingReleases && personalReleases.length === 0 ? (
            <div className="py-24 text-center font-eyebrow text-caption uppercase tracking-widest text-muted-foreground animate-pulse">
              Loading personal vault...
            </div>
          ) : personalReleases.length === 0 ? (
            debouncedSearch ? (
              <div className="p-12 text-center text-muted-foreground text-caption font-mono border border-border bg-card rounded-xl">
                No releases match "{searchQuery}" under {activePill.toUpperCase()}.
              </div>
            ) : (
              /* Empty Collection State */
              <div className="p-12 border border-dashed border-border bg-card/40 text-center space-y-4 my-6 rounded-2xl select-none">
                <div className="w-14 h-14 bg-card border border-border text-primary flex items-center justify-center mx-auto rounded-full shadow-md">
                  <UploadCloudSVG className="w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-serif italic text-2xl text-foreground font-normal">
                    Your Personal Vault is Empty
                  </h3>
                  <p className="font-sans text-caption text-muted-foreground max-w-md mx-auto leading-relaxed">
                    Upload your offline audio files in the Locker Manager to start
                    building your private listening library.
                  </p>
                </div>
                <Link
                  to="/vault/manage"
                  className="mt-2 font-eyebrow text-eyebrow uppercase tracking-wider py-2.5 px-5 bg-foreground text-background hover:opacity-90 transition-opacity font-semibold cursor-pointer inline-flex items-center gap-2 shadow-xs rounded-full"
                >
                  <UploadCloudSVG className="w-4 h-4" />
                  <span>Go to Locker Manager</span>
                </Link>
              </div>
            )
          ) : viewMode === 'grid' ? (
            /* ===================== RELEASES GRID VIEW (Clean & Minimal, Artist Page Styling) ===================== */
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">
              {personalReleases.map((release) => {
                const isPlayingThisRelease =
                  currentTrack?.albumId === release.id &&
                  playbackStatus === 'playing'

                return (
                  <div
                    key={release.id}
                    className="group relative flex flex-col p-2.5 rounded-xl hover:bg-muted/70 active:scale-[0.98] transition-all duration-150 select-none"
                  >
                    {/* Artwork Container */}
                    <div className="relative aspect-square w-full mb-2.5 flex items-center justify-center overflow-hidden rounded-md bg-card shadow-sm">
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
                        className={`absolute bottom-2 right-2 w-9 h-9 bg-primary text-background rounded-full shadow-lg flex items-center justify-center transition-all cursor-pointer ${
                          isPlayingThisRelease
                            ? 'opacity-100 scale-100 ring-2 ring-white/50'
                            : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 scale-100 sm:scale-90 sm:group-hover:scale-100 hover:scale-105'
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
                      <div className="absolute top-1.5 right-1.5 z-10 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <ReleaseActionMenu
                          release={release}
                          onDeleteRequest={setDeleteConfirm}
                          buttonClassName="w-9 h-9 rounded-full bg-background/80 backdrop-blur-xs border border-border/60 text-foreground shadow-sm flex items-center justify-center hover:bg-background transition-colors cursor-pointer"
                        />
                      </div>
                    </div>

                    {/* Clean Text Information (NO release type bubble, NO 'cuts' text!) */}
                    <div className="w-full">
                      <Link
                        to="/albums/$idOrSlug"
                        params={{ idOrSlug: release.slug || release.id }}
                        className="font-semibold text-body truncate group-hover:text-primary transition-colors block text-inherit no-underline"
                        title={release.title}
                      >
                        {release.title}
                      </Link>
                      <div className="text-caption text-muted-foreground truncate mt-0.5 flex items-center gap-1.5">
                        <Link
                          to="/artists/$idOrSlug"
                          params={{
                            idOrSlug: release.artistSlug || release.artistId,
                          }}
                          className="hover:underline hover:text-foreground truncate text-inherit no-underline"
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
              {personalReleases.map((release) => {
                const releaseYear = release.releaseDate
                  ? new Date(release.releaseDate).getFullYear()
                  : release.createdAt
                    ? new Date(release.createdAt).getFullYear()
                    : null

                return (
                  <div
                    key={release.id}
                    className="group flex items-center justify-between p-2 rounded-xl hover:bg-muted/80 active:scale-[0.99] transition-all select-none"
                  >
                    <Link
                      to="/albums/$idOrSlug"
                      params={{ idOrSlug: release.slug || release.id }}
                      className="flex items-center gap-3.5 flex-1 min-w-0 text-inherit no-underline"
                    >
                      {/* Thumbnail Artwork */}
                      <div className="w-12 h-12 rounded-md bg-muted border border-border shrink-0 overflow-hidden relative shadow-xs">
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
                        <h3 className="font-semibold text-body text-foreground group-hover:text-primary transition-colors truncate">
                          {release.title}
                        </h3>
                        <div className="flex items-center gap-1.5 text-caption text-muted-foreground mt-0.5 truncate">
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
                      <span className="font-mono text-caption text-muted-foreground hidden sm:inline">
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
          <div ref={loadMoreReleasesRef} className="h-6" />
        </div>
      )}

      {/* ===================== DELETE CONFIRMATION MODAL ===================== */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 bg-foreground/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150"
          onClick={() => !isDeleting && setDeleteConfirm(null)}
        >
          <div
            className="border border-border bg-card p-6 max-w-md w-full shadow-2xl space-y-4 rounded-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-destructive">
              <TrashIconSVG className="w-5 h-5 shrink-0" />
              <h3 className="font-serif italic font-bold text-lg text-foreground">
                Move Release to Recycle Bin?
              </h3>
            </div>
            <p className="font-sans text-caption text-muted-foreground leading-relaxed">
              Are you sure you want to move{' '}
              <strong className="text-foreground font-semibold">
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
                className="px-4 py-2 border border-border bg-card hover:bg-background text-foreground text-caption font-medium rounded-full cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => handleDeleteRelease(deleteConfirm.id)}
                className="px-4 py-2 bg-destructive hover:bg-destructive/90 text-destructive-foreground text-caption font-semibold rounded-full cursor-pointer transition-colors shadow-xs"
              >
                {isDeleting ? 'Moving to Trash...' : 'Move to Trash'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== TOAST NOTIFICATION ===================== */}
      {toastMessage && (
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+8rem)] sm:bottom-12 left-1/2 -translate-x-1/2 z-50 bg-foreground text-background font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-4 rounded-full shadow-2xl animate-in fade-in duration-150 pointer-events-none">
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
