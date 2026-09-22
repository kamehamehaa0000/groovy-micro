import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'
import {
  searchApi,
  type GlobalSearchResponse,
  type SearchSongItem,
} from '../lib/search.api'
import { usePlayerStore } from '../stores/player.store'
import { useLikesStore } from '../stores/likes.store'
import { useFollowsStore } from '../stores/follows.store'
import { useAuthStore } from '../stores/auth.store'
import { useAuthModalStore } from '../stores/auth-modal.store'
import type { PlayerTrack } from '../types/player'
import {
  PlayIconSVG,
  PauseIconSVG,
  HeartIconSVG,
  VerifiedBadgeSVG,
  LockIconSVG,
  MusicIconSVG,
  DiscIconSVG,
} from '../components/icons'
import { ProceduralCover } from '../components/common/ProceduralCover'
import { SongActionMenu } from '../components/player/SongActionMenu'

interface SearchPageParams {
  q?: string
  type?: 'all' | 'songs' | 'albums' | 'artists' | 'playlists' | 'users'
}

export const Route = createFileRoute('/search')({
  component: SearchPageComponent,
  validateSearch: (search: Record<string, unknown>): SearchPageParams => {
    const rawType = typeof search.type === 'string' ? search.type : 'all'
    const validTypes = ['all', 'songs', 'albums', 'artists', 'playlists', 'users']
    return {
      q: typeof search.q === 'string' ? search.q : undefined,
      type: validTypes.includes(rawType)
        ? (rawType as SearchPageParams['type'])
        : 'all',
    }
  },
})

function formatDuration(totalSeconds: number) {
  const mins = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const GENRE_SUGGESTIONS = [
  'Electronic',
  'Ambient',
  'Synthwave',
  'Jazz',
  'Indie Rock',
  'Hip-Hop',
  'Classical',
  'Lofi Beats',
  'Dream Pop',
]

function SearchPageComponent() {
  const searchParams = Route.useSearch()
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState(searchParams.q || '')
  const [activeCategory, setActiveCategory] = useState<
    'all' | 'songs' | 'albums' | 'artists' | 'playlists' | 'users'
  >(searchParams.type || 'all')
  const [results, setResults] = useState<GlobalSearchResponse | null>(null)
  const [isSearching, setIsSearching] = useState(false)

  const { currentTrack, playbackStatus, playTrack, togglePlay, addToQueue } =
    usePlayerStore()
  const { isSongLiked, toggleSongLike, isAlbumLiked, toggleAlbumLike } =
    useLikesStore()
  const { isFollowing, toggleFollow } = useFollowsStore()
  const { isAuthenticated } = useAuthStore()
  const openAuthModal = useAuthModalStore((s) => s.openAuthModal)

  // Sync internal state when URL search params change (e.g. back/forward navigation)
  useEffect(() => {
    if (searchParams.q !== undefined && searchParams.q !== query) {
      setQuery(searchParams.q)
    }
    if (searchParams.type && searchParams.type !== activeCategory) {
      setActiveCategory(searchParams.type)
    }
  }, [searchParams.q, searchParams.type])

  // Focus input on mount if no query provided
  useEffect(() => {
    if (!searchParams.q) {
      inputRef.current?.focus()
    }
  }, [])

  // Debounced search query & URL synchronization
  useEffect(() => {
    const trimmed = query.trim()

    // Sync query into URL params without adding duplicate history entries
    const timer = setTimeout(async () => {
      navigate({
        to: '/search',
        search: {
          q: trimmed || undefined,
          type: activeCategory !== 'all' ? activeCategory : undefined,
        },
        replace: true,
      })

      if (!trimmed) {
        setResults(null)
        setIsSearching(false)
        return
      }

      setIsSearching(true)
      try {
        const fetchLimit = activeCategory === 'all' ? 8 : 24
        const res = await searchApi.search(trimmed, fetchLimit, activeCategory)
        setResults(res)

        // Hydrate stores for likes and follows
        if (res.songs.length > 0) {
          useLikesStore.getState().hydrateSongs(res.songs)
        }
        if (res.albums.length > 0) {
          useLikesStore.getState().hydrateAlbums(res.albums)
        }
        if (res.artists.length > 0) {
          useFollowsStore.getState().hydrateArtists(
            res.artists.map((a) => ({
              id: a.id,
              userId: '',
              stageName: a.stageName,
              slug: a.slug,
              avatarUrl: a.avatarUrl,
              bannerUrl: a.bannerUrl,
              verified: a.verified,
              monthlyListeners: a.monthlyListeners,
            }))
          )
        }
      } catch (err) {
        console.warn('[SearchPage] Search failed:', err)
      } finally {
        setIsSearching(false)
      }
    }, 200)

    return () => clearTimeout(timer)
  }, [query, activeCategory, navigate])

  // Play a song from search results
  const handlePlaySong = (
    song: SearchSongItem,
    allSongs: SearchSongItem[],
    index: number
  ) => {
    const isThisPlaying = currentTrack?.id === song.id
    if (isThisPlaying) {
      togglePlay()
      return
    }

    const playerTrackList: PlayerTrack[] = allSongs.map((t) => ({
      id: t.id,
      title: t.title,
      artistId: t.artistId,
      artistName: t.artistName,
      artistSlug: t.artistSlug,
      albumId: t.albumId || '',
      albumTitle: t.albumTitle || '',
      coverImageUrl: t.coverImageUrl,
      durationSeconds: t.durationSeconds,
      audioUrl: t.audioUrl,
      isExplicit: t.isExplicit,
    }))

    playTrack(
      playerTrackList[index],
      playerTrackList,
      index,
      `search:${query}`,
      `Search: "${query}"`
    )
  }

  const handleToggleSongLike = async (songId: string) => {
    if (!isAuthenticated) {
      openAuthModal()
      return
    }
    await toggleSongLike(songId)
  }

  const handleToggleAlbumLike = async (albumId: string) => {
    if (!isAuthenticated) {
      openAuthModal()
      return
    }
    await toggleAlbumLike(albumId)
  }

  const handleToggleArtistFollow = async (artistId: string) => {
    if (!isAuthenticated) {
      openAuthModal()
      return
    }
    await toggleFollow(artistId)
  }

  const hasAnyResults =
    results &&
    (results.songs.length > 0 ||
      results.albums.length > 0 ||
      results.artists.length > 0 ||
      results.playlists.length > 0 ||
      results.users.length > 0)

  return (
    <div className="w-full space-y-10">
      {/* ===================== HERO SEARCH HEADER ===================== */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 border-b border-line pb-4">
          <div>
            <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-blue-deep dark:text-blue-400 mb-1">
              Groovy Music Exploration
            </div>
            <h1 className="font-serif italic text-3xl sm:text-4xl font-bold tracking-tight text-ink">
              Search Catalog
            </h1>
          </div>
          <p className="font-mono text-xs text-ink-soft sm:text-right">
            Tracks • Artists • Albums • Playlists • Curators
          </p>
        </div>

        {/* Search Input Box */}
        <div className="relative flex items-center bg-panel border border-line focus-within:border-ink transition-colors shadow-xs">
          <div className="pl-4 sm:pl-5 pr-3 text-ink-soft shrink-0">
            <svg
              className="w-5 h-5 text-ink-soft"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tracks, artists, albums, playlists, or listeners..."
            className="w-full py-4 text-base sm:text-lg bg-transparent text-ink placeholder:text-ink-soft/60 focus:outline-hidden font-sans"
          />

          {isSearching && (
            <div className="pr-4 shrink-0">
              <div className="w-5 h-5 rounded-full border-2 border-ink-soft/30 border-t-ink animate-spin" />
            </div>
          )}

          {query && !isSearching && (
            <button
              type="button"
              onClick={() => {
                setQuery('')
                inputRef.current?.focus()
              }}
              className="mr-3 font-mono text-[10px] uppercase tracking-wider text-ink-soft hover:text-ink px-2 py-1 border border-line hover:border-ink transition-colors cursor-pointer bg-canvas"
            >
              Clear
            </button>
          )}
        </div>

        {/* Category Pills Bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 text-xs font-mono uppercase tracking-wider scrollbar-none">
          {([
            { id: 'all' as const, label: 'All Results', count: undefined },
            {
              id: 'songs' as const,
              label: 'Tracks',
              count: results?.songs.length,
            },
            {
              id: 'artists' as const,
              label: 'Artists',
              count: results?.artists.length,
            },
            {
              id: 'albums' as const,
              label: 'Albums',
              count: results?.albums.length,
            },
            {
              id: 'playlists' as const,
              label: 'Playlists',
              count: results?.playlists.length,
            },
            {
              id: 'users' as const,
              label: 'Community',
              count: results?.users.length,
            },
          ] as Array<{
            id: 'all' | 'songs' | 'albums' | 'artists' | 'playlists' | 'users'
            label: string
            count?: number
          }>).map((cat) => {
            const isActive = activeCategory === cat.id
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`px-3.5 py-1.5 rounded-full border transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 text-[11px] ${
                  isActive
                    ? 'bg-ink text-canvas border-ink font-semibold shadow-xs'
                    : 'bg-panel text-ink-soft border-line hover:text-ink hover:border-ink/60'
                }`}
              >
                <span>{cat.label}</span>
                {cat.count !== undefined && cat.count > 0 && (
                  <span
                    className={`font-mono text-[9px] px-1.5 py-0.2 rounded-full ${
                      isActive
                        ? 'bg-canvas text-ink'
                        : 'bg-canvas-deep text-ink-soft border border-line'
                    }`}
                  >
                    {cat.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ===================== EMPTY QUERY STATE: DISCOVERY HUB ===================== */}
      {!query.trim() && (
        <div className="space-y-10 py-6 animate-fade-in">
          {/* Genre & Tag Suggestions */}
          <div>
            <h3 className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-ink-soft mb-3">
              Explore by Style &amp; Genre
            </h3>
            <div className="flex flex-wrap gap-2">
              {GENRE_SUGGESTIONS.map((genre) => (
                <button
                  key={genre}
                  type="button"
                  onClick={() => setQuery(genre)}
                  className="font-sans text-xs px-3.5 py-2 border border-line bg-panel hover:bg-canvas-deep hover:border-ink text-ink transition-colors cursor-pointer shadow-2xs"
                >
                  ✦ {genre}
                </button>
              ))}
            </div>
          </div>

          {/* Catalog Hub Portals */}
          <div>
            <h3 className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-ink-soft mb-3">
              Browse the Groovy Collection
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Link
                to="/artists"
                className="group border border-line bg-panel p-5 hover:border-ink transition-all flex flex-col justify-between h-40 shadow-xs"
              >
                <div>
                  <span className="font-mono text-[9px] uppercase tracking-wider text-blue bg-blue/10 px-2 py-0.5 rounded-full inline-block mb-2">
                    Musicians
                  </span>
                  <h4 className="font-serif italic text-lg font-bold text-ink group-hover:text-blue transition-colors">
                    Artists Roster
                  </h4>
                  <p className="font-sans text-xs text-ink-soft mt-1 line-clamp-2">
                    Official verified artists, monthly listeners, and public discographies.
                  </p>
                </div>
                <span className="font-mono text-[10px] text-ink-soft group-hover:text-ink transition-colors flex items-center gap-1">
                  <span>Browse Roster</span>
                  <span>&rarr;</span>
                </span>
              </Link>

              <Link
                to="/playlists"
                className="group border border-line bg-panel p-5 hover:border-ink transition-all flex flex-col justify-between h-40 shadow-xs"
              >
                <div>
                  <span className="font-mono text-[9px] uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full inline-block mb-2">
                    Curations
                  </span>
                  <h4 className="font-serif italic text-lg font-bold text-ink group-hover:text-blue transition-colors">
                    Public Playlists
                  </h4>
                  <p className="font-sans text-xs text-ink-soft mt-1 line-clamp-2">
                    Listener-made mixtapes, collaborative rooms, and sonic journeys.
                  </p>
                </div>
                <span className="font-mono text-[10px] text-ink-soft group-hover:text-ink transition-colors flex items-center gap-1">
                  <span>Explore Playlists</span>
                  <span>&rarr;</span>
                </span>
              </Link>

              <Link
                to="/"
                className="group border border-line bg-panel p-5 hover:border-ink transition-all flex flex-col justify-between h-40 shadow-xs"
              >
                <div>
                  <span className="font-mono text-[9px] uppercase tracking-wider text-purple-600 dark:text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full inline-block mb-2">
                    Releases
                  </span>
                  <h4 className="font-serif italic text-lg font-bold text-ink group-hover:text-blue transition-colors">
                    Catalog Releases
                  </h4>
                  <p className="font-sans text-xs text-ink-soft mt-1 line-clamp-2">
                    New singles, full-length LPs, and scheduled upcoming pre-saves.
                  </p>
                </div>
                <span className="font-mono text-[10px] text-ink-soft group-hover:text-ink transition-colors flex items-center gap-1">
                  <span>Open Catalog</span>
                  <span>&rarr;</span>
                </span>
              </Link>

              <Link
                to="/collection"
                className="group border border-line bg-panel p-5 hover:border-ink transition-all flex flex-col justify-between h-40 shadow-xs"
              >
                <div>
                  <span className="font-mono text-[9px] uppercase tracking-wider text-indigo-500 bg-indigo-500/10 px-2 py-0.5 rounded-full inline-block mb-2">
                    Locker
                  </span>
                  <h4 className="font-serif italic text-lg font-bold text-ink group-hover:text-blue transition-colors">
                    Personal Collection
                  </h4>
                  <p className="font-sans text-xs text-ink-soft mt-1 line-clamp-2">
                    Private lossless master uploads and personal metadata tags.
                  </p>
                </div>
                <span className="font-mono text-[10px] text-ink-soft group-hover:text-ink transition-colors flex items-center gap-1">
                  <span>View Vault</span>
                  <span>&rarr;</span>
                </span>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ===================== NO RESULTS STATE ===================== */}
      {query.trim() && !isSearching && !hasAnyResults && (
        <div className="py-20 text-center border border-dashed border-line bg-panel/40">
          <div className="font-serif italic text-2xl text-ink mb-2">
            No results found for &ldquo;{query}&rdquo;
          </div>
          <p className="font-sans text-xs text-ink-soft max-w-md mx-auto leading-relaxed">
            Please check your spelling or search by an artist name, song title, album title, or curator handle.
          </p>
          <div className="mt-6">
            <button
              type="button"
              onClick={() => setQuery('')}
              className="font-mono text-xs uppercase tracking-wider px-4 py-2 border border-line bg-panel hover:bg-canvas text-ink transition-colors cursor-pointer"
            >
              Clear Search Query
            </button>
          </div>
        </div>
      )}

      {/* ===================== SEARCH RESULTS SECTION ===================== */}
      {hasAnyResults && (
        <div className="space-y-12 animate-fade-in">
          {/* 1. TOP RESULT CARD */}
          {results.topResult && activeCategory === 'all' && (
            <div className="space-y-3">
              <h3 className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-blue-deep dark:text-blue-400">
                Top Result
              </h3>

              <div className="border border-line bg-panel p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-6 hover:border-ink transition-colors group">
                {/* Artist Top Result */}
                {results.topResult.type === 'artist' && (
                  <div className="flex items-center gap-5 flex-1 min-w-0">
                    <Link
                      to="/artists/$idOrSlug"
                      params={{ idOrSlug: (results.topResult.item as any).slug }}
                      className="w-20 h-20 rounded-full bg-stone/20 border border-line shrink-0 overflow-hidden"
                    >
                      {(results.topResult.item as any).avatarUrl ? (
                        <img
                          src={(results.topResult.item as any).avatarUrl}
                          alt={(results.topResult.item as any).stageName}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center font-serif italic text-2xl text-ink">
                          {(results.topResult.item as any).stageName[0]}
                        </div>
                      )}
                    </Link>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="font-mono text-[9px] uppercase tracking-wider text-blue bg-blue/10 px-2 py-0.5 rounded-full inline-block font-semibold">
                          Artist
                        </span>
                        {(results.topResult.item as any).verified && (
                          <VerifiedBadgeSVG className="w-4 h-4 text-blue" />
                        )}
                      </div>
                      <Link
                        to="/artists/$idOrSlug"
                        params={{ idOrSlug: (results.topResult.item as any).slug }}
                        className="font-serif italic text-2xl sm:text-3xl font-bold text-ink hover:text-blue transition-colors truncate block"
                      >
                        {(results.topResult.item as any).stageName}
                      </Link>
                      <p className="font-mono text-xs text-ink-soft mt-1">
                        {(results.topResult.item as any).monthlyListeners.toLocaleString()}{' '}
                        monthly listeners
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleArtistFollow((results.topResult!.item as any).id)}
                      className={`shrink-0 font-mono text-[10px] uppercase tracking-wider px-4 py-2 border transition-all cursor-pointer ${
                        isFollowing((results.topResult.item as any).id)
                          ? 'bg-panel text-ink border-line hover:border-ink'
                          : 'bg-ink text-canvas border-ink hover:bg-canvas hover:text-ink'
                      }`}
                    >
                      {isFollowing((results.topResult.item as any).id)
                        ? 'Following'
                        : '+ Follow'}
                    </button>
                  </div>
                )}

                {/* Song Top Result */}
                {results.topResult.type === 'song' && (
                  <div className="flex items-center gap-5 flex-1 min-w-0">
                    <div className="w-20 h-20 bg-stone/20 border border-line shrink-0 overflow-hidden relative shadow-xs">
                      {(results.topResult.item as any).coverImageUrl ? (
                        <img
                          src={(results.topResult.item as any).coverImageUrl}
                          alt={(results.topResult.item as any).title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ProceduralCover
                          size="md"
                          title={(results.topResult.item as any).title}
                          artistName={(results.topResult.item as any).artistName}
                          className="w-full h-full rounded-none"
                        />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                        <span className="font-mono text-[9px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full inline-block font-semibold">
                          Track
                        </span>
                        {(results.topResult.item as any).isPersonal && (
                          <span className="font-mono text-[8.5px] uppercase tracking-wider text-indigo-500 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.2 rounded-full font-semibold">
                            Personal Collection
                          </span>
                        )}
                        {(results.topResult.item as any).isExplicit && (
                          <span className="font-mono text-[8.5px] uppercase border border-line px-1.5 py-0.2 rounded text-ink-soft">
                            E
                          </span>
                        )}
                      </div>
                      <h3 className="font-serif italic text-2xl font-bold text-ink truncate">
                        {(results.topResult.item as any).title}
                      </h3>
                      <Link
                        to="/artists/$idOrSlug"
                        params={{ idOrSlug: (results.topResult.item as any).artistSlug }}
                        className="font-sans text-sm text-ink-soft hover:text-blue transition-colors truncate block mt-0.5"
                      >
                        {(results.topResult.item as any).artistName}
                      </Link>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleSongLike((results.topResult!.item as any).id)}
                        className="w-10 h-10 rounded-full border border-line bg-panel hover:border-ink flex items-center justify-center text-ink-soft hover:text-red-500 transition-colors cursor-pointer"
                        title="Like Track"
                      >
                        <HeartIconSVG
                          className="w-4 h-4"
                          filled={isSongLiked((results.topResult.item as any).id)}
                        />
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          handlePlaySong(
                            results.topResult!.item as SearchSongItem,
                            results.songs,
                            0
                          )
                        }
                        className="w-12 h-12 rounded-full bg-ink text-canvas hover:scale-105 flex items-center justify-center transition-all cursor-pointer shadow-md"
                        title="Play Track"
                      >
                        {currentTrack?.id === (results.topResult.item as any).id &&
                        playbackStatus === 'playing' ? (
                          <PauseIconSVG className="w-5 h-5" />
                        ) : (
                          <PlayIconSVG className="w-5 h-5 ml-0.5" />
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Album Top Result */}
                {results.topResult.type === 'album' && (
                  <div className="flex items-center gap-5 flex-1 min-w-0">
                    <Link
                      to="/albums/$idOrSlug"
                      params={{ idOrSlug: (results.topResult.item as any).slug }}
                      className="w-20 h-20 bg-stone/20 border border-line shrink-0 overflow-hidden shadow-xs"
                    >
                      {(results.topResult.item as any).coverImageUrl ? (
                        <img
                          src={(results.topResult.item as any).coverImageUrl}
                          alt={(results.topResult.item as any).title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <ProceduralCover
                          size="md"
                          title={(results.topResult.item as any).title}
                          artistName={(results.topResult.item as any).artistName}
                          className="w-full h-full rounded-none"
                        />
                      )}
                    </Link>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                        <span className="font-mono text-[9px] uppercase tracking-wider text-purple-600 dark:text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full inline-block font-semibold">
                          {(results.topResult.item as any).albumType || 'Album'}
                        </span>
                        {(results.topResult.item as any).isPersonal && (
                          <span className="font-mono text-[8.5px] uppercase tracking-wider text-indigo-500 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.2 rounded-full font-semibold">
                            Personal Collection
                          </span>
                        )}
                      </div>
                      <Link
                        to="/albums/$idOrSlug"
                        params={{ idOrSlug: (results.topResult.item as any).slug }}
                        className="font-serif italic text-2xl font-bold text-ink hover:text-blue transition-colors truncate block"
                      >
                        {(results.topResult.item as any).title}
                      </Link>
                      <Link
                        to="/artists/$idOrSlug"
                        params={{ idOrSlug: (results.topResult.item as any).artistSlug }}
                        className="font-sans text-sm text-ink-soft hover:text-blue transition-colors truncate block mt-0.5"
                      >
                        {(results.topResult.item as any).artistName}
                      </Link>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleAlbumLike((results.topResult!.item as any).id)}
                        className="w-10 h-10 rounded-full border border-line bg-panel hover:border-ink flex items-center justify-center text-ink-soft hover:text-red-500 transition-colors cursor-pointer"
                        title="Like Album"
                      >
                        <HeartIconSVG
                          className="w-4 h-4"
                          filled={isAlbumLiked((results.topResult.item as any).id)}
                        />
                      </button>

                      <Link
                        to="/albums/$idOrSlug"
                        params={{ idOrSlug: (results.topResult.item as any).slug }}
                        className="font-mono text-[10px] uppercase tracking-wider px-4 py-2 border border-line bg-canvas hover:border-ink text-ink transition-colors"
                      >
                        View Album &rarr;
                      </Link>
                    </div>
                  </div>
                )}

                {/* Playlist Top Result */}
                {results.topResult.type === 'playlist' && (
                  <div className="flex items-center gap-5 flex-1 min-w-0">
                    <Link
                      to="/playlists/$id"
                      params={{ id: (results.topResult.item as any).id }}
                      className="w-20 h-20 bg-stone/20 border border-line shrink-0 overflow-hidden shadow-xs flex items-center justify-center"
                    >
                      {(results.topResult.item as any).coverImageUrl ? (
                        <img
                          src={(results.topResult.item as any).coverImageUrl}
                          alt={(results.topResult.item as any).title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <span className="font-serif italic text-2xl text-ink-soft">♫</span>
                      )}
                    </Link>

                    <div className="min-w-0 flex-1">
                      <span className="font-mono text-[9px] uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full inline-block font-semibold mb-1.5">
                        Playlist
                      </span>
                      <Link
                        to="/playlists/$id"
                        params={{ id: (results.topResult.item as any).id }}
                        className="font-serif italic text-2xl font-bold text-ink hover:text-blue transition-colors truncate block"
                      >
                        {(results.topResult.item as any).title}
                      </Link>
                      <p className="font-mono text-xs text-ink-soft mt-1">
                        Curated by {(results.topResult.item as any).ownerName} •{' '}
                        {(results.topResult.item as any).tracksCount} tracks
                      </p>
                    </div>

                    <Link
                      to="/playlists/$id"
                      params={{ id: (results.topResult.item as any).id }}
                      className="font-mono text-[10px] uppercase tracking-wider px-4 py-2 border border-line bg-canvas hover:border-ink text-ink transition-colors shrink-0"
                    >
                      Open Playlist &rarr;
                    </Link>
                  </div>
                )}

                {/* User Top Result */}
                {results.topResult.type === 'user' && (
                  <div className="flex items-center gap-5 flex-1 min-w-0">
                    <Link
                      to="/users/$id"
                      params={{ id: (results.topResult.item as any).id }}
                      className="w-20 h-20 rounded-full bg-stone/20 border border-line shrink-0 overflow-hidden flex items-center justify-center font-serif italic text-2xl text-ink"
                    >
                      {(results.topResult.item as any).avatarUrl ? (
                        <img
                          src={(results.topResult.item as any).avatarUrl}
                          alt={(results.topResult.item as any).displayName}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        (results.topResult.item as any).displayName[0]?.toUpperCase()
                      )}
                    </Link>

                    <div className="min-w-0 flex-1">
                      <span className="font-mono text-[9px] uppercase tracking-wider text-stone/80 bg-stone/20 px-2 py-0.5 rounded-full inline-block font-semibold mb-1.5">
                        {(results.topResult.item as any).role}
                      </span>
                      <div className="flex items-center gap-2">
                        <Link
                          to="/users/$id"
                          params={{ id: (results.topResult.item as any).id }}
                          className="font-serif italic text-2xl font-bold text-ink hover:text-blue transition-colors truncate block"
                        >
                          {(results.topResult.item as any).displayName}
                        </Link>
                        {(results.topResult.item as any).isPrivateAccount && (
                          <LockIconSVG className="w-3.5 h-3.5 text-ink-soft shrink-0" />
                        )}
                      </div>
                    </div>

                    <Link
                      to="/users/$id"
                      params={{ id: (results.topResult.item as any).id }}
                      className="font-mono text-[10px] uppercase tracking-wider px-4 py-2 border border-line bg-canvas hover:border-ink text-ink transition-colors shrink-0"
                    >
                      View Profile &rarr;
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 2. TRACKS / SONGS SECTION */}
          {results.songs.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-2">
                <div className="flex items-center gap-3">
                  <MusicIconSVG className="w-4 h-4 text-ink-soft" />
                  <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink font-semibold">
                    Tracks ({results.songs.length})
                  </h3>
                </div>
                {activeCategory === 'all' && results.songs.length >= 6 && (
                  <button
                    type="button"
                    onClick={() => setActiveCategory('songs')}
                    className="font-mono text-[10px] uppercase tracking-wider text-blue hover:underline cursor-pointer"
                  >
                    View all tracks &rarr;
                  </button>
                )}
              </div>

              <div className="border border-line bg-panel divide-y divide-line shadow-xs">
                {results.songs.map((song, idx) => {
                  const isCurrentPlaying =
                    currentTrack?.id === song.id &&
                    playbackStatus === 'playing'
                  const isLiked = isSongLiked(song.id)

                  const playerTrackData: PlayerTrack = {
                    id: song.id,
                    title: song.title,
                    artistId: song.artistId,
                    artistName: song.artistName,
                    artistSlug: song.artistSlug,
                    albumId: song.albumId || '',
                    albumTitle: song.albumTitle || '',
                    coverImageUrl: song.coverImageUrl,
                    durationSeconds: song.durationSeconds,
                    audioUrl: song.audioUrl,
                    isExplicit: song.isExplicit,
                  }

                  return (
                    <div
                      key={song.id}
                      className="flex items-center justify-between p-3.5 hover:bg-canvas-deep transition-colors group"
                    >
                      <div className="flex items-center gap-3.5 min-w-0 flex-1 pr-4">
                        <button
                          type="button"
                          onClick={() => handlePlaySong(song, results.songs, idx)}
                          className="w-8 h-8 rounded-full border border-line flex items-center justify-center font-mono text-xs text-ink-soft hover:border-ink hover:text-ink transition-colors shrink-0 cursor-pointer bg-canvas"
                          title={isCurrentPlaying ? 'Pause' : 'Play'}
                        >
                          {isCurrentPlaying ? (
                            <PauseIconSVG className="w-3.5 h-3.5" />
                          ) : (
                            <PlayIconSVG className="w-3.5 h-3.5 ml-0.5" />
                          )}
                        </button>

                        <div className="w-10 h-10 bg-stone/20 border border-line shrink-0 overflow-hidden shadow-2xs">
                          {song.coverImageUrl ? (
                            <img
                              src={song.coverImageUrl}
                              alt={song.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <ProceduralCover
                              size="sm"
                              title={song.title}
                              artistName={song.artistName}
                              className="w-full h-full rounded-none text-[10px]"
                            />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-serif italic text-base font-semibold text-ink truncate group-hover:text-blue transition-colors">
                              {song.title}
                            </span>
                            {song.isPersonal && (
                              <span className="font-mono text-[8px] uppercase tracking-wider text-indigo-500 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.2 rounded font-semibold">
                                Personal
                              </span>
                            )}
                            {song.isExplicit && (
                              <span className="font-mono text-[8px] uppercase border border-line px-1 py-0.2 rounded text-ink-soft">
                                E
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-ink-soft font-sans truncate">
                            <Link
                              to="/artists/$idOrSlug"
                              params={{ idOrSlug: song.artistSlug }}
                              className="hover:text-ink hover:underline transition-colors"
                            >
                              {song.artistName}
                            </Link>
                            {song.albumTitle && song.albumId && (
                              <>
                                <span>•</span>
                                <Link
                                  to="/albums/$idOrSlug"
                                  params={{ idOrSlug: song.slug || song.albumId }}
                                  className="hover:text-ink hover:underline transition-colors truncate"
                                >
                                  {song.albumTitle}
                                </Link>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-mono text-xs text-ink-soft">
                          {formatDuration(song.durationSeconds)}
                        </span>

                        <button
                          type="button"
                          onClick={() => handleToggleSongLike(song.id)}
                          className="p-1.5 text-ink-soft hover:text-red-500 transition-colors cursor-pointer"
                          title="Like Track"
                        >
                          <HeartIconSVG
                            className="w-4 h-4"
                            filled={isLiked}
                          />
                        </button>

                        <button
                          type="button"
                          onClick={() => addToQueue(playerTrackData)}
                          className="hidden sm:inline-block font-mono text-[9px] uppercase tracking-wider text-ink-soft hover:text-ink transition-colors px-2 py-1 border border-line hover:border-ink cursor-pointer bg-canvas"
                          title="Add to queue"
                        >
                          + Queue
                        </button>

                        <SongActionMenu track={playerTrackData} align="right" />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 3. ARTISTS SECTION */}
          {results.artists.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-2">
                <div className="flex items-center gap-3">
                  <VerifiedBadgeSVG className="w-4 h-4 text-ink-soft" />
                  <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink font-semibold">
                    Artists ({results.artists.length})
                  </h3>
                </div>
                {activeCategory === 'all' && results.artists.length >= 6 && (
                  <button
                    type="button"
                    onClick={() => setActiveCategory('artists')}
                    className="font-mono text-[10px] uppercase tracking-wider text-blue hover:underline cursor-pointer"
                  >
                    View all artists &rarr;
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {results.artists.map((artist) => (
                  <Link
                    key={artist.id}
                    to="/artists/$idOrSlug"
                    params={{ idOrSlug: artist.slug }}
                    className="border border-line bg-panel p-4 shadow-2xs hover:border-ink transition-all group flex flex-col items-center text-center"
                  >
                    <div className="w-20 h-20 rounded-full bg-stone/20 border border-line shrink-0 overflow-hidden mb-3 shadow-2xs">
                      {artist.avatarUrl ? (
                        <img
                          src={artist.avatarUrl}
                          alt={artist.stageName}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center font-serif italic text-xl text-ink">
                          {artist.stageName[0]}
                        </div>
                      )}
                    </div>
                    <div className="w-full min-w-0">
                      <div className="flex items-center justify-center gap-1">
                        <h4 className="font-serif italic text-sm font-bold text-ink truncate group-hover:text-blue transition-colors">
                          {artist.stageName}
                        </h4>
                        {artist.verified && (
                          <VerifiedBadgeSVG className="w-3.5 h-3.5 text-blue shrink-0" />
                        )}
                      </div>
                      <span className="font-mono text-[9px] text-ink-soft block mt-0.5">
                        {artist.monthlyListeners.toLocaleString()} listeners
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* 4. ALBUMS SECTION */}
          {results.albums.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-2">
                <div className="flex items-center gap-3">
                  <DiscIconSVG className="w-4 h-4 text-ink-soft" />
                  <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink font-semibold">
                    Albums &amp; Releases ({results.albums.length})
                  </h3>
                </div>
                {activeCategory === 'all' && results.albums.length >= 6 && (
                  <button
                    type="button"
                    onClick={() => setActiveCategory('albums')}
                    className="font-mono text-[10px] uppercase tracking-wider text-blue hover:underline cursor-pointer"
                  >
                    View all releases &rarr;
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {results.albums.map((album) => (
                  <Link
                    key={album.id}
                    to="/albums/$idOrSlug"
                    params={{ idOrSlug: album.slug }}
                    className="border border-line bg-panel p-3.5 shadow-2xs hover:border-ink transition-all group flex flex-col"
                  >
                    <div className="w-full aspect-square bg-stone/20 border border-line shrink-0 overflow-hidden mb-3 shadow-2xs">
                      {album.coverImageUrl ? (
                        <img
                          src={album.coverImageUrl}
                          alt={album.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <ProceduralCover
                          size="md"
                          title={album.title}
                          artistName={album.artistName}
                          className="w-full h-full rounded-none"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                        <span className="font-mono text-[8px] uppercase tracking-wider text-purple-600 dark:text-purple-400 bg-purple-500/10 px-1.5 py-0.2 rounded font-semibold">
                          {album.albumType || 'Album'}
                        </span>
                        {album.isPersonal && (
                          <span className="font-mono text-[8px] uppercase tracking-wider text-indigo-500 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.2 rounded font-semibold">
                            Personal
                          </span>
                        )}
                      </div>
                      <h4 className="font-serif italic text-sm font-semibold text-ink truncate group-hover:text-blue transition-colors">
                        {album.title}
                      </h4>
                      <span className="font-sans text-xs text-ink-soft truncate block mt-0.5">
                        {album.artistName}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* 5. PLAYLISTS SECTION */}
          {results.playlists.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-2">
                <div className="flex items-center gap-3">
                  <span className="font-serif italic text-sm text-ink-soft">♫</span>
                  <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink font-semibold">
                    Playlists ({results.playlists.length})
                  </h3>
                </div>
                {activeCategory === 'all' && results.playlists.length >= 6 && (
                  <button
                    type="button"
                    onClick={() => setActiveCategory('playlists')}
                    className="font-mono text-[10px] uppercase tracking-wider text-blue hover:underline cursor-pointer"
                  >
                    View all playlists &rarr;
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {results.playlists.map((playlist) => (
                  <Link
                    key={playlist.id}
                    to="/playlists/$id"
                    params={{ id: playlist.id }}
                    className="border border-line bg-panel p-3.5 shadow-2xs hover:border-ink transition-all group flex flex-col"
                  >
                    <div className="w-full aspect-square bg-stone/20 border border-line shrink-0 overflow-hidden mb-3 shadow-2xs flex items-center justify-center">
                      {playlist.coverImageUrl ? (
                        <img
                          src={playlist.coverImageUrl}
                          alt={playlist.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <div className="font-serif italic text-2xl text-ink-soft">♫</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="font-mono text-[8px] uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.2 rounded font-semibold inline-block mb-1">
                        Playlist
                      </span>
                      <h4 className="font-serif italic text-sm font-semibold text-ink truncate group-hover:text-blue transition-colors">
                        {playlist.title}
                      </h4>
                      <span className="font-mono text-[9px] text-ink-soft block truncate mt-0.5">
                        By {playlist.ownerName} • {playlist.tracksCount} tracks
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* 6. COMMUNITY / USERS SECTION */}
          {results.users.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-2">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-ink-soft">✦</span>
                  <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink font-semibold">
                    Community Members ({results.users.length})
                  </h3>
                </div>
                {activeCategory === 'all' && results.users.length >= 6 && (
                  <button
                    type="button"
                    onClick={() => setActiveCategory('users')}
                    className="font-mono text-[10px] uppercase tracking-wider text-blue hover:underline cursor-pointer"
                  >
                    View all members &rarr;
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {results.users.map((user) => (
                  <Link
                    key={user.id}
                    to="/users/$id"
                    params={{ id: user.id }}
                    className="border border-line bg-panel p-4 shadow-2xs hover:border-ink transition-all group flex flex-col items-center text-center"
                  >
                    <div className="w-14 h-14 rounded-full bg-stone/20 border border-line shrink-0 overflow-hidden mb-3 shadow-2xs flex items-center justify-center font-serif italic text-lg text-ink">
                      {user.avatarUrl ? (
                        <img
                          src={user.avatarUrl}
                          alt={user.displayName}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        user.displayName[0]?.toUpperCase() || 'U'
                      )}
                    </div>
                    <div className="w-full min-w-0">
                      <div className="flex items-center justify-center gap-1">
                        <h4 className="font-semibold text-xs text-ink truncate group-hover:text-blue transition-colors">
                          {user.displayName}
                        </h4>
                        {user.isPrivateAccount && (
                          <LockIconSVG className="w-2.5 h-2.5 text-ink-soft shrink-0" />
                        )}
                      </div>
                      <span className="font-mono text-[8.5px] uppercase tracking-wider text-ink-soft block mt-0.5">
                        {user.role}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
