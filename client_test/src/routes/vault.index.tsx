import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useState, useEffect, useMemo } from 'react'
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
import { ProceduralCover } from '../Components/common/ProceduralCover'
import { ReleaseActionMenu } from '../Components/common/ReleaseActionMenu'
import { SortMenu, type SortOption } from '../Components/ui'
import { FilterBar } from '../Components/ui/FilterBar'
import { Button } from '../Components/ui/Button'
import { ConfirmDialog } from '../Components/ui/Modal'
import { notify } from '../lib/toast'
import { SORT_TERMS } from '../lib/sort'
import { MediaGrid } from '../Components/media/MediaGrid'
import { VaultReleaseItem } from '../Components/vault/VaultReleaseItem'
import { toPlayerTrack as mapToPlayerTrack } from '../lib/player-track'
import {
  PlayIconSVG,
  PauseIconSVG,
  UploadCloudSVG,
  ShuffleIconSVG,
  GridIconSVG,
  ListIconSVG,
} from '../Components/Icons'
import { H2 } from '../Components/ui/typography'
import { Settings2Icon } from 'lucide-react'

export const Route = createFileRoute('/vault/')({
  staticData: { layout: 'wide' },
  component: PersonalCollectionExplorePage,
})

type FilterPill =
  'all' | 'singles' | 'albums' | 'mixtapes' | 'eps' | 'lps' | 'artists'

const PILL_TO_RELEASE_TYPE: Record<
  FilterPill,
  'ALL' | 'SINGLE' | 'ALBUM' | 'EP' | 'LP' | 'MIXTAPE'
> = {
  all: 'ALL',
  artists: 'ALL',
  singles: 'SINGLE',
  albums: 'ALBUM',
  eps: 'EP',
  lps: 'LP',
  mixtapes: 'MIXTAPE',
}

type ViewMode = 'grid' | 'list'

type VaultReleaseSort = 'recent' | 'title' | 'artist' | 'releaseDate'
type VaultArtistSort = 'name' | 'releases' | 'tracks' | 'recent'

const RELEASE_SORT_OPTIONS: SortOption<VaultReleaseSort>[] = [
  { value: 'recent', label: SORT_TERMS.added, defaultDirection: 'desc' },
  { value: 'title', label: SORT_TERMS.title, defaultDirection: 'asc' },
  { value: 'artist', label: SORT_TERMS.artist, defaultDirection: 'asc' },
  {
    value: 'releaseDate',
    label: SORT_TERMS.releaseDate,
    defaultDirection: 'desc',
  },
]

const ARTIST_SORT_OPTIONS: SortOption<VaultArtistSort>[] = [
  { value: 'name', label: SORT_TERMS.name, defaultDirection: 'asc' },
  { value: 'releases', label: SORT_TERMS.releases, defaultDirection: 'desc' },
  { value: 'tracks', label: SORT_TERMS.tracks, defaultDirection: 'desc' },
  { value: 'recent', label: SORT_TERMS.added, defaultDirection: 'desc' },
]

function PersonalCollectionExplorePage() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuthStore()
  const navigate = useNavigate()

  // Filter, Sort & Search states
  const [searchQuery, setSearchQuery] = useState('')
  const [activePill, setActivePill] = useState<FilterPill>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [releaseSort, setReleaseSort] = useState<VaultReleaseSort>('recent')
  const [releaseDir, setReleaseDir] = useState<'asc' | 'desc'>('desc')
  const [artistSort, setArtistSort] = useState<VaultArtistSort>('name')
  const [artistDir, setArtistDir] = useState<'asc' | 'desc'>('asc')
  const debouncedSearch = useDebouncedValue(searchQuery, 300).trim()

  // Deletion state & modal
  const [deleteConfirm, setDeleteConfirm] = useState<{
    id: string
    title: string
  } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Toast notice

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

  // ===================== RELEASES QUERY (Paginated + Infinite Scroll) =====================
  const releaseTypeParam = PILL_TO_RELEASE_TYPE[activePill]

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
    queryKey: ['vault', 'artists', artistSort, artistDir, debouncedSearch],
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

  const isLoadingArtists = artistsQuery.isLoading

  const loadMoreArtistsRef = useInfiniteScroll({
    enabled:
      artistsQuery.hasNextPage &&
      !artistsQuery.isFetching &&
      !artistsQuery.isError,
    onLoadMore: () => void artistsQuery.fetchNextPage(),
  })

  // Helper to map a personal track to a player track.
  const toPlayerTrack = (
    release: PersonalRelease,
    t: PersonalTrack,
  ): PlayerTrack => {
    const primaryCredit =
      t.credits?.find((c) => c.role === 'PRIMARY') || t.credits?.[0]
    return mapToPlayerTrack({
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
    })
  }

  // Play a specific release
  const handlePlayRelease = (release: PersonalRelease) => {
    if (!release.tracks || release.tracks.length === 0) {
      notify.info('No audio tracks in this release.')
      return
    }
    const playerTracks = release.tracks.map((t) => toPlayerTrack(release, t))
    if (currentTrack?.albumId === release.id) {
      togglePlay()
    } else {
      // No toast: the player bar already says what is playing.
      playTrack(playerTracks[0], playerTracks)
    }
  }

  // Play first release from the vault
  const handlePlayFirstRelease = () => {
    const first = personalReleases[0]
    if (!first) {
      notify.info('Your personal vault is empty.')
      return
    }
    handlePlayRelease(first)
  }

  // Shuffle vault tracks via dedicated endpoint
  const handleShuffleVault = async () => {
    try {
      notify.info('Shuffling vault...')
      const res = await storageApi.getPersonalTracks({
        shuffle: true,
        limit: 250,
        albumType:
          activePill !== 'all' && activePill !== 'artists'
            ? PILL_TO_RELEASE_TYPE[activePill]
            : undefined,
        search: debouncedSearch || undefined,
      })
      if (!res.tracks || res.tracks.length === 0) {
        notify.info('Your personal vault is empty.')
        return
      }
      playTrack(res.tracks[0], res.tracks)
      notify.info(`Shuffling ${res.tracks.length} tracks from your vault`)
    } catch {
      notify.error('Failed to shuffle vault tracks.')
    }
  }

  // Confirm delete release
  const handleDeleteRelease = async (releaseId: string) => {
    try {
      setIsDeleting(true)
      await storageApi.deletePersonalRelease(releaseId)
      await Promise.all([releasesQuery.refetch(), artistsQuery.refetch()])
      notify.success('Release moved to 30-day recycle bin.')
      setDeleteConfirm(null)
    } catch (err: any) {
      notify.error(err.message || 'Failed to delete release.')
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

  return (
    <div className="select-none">
      {/* ===================== STICKY TOOLBAR (the same bar as /library) ===================== */}
      <header className="sticky top-[var(--header-height)] z-30 bg-background/95 pt-2.5 pb-2.5 backdrop-blur-xl transition-colors">
        <FilterBar
          search={{
            value: searchQuery,
            onChange: setSearchQuery,
            onClear: () => setSearchQuery(''),
            placeholder:
              activePill === 'artists'
                ? 'Find in Vault Artists...'
                : 'Find in Personal Collection...',
            ariaLabel: 'Search in vault',
          }}
          options={filterPills.map((pill) => ({
            value: pill.key,
            label: pill.label,
          }))}
          value={activePill}
          onOptionChange={(next) =>
            setActivePill(next === activePill ? 'all' : next)
          }
          sort={
            <div className="flex items-center gap-1.5">
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

              {activePill !== 'artists' && (
                <button
                  type="button"
                  onClick={() =>
                    setViewMode(viewMode === 'list' ? 'grid' : 'list')
                  }
                  title={`Switch to ${viewMode === 'list' ? 'Grid' : 'List'} view`}
                  aria-label={`Switch to ${viewMode === 'list' ? 'Grid' : 'List'} view`}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors cursor-pointer hover:bg-muted hover:text-foreground sm:h-8 sm:w-8"
                >
                  {viewMode === 'list' ? (
                    <GridIconSVG className="h-5 w-5 shrink-0" />
                  ) : (
                    <ListIconSVG className="h-5 w-5 shrink-0" />
                  )}
                </button>
              )}
            </div>
          }
        />
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
              {/* Shuffle is an icon-only ghost button — the label was noise. */}
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                onClick={handleShuffleVault}
                aria-label="Shuffle vault releases"
                title="Shuffle vault releases"
                className="rounded-full"
              >
                <ShuffleIconSVG className="w-4 h-4" />
              </Button>
            </>
          )}

          <Link
            to="/vault/manage"
            className="rounded-full inline-flex items-center justify-center gap-1.5 h-8 px-3.5  bg-card hover:bg-muted text-muted-foreground hover:text-foreground text-caption transition-colors cursor-pointer"
            title="Manage storage and upload files"
          >
            <Settings2Icon className="w-4 h-4" />
            <span className="hidden sm:inline">Manage Locker</span>
            <span className="sm:hidden">Manage</span>
          </Link>
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
              <MediaGrid maxColumns={6}>
                {personalReleases.map((release) => (
                  <VaultReleaseItem
                    key={release.id}
                    release={release}
                    view="grid"
                    isPlaying={
                      currentTrack?.albumId === release.id &&
                      playbackStatus === 'playing'
                    }
                    onPlay={() => handlePlayRelease(release)}
                    onDeleteRequest={setDeleteConfirm}
                  />
                ))}
              </MediaGrid>
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
                No releases match "{searchQuery}" under{' '}
                {activePill.toUpperCase()}.
              </div>
            ) : (
              /* Empty Collection State */
              <div className="p-12 border border-dashed border-border bg-card/40 text-center space-y-4 my-6 rounded-2xl select-none">
                <div className="w-14 h-14 bg-card border border-border text-primary flex items-center justify-center mx-auto rounded-full shadow-md">
                  <UploadCloudSVG className="w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <H2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                    Your Personal Vault is Empty
                  </H2>
                  <p className="font-sans text-caption text-muted-foreground max-w-md mx-auto leading-relaxed">
                    Upload your offline audio files in the Locker Manager to
                    start building your private listening library.
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
            <MediaGrid maxColumns={6}>
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
            </MediaGrid>
          ) : (
            /* ===================== RELEASES LIST VIEW (Clean & Minimal, Artist Page Styling) ===================== */
            <div className="flex flex-col gap-1.5">
              {personalReleases.map((release) => (
                <VaultReleaseItem
                  key={release.id}
                  release={release}
                  view="list"
                  isPlaying={
                    currentTrack?.albumId === release.id &&
                    playbackStatus === 'playing'
                  }
                  onPlay={() => handlePlayRelease(release)}
                  onDeleteRequest={setDeleteConfirm}
                />
              ))}
            </div>
          )}
          <div ref={loadMoreReleasesRef} className="h-6" />
        </div>
      )}

      {/* ===================== DELETE CONFIRMATION MODAL ===================== */}
      <ConfirmDialog
        open={deleteConfirm !== null}
        title="Move to recycle bin?"
        description={
          deleteConfirm
            ? `"${deleteConfirm.title}" moves to the 30-day recycle bin. You can restore it any time from the Locker Manager.`
            : ''
        }
        confirmLabel={isDeleting ? 'Moving...' : 'Move to Trash'}
        tone="danger"
        isBusy={isDeleting}
        onConfirm={() => {
          if (deleteConfirm) void handleDeleteRelease(deleteConfirm.id)
        }}
        onCancel={() => setDeleteConfirm(null)}
      />

      {/* ===================== TOAST NOTIFICATION ===================== */}
    </div>
  )
}
