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
} from '../components/icons'
import { ProceduralCover } from '../components/common/ProceduralCover'
import { MediaTile } from '../components/common/MediaTile'
import { SongRow } from '../components/common/SongRow'
import { PlaylistCover } from '../components/PlaylistCover'

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

  const { currentTrack, playbackStatus, playTrack, togglePlay } =
    usePlayerStore()
  const { isSongLiked, toggleSongLike, isAlbumLiked, toggleAlbumLike } =
    useLikesStore()
  const { isFollowing, toggleFollow } = useFollowsStore()
  const { isAuthenticated } = useAuthStore()
  const openAuthModal = useAuthModalStore((s) => s.openAuthModal)

  // Sync internal state when URL search params change
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
            })),
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

  const toPlayerTrackFromSearch = (song: SearchSongItem): PlayerTrack => ({
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
    scope: song.isPersonal ? 'PERSONAL' : 'GLOBAL',
  })

  // Play a song from search results
  const handlePlaySong = (
    song: SearchSongItem,
    allSongs: SearchSongItem[],
    index: number,
  ) => {
    const isThisPlaying = currentTrack?.id === song.id
    if (isThisPlaying) {
      togglePlay()
      return
    }

    const playerTrackList: PlayerTrack[] = allSongs.map(toPlayerTrackFromSearch)

    playTrack(
      playerTrackList[index],
      playerTrackList,
      index,
      `search:${query}`,
      `Search: "${query}"`,
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

  const categoryPills = [
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
  ]

  return (
    <div className="max-w-5xl mx-auto px-1 sm:px-6 pt-2 pb-24 md:pb-16 select-none">
      {/* ===================== STICKY SEARCH HEADER & PILLS ===================== */}
      <header className="sticky top-12 z-30 bg-canvas backdrop:backdrop-blur-2xl pt-2 pb-2.5 transition-colors">
        {/* Search Input Box */}
        <div className="relative flex items-center bg-panel border border-line rounded-xl focus-within:border-blue transition-colors shadow-xs">
          <div className="pl-3.5 pr-2.5 text-ink-soft shrink-0">
            <svg
              className="w-4 h-4 text-ink-soft"
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
          </div>

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tracks, artists, albums, playlists..."
            className="w-full py-2.5 sm:py-3 text-sm sm:text-base bg-transparent text-ink placeholder:text-ink-soft/60 focus:outline-none font-sans"
          />

          {isSearching && (
            <div className="pr-3.5 shrink-0">
              <div className="w-4 h-4 rounded-full border-2 border-ink-soft/30 border-t-blue animate-spin" />
            </div>
          )}

          {query && !isSearching && (
            <button
              type="button"
              onClick={() => {
                setQuery('')
                inputRef.current?.focus()
              }}
              className="mr-3 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-ink-soft hover:text-ink hover:bg-canvas-soft transition-colors cursor-pointer"
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* Category Pills Bar (Uniform with /library and /collection) */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scrollbar-none pt-2.5 pb-0.5 select-none -mx-1">
          {/* Active Filter Clear Chip (✕) */}
          {activeCategory !== 'all' && (
            <button
              type="button"
              onClick={() => setActiveCategory('all')}
              aria-label="Clear category filter"
              className="shrink-0 w-7 h-7 rounded-full bg-canvas border border-line flex items-center justify-center text-ink-soft hover:text-ink hover:bg-canvas-soft transition-colors text-xs font-bold cursor-pointer"
            >
              ✕
            </button>
          )}

          {categoryPills.map((cat) => {
            const isActive = activeCategory === cat.id
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`shrink-0 px-3.5 py-1 rounded-full text-xs transition-all duration-150 font-medium cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-ink text-canvas shadow-xs font-semibold'
                    : 'bg-panel border border-line text-ink hover:bg-canvas-soft'
                }`}
              >
                <span>{cat.label}</span>
                {cat.count !== undefined && cat.count > 0 && (
                  <span className="font-mono text-[9.5px] opacity-70">
                    ({cat.count})
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </header>

      {/* ===================== EMPTY QUERY STATE: DISCOVERY HUB ===================== */}
      {!query.trim() && (
        <div className="space-y-8 py-6 animate-in fade-in duration-150">
          {/* Genre & Style Pills */}
          <div>
            <h3 className="font-serif italic font-semibold text-lg text-ink mb-3">
              Explore by Style &amp; Genre
            </h3>
            <div className="flex flex-wrap gap-2">
              {GENRE_SUGGESTIONS.map((genre) => (
                <button
                  key={genre}
                  type="button"
                  onClick={() => setQuery(genre)}
                  className="px-3.5 py-1.5 rounded-full text-xs font-medium bg-panel border border-line text-ink hover:bg-canvas-soft hover:border-ink/50 transition-colors cursor-pointer shadow-2xs"
                >
                  ✦ {genre}
                </button>
              ))}
            </div>
          </div>

          {/* Catalog Hub Portals */}
          <div>
            <h3 className="font-serif italic font-semibold text-lg text-ink mb-3">
              Browse the Catalog
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5 sm:gap-4">
              <Link
                to="/playlists"
                className="group border border-line bg-panel p-3.5 sm:p-5 rounded-xl hover:border-ink/60 hover:bg-canvas-soft/40 transition-all flex flex-col justify-between min-h-[135px] sm:min-h-[160px] shadow-xs text-inherit no-underline"
              >
                <div>
                  <span className="font-mono text-[8.5px] sm:text-[9px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full inline-block mb-1.5 sm:mb-2 font-semibold">
                    Curations
                  </span>
                  <h4 className="font-serif italic text-sm sm:text-lg font-semibold text-ink group-hover:text-blue transition-colors truncate">
                    Public Playlists
                  </h4>
                  <p className="font-sans text-[11px] sm:text-xs text-ink-soft mt-1 line-clamp-2 leading-snug">
                    Community-curated sets, mixtapes, and public mixes.
                  </p>
                </div>
                <span className="font-mono text-[9.5px] sm:text-[10px] text-ink-soft group-hover:text-ink transition-colors flex items-center gap-1 mt-2">
                  <span>Browse Playlists</span>
                  <span>&rarr;</span>
                </span>
              </Link>

              <Link
                to="/artists"
                className="group border border-line bg-panel p-3.5 sm:p-5 rounded-xl hover:border-ink/60 hover:bg-canvas-soft/40 transition-all flex flex-col justify-between min-h-[135px] sm:min-h-[160px] shadow-xs text-inherit no-underline"
              >
                <div>
                  <span className="font-mono text-[8.5px] sm:text-[9px] uppercase tracking-wider text-blue bg-blue/10 px-2 py-0.5 rounded-full inline-block mb-1.5 sm:mb-2 font-semibold">
                    Roster
                  </span>
                  <h4 className="font-serif italic text-sm sm:text-lg font-semibold text-ink group-hover:text-blue transition-colors truncate">
                    Artists Index
                  </h4>
                  <p className="font-sans text-[11px] sm:text-xs text-ink-soft mt-1 line-clamp-2 leading-snug">
                    Verified recording artists and official discographies.
                  </p>
                </div>
                <span className="font-mono text-[9.5px] sm:text-[10px] text-ink-soft group-hover:text-ink transition-colors flex items-center gap-1 mt-2">
                  <span>Browse Roster</span>
                  <span>&rarr;</span>
                </span>
              </Link>

              <Link
                to="/library"
                className="group border border-line bg-panel p-3.5 sm:p-5 rounded-xl hover:border-ink/60 hover:bg-canvas-soft/40 transition-all flex flex-col justify-between min-h-[135px] sm:min-h-[160px] shadow-xs text-inherit no-underline"
              >
                <div>
                  <span className="font-mono text-[8.5px] sm:text-[9px] uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full inline-block mb-1.5 sm:mb-2 font-semibold">
                    Curations
                  </span>
                  <h4 className="font-serif italic text-sm sm:text-lg font-semibold text-ink group-hover:text-blue transition-colors truncate">
                    Your Library
                  </h4>
                  <p className="font-sans text-[11px] sm:text-xs text-ink-soft mt-1 line-clamp-2 leading-snug">
                    Pinned playlists, saved albums, and followed creators.
                  </p>
                </div>
                <span className="font-mono text-[9.5px] sm:text-[10px] text-ink-soft group-hover:text-ink transition-colors flex items-center gap-1 mt-2">
                  <span>Open Library</span>
                  <span>&rarr;</span>
                </span>
              </Link>

              <Link
                to="/"
                className="group border border-line bg-panel p-3.5 sm:p-5 rounded-xl hover:border-ink/60 hover:bg-canvas-soft/40 transition-all flex flex-col justify-between min-h-[135px] sm:min-h-[160px] shadow-xs text-inherit no-underline"
              >
                <div>
                  <span className="font-mono text-[8.5px] sm:text-[9px] uppercase tracking-wider text-purple-600 dark:text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full inline-block mb-1.5 sm:mb-2 font-semibold">
                    Catalog
                  </span>
                  <h4 className="font-serif italic text-sm sm:text-lg font-semibold text-ink group-hover:text-blue transition-colors truncate">
                    New Releases
                  </h4>
                  <p className="font-sans text-[11px] sm:text-xs text-ink-soft mt-1 line-clamp-2 leading-snug">
                    Featured drops, latest master singles, and upcoming drops.
                  </p>
                </div>
                <span className="font-mono text-[9.5px] sm:text-[10px] text-ink-soft group-hover:text-ink transition-colors flex items-center gap-1 mt-2">
                  <span>Explore Drops</span>
                  <span>&rarr;</span>
                </span>
              </Link>

              <Link
                to="/collection"
                className="group border border-line bg-panel p-3.5 sm:p-5 rounded-xl hover:border-ink/60 hover:bg-canvas-soft/40 transition-all flex flex-col justify-between min-h-[135px] sm:min-h-[160px] shadow-xs text-inherit no-underline col-span-2 md:col-span-1"
              >
                <div>
                  <span className="font-mono text-[8.5px] sm:text-[9px] uppercase tracking-wider text-indigo-500 bg-indigo-500/10 px-2 py-0.5 rounded-full inline-block mb-1.5 sm:mb-2 font-semibold">
                    Vault
                  </span>
                  <h4 className="font-serif italic text-sm sm:text-lg font-semibold text-ink group-hover:text-blue transition-colors truncate">
                    Personal Collection
                  </h4>
                  <p className="font-sans text-[11px] sm:text-xs text-ink-soft mt-1 line-clamp-2 leading-snug">
                    Private lossless audio locker and personal cuts.
                  </p>
                </div>
                <span className="font-mono text-[9.5px] sm:text-[10px] text-ink-soft group-hover:text-ink transition-colors flex items-center gap-1 mt-2">
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
        <div className="py-16 text-center border border-dashed border-line bg-panel/30 rounded-xl my-6">
          <div className="font-serif italic text-xl text-ink mb-1.5">
            No results found for &ldquo;{query}&rdquo;
          </div>
          <p className="font-sans text-xs text-ink-soft max-w-sm mx-auto leading-relaxed">
            Please check your spelling or search by an artist name, song title, album title, or curator.
          </p>
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setQuery('')}
              className="font-mono text-[10.5px] uppercase tracking-wider px-4 py-2 border border-line bg-panel hover:bg-canvas text-ink transition-colors cursor-pointer rounded-full"
            >
              Clear Query
            </button>
          </div>
        </div>
      )}

      {/* ===================== SEARCH RESULTS SECTION ===================== */}
      {hasAnyResults && (
        <div className="space-y-8 pt-2 animate-in fade-in duration-150">
          {/* 1. TOP RESULT CARD */}
          {results.topResult && activeCategory === 'all' && (
            <div className="space-y-2.5">
              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-blue font-semibold">
                Top Result
              </span>

              <div className="border border-line bg-panel p-4 sm:p-5 rounded-xl shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-ink/50 transition-colors group">
                {/* Artist Top Result */}
                {results.topResult.type === 'artist' && (
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <Link
                      to="/artists/$idOrSlug"
                      params={{
                        idOrSlug: (results.topResult.item as any).slug,
                      }}
                      className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-canvas-deep border border-line shrink-0 overflow-hidden shadow-xs"
                    >
                      {(results.topResult.item as any).avatarUrl ? (
                        <img
                          src={(results.topResult.item as any).avatarUrl}
                          alt={(results.topResult.item as any).stageName}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center font-serif italic text-2xl text-blue bg-blue/10">
                          {(results.topResult.item as any).stageName[0]}
                        </div>
                      )}
                    </Link>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="font-mono text-[9px] uppercase tracking-wider text-blue font-semibold">
                          Artist
                        </span>
                        {(results.topResult.item as any).verified && (
                          <VerifiedBadgeSVG className="w-3.5 h-3.5 text-blue" />
                        )}
                      </div>
                      <Link
                        to="/artists/$idOrSlug"
                        params={{
                          idOrSlug: (results.topResult.item as any).slug,
                        }}
                        className="font-serif italic text-xl sm:text-2xl font-semibold text-ink hover:text-blue transition-colors truncate block"
                      >
                        {(results.topResult.item as any).stageName}
                      </Link>
                      <p className="font-mono text-xs text-ink-soft mt-0.5">
                        {(
                          results.topResult.item as any
                        ).monthlyListeners.toLocaleString()}{' '}
                        monthly listeners
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        handleToggleArtistFollow(
                          (results.topResult!.item as any).id,
                        )
                      }
                      className={`shrink-0 font-mono text-[10px] uppercase tracking-wider px-4 py-2 rounded-full border transition-all cursor-pointer font-semibold ${
                        isFollowing((results.topResult.item as any).id)
                          ? 'bg-panel text-ink border-line hover:border-red-400 hover:text-red-500'
                          : 'bg-ink text-canvas border-ink hover:opacity-90'
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
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-md bg-canvas-deep border border-line shrink-0 overflow-hidden relative shadow-xs">
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
                          artistName={
                            (results.topResult.item as any).artistName
                          }
                          className="w-full h-full rounded-none"
                        />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                        <span className="font-mono text-[9px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-semibold">
                          Track
                        </span>
                        {(results.topResult.item as any).isPersonal && (
                          <span className="font-mono text-[8.5px] uppercase tracking-wider text-indigo-500 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.2 rounded-full font-semibold">
                            Personal
                          </span>
                        )}
                        {(results.topResult.item as any).isExplicit && (
                          <span className="font-mono text-[8px] uppercase border border-line px-1 py-0.2 rounded text-ink-soft">
                            E
                          </span>
                        )}
                      </div>
                      <h3 className="font-serif italic text-xl sm:text-2xl font-semibold text-ink truncate">
                        {(results.topResult.item as any).title}
                      </h3>
                      <Link
                        to="/artists/$idOrSlug"
                        params={{
                          idOrSlug: (results.topResult.item as any).artistSlug,
                        }}
                        className="font-sans text-xs text-ink-soft hover:text-blue transition-colors truncate block mt-0.5"
                      >
                        {(results.topResult.item as any).artistName}
                      </Link>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          handleToggleSongLike(
                            (results.topResult!.item as any).id,
                          )
                        }
                        className="w-9 h-9 rounded-full border border-line bg-panel hover:border-ink flex items-center justify-center text-ink-soft hover:text-red-500 transition-colors cursor-pointer"
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
                            0,
                          )
                        }
                        className="w-10 h-10 rounded-full bg-blue text-canvas hover:scale-105 flex items-center justify-center transition-all cursor-pointer shadow-md"
                        title="Play Track"
                      >
                        {currentTrack?.id ===
                          (results.topResult.item as any).id &&
                        playbackStatus === 'playing' ? (
                          <PauseIconSVG className="w-4 h-4 text-canvas" />
                        ) : (
                          <PlayIconSVG className="w-4 h-4 text-canvas ml-0.5" />
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Album Top Result */}
                {results.topResult.type === 'album' && (
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <Link
                      to="/albums/$idOrSlug"
                      params={{
                        idOrSlug: (results.topResult.item as any).slug,
                      }}
                      className="w-16 h-16 sm:w-20 sm:h-20 rounded-md bg-canvas-deep border border-line shrink-0 overflow-hidden shadow-xs"
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
                          artistName={
                            (results.topResult.item as any).artistName
                          }
                          className="w-full h-full rounded-none"
                        />
                      )}
                    </Link>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                        <span className="font-mono text-[9px] uppercase tracking-wider text-purple-600 dark:text-purple-400 font-semibold">
                          Release
                        </span>
                        {(results.topResult.item as any).isPersonal && (
                          <span className="font-mono text-[8.5px] uppercase tracking-wider text-indigo-500 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.2 rounded-full font-semibold">
                            Personal
                          </span>
                        )}
                      </div>
                      <Link
                        to="/albums/$idOrSlug"
                        params={{
                          idOrSlug: (results.topResult.item as any).slug,
                        }}
                        className="font-serif italic text-xl sm:text-2xl font-semibold text-ink hover:text-blue transition-colors truncate block"
                      >
                        {(results.topResult.item as any).title}
                      </Link>
                      <Link
                        to="/artists/$idOrSlug"
                        params={{
                          idOrSlug: (results.topResult.item as any).artistSlug,
                        }}
                        className="font-sans text-xs text-ink-soft hover:text-blue transition-colors truncate block mt-0.5"
                      >
                        {(results.topResult.item as any).artistName}
                      </Link>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          handleToggleAlbumLike(
                            (results.topResult!.item as any).id,
                          )
                        }
                        className="w-9 h-9 rounded-full border border-line bg-panel hover:border-ink flex items-center justify-center text-ink-soft hover:text-red-500 transition-colors cursor-pointer"
                        title="Like Album"
                      >
                        <HeartIconSVG
                          className="w-4 h-4"
                          filled={isAlbumLiked(
                            (results.topResult.item as any).id,
                          )}
                        />
                      </button>

                      <Link
                        to="/albums/$idOrSlug"
                        params={{
                          idOrSlug: (results.topResult.item as any).slug,
                        }}
                        className="font-mono text-[10px] uppercase tracking-wider px-3.5 py-2 rounded-full border border-line bg-panel hover:bg-canvas text-ink transition-colors font-medium shadow-2xs"
                      >
                        View &rarr;
                      </Link>
                    </div>
                  </div>
                )}

                {/* Playlist Top Result */}
                {results.topResult.type === 'playlist' && (
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <Link
                      to="/playlists/$id"
                      params={{ id: (results.topResult.item as any).id }}
                      className="w-16 h-16 sm:w-20 sm:h-20 rounded-md bg-canvas-deep border border-line shrink-0 overflow-hidden shadow-xs flex items-center justify-center"
                    >
                      {(results.topResult.item as any).coverImageUrl ? (
                        <img
                          src={(results.topResult.item as any).coverImageUrl}
                          alt={(results.topResult.item as any).title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <span className="font-serif italic text-2xl text-ink-soft">
                          ♫
                        </span>
                      )}
                    </Link>

                    <div className="min-w-0 flex-1">
                      <span className="font-mono text-[9px] uppercase tracking-wider text-amber-600 dark:text-amber-400 font-semibold mb-0.5 block">
                        Playlist
                      </span>
                      <Link
                        to="/playlists/$id"
                        params={{ id: (results.topResult.item as any).id }}
                        className="font-serif italic text-xl sm:text-2xl font-semibold text-ink hover:text-blue transition-colors truncate block"
                      >
                        {(results.topResult.item as any).title}
                      </Link>
                      <p className="font-mono text-xs text-ink-soft mt-0.5">
                        By {(results.topResult.item as any).ownerName} &bull;{' '}
                        {(results.topResult.item as any).tracksCount} tracks
                      </p>
                    </div>

                    <Link
                      to="/playlists/$id"
                      params={{ id: (results.topResult.item as any).id }}
                      className="font-mono text-[10px] uppercase tracking-wider px-3.5 py-2 rounded-full border border-line bg-panel hover:bg-canvas text-ink transition-colors shrink-0 font-medium shadow-2xs"
                    >
                      Open &rarr;
                    </Link>
                  </div>
                )}

                {/* User Top Result */}
                {results.topResult.type === 'user' && (
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <Link
                      to="/users/$id"
                      params={{ id: (results.topResult.item as any).id }}
                      className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-canvas-deep border border-line shrink-0 overflow-hidden flex items-center justify-center font-serif italic text-2xl text-ink shadow-xs"
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
                      <span className="font-mono text-[9px] uppercase tracking-wider text-ink-soft font-semibold mb-0.5 block">
                        {(results.topResult.item as any).role}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Link
                          to="/users/$id"
                          params={{ id: (results.topResult.item as any).id }}
                          className="font-serif italic text-xl sm:text-2xl font-semibold text-ink hover:text-blue transition-colors truncate block"
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
                      className="font-mono text-[10px] uppercase tracking-wider px-3.5 py-2 rounded-full border border-line bg-panel hover:bg-canvas text-ink transition-colors shrink-0 font-medium shadow-2xs"
                    >
                      Profile &rarr;
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 2. TRACKS / SONGS SECTION (Artist Page List Style) */}
          {results.songs.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-baseline justify-between border-b border-line pb-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-serif italic font-semibold text-lg sm:text-xl text-ink">
                    Tracks
                  </h3>
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-soft">
                    ({results.songs.length})
                  </span>
                </div>
                {activeCategory === 'all' && results.songs.length >= 6 && (
                  <button
                    type="button"
                    onClick={() => setActiveCategory('songs')}
                    className="font-mono text-[10px] uppercase tracking-[0.14em] text-blue hover:text-ink transition-colors cursor-pointer"
                  >
                    View all &rarr;
                  </button>
                )}
              </div>

              <div className="border border-line rounded-md overflow-hidden bg-panel divide-y divide-line/60 shadow-2xs">
                {results.songs.map((song, idx) => (
                  <SongRow
                    key={song.id}
                    track={toPlayerTrackFromSearch(song)}
                    index={idx}
                    variant="search"
                    albumTitleOverride={song.albumTitle}
                    albumSlugOverride={song.slug || song.albumId}
                    isPersonal={song.isPersonal}
                    onPlay={() => handlePlaySong(song, results.songs, idx)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 3. ARTISTS SECTION (MediaTile Grid Style) */}
          {results.artists.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-baseline justify-between border-b border-line pb-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-serif italic font-semibold text-lg sm:text-xl text-ink">
                    Artists
                  </h3>
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-soft">
                    ({results.artists.length})
                  </span>
                </div>
                {activeCategory === 'all' && results.artists.length >= 6 && (
                  <button
                    type="button"
                    onClick={() => setActiveCategory('artists')}
                    className="font-mono text-[10px] uppercase tracking-[0.14em] text-blue hover:text-ink transition-colors cursor-pointer"
                  >
                    View all &rarr;
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">
                {results.artists.map((artist) => (
                  <MediaTile
                    key={artist.id}
                    to="/artists/$idOrSlug"
                    params={{ idOrSlug: artist.slug }}
                    title={artist.stageName}
                    subtitle={`${artist.monthlyListeners ? artist.monthlyListeners.toLocaleString() : 0} listeners`}
                    imageUrl={artist.avatarUrl}
                    artistName={artist.stageName}
                    isRoundImage={true}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 4. ALBUMS / RELEASES SECTION (MediaTile Grid Style) */}
          {results.albums.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-baseline justify-between border-b border-line pb-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-serif italic font-semibold text-lg sm:text-xl text-ink">
                    Releases
                  </h3>
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-soft">
                    ({results.albums.length})
                  </span>
                </div>
                {activeCategory === 'all' && results.albums.length >= 6 && (
                  <button
                    type="button"
                    onClick={() => setActiveCategory('albums')}
                    className="font-mono text-[10px] uppercase tracking-[0.14em] text-blue hover:text-ink transition-colors cursor-pointer"
                  >
                    View all &rarr;
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">
                {results.albums.map((album) => (
                  <MediaTile
                    key={album.id}
                    to="/albums/$idOrSlug"
                    params={{ idOrSlug: album.slug }}
                    title={album.title}
                    subtitle={
                      album.artistName
                        ? `${album.artistName}${album.releaseDate ? ` · ${new Date(album.releaseDate).getFullYear()}` : ''}`
                        : album.releaseDate
                          ? `${new Date(album.releaseDate).getFullYear()}`
                          : 'Release'
                    }
                    imageUrl={album.coverImageUrl}
                    artistName={album.artistName}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 5. PLAYLISTS SECTION (MediaTile Grid Style) */}
          {results.playlists.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-baseline justify-between border-b border-line pb-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-serif italic font-semibold text-lg sm:text-xl text-ink">
                    Playlists
                  </h3>
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-soft">
                    ({results.playlists.length})
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {activeCategory === 'all' && results.playlists.length >= 6 && (
                    <button
                      type="button"
                      onClick={() => setActiveCategory('playlists')}
                      className="font-mono text-[10px] uppercase tracking-[0.14em] text-blue hover:text-ink transition-colors cursor-pointer"
                    >
                      Filter tracks &rarr;
                    </button>
                  )}
                  <Link
                    to="/playlists"
                    search={{ search: query.trim() || undefined }}
                    className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft hover:text-blue transition-colors cursor-pointer"
                  >
                    Browse all &rarr;
                  </Link>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">
                {results.playlists.map((playlist) => {
                  const mosaicCovers =
                    (playlist as any).mosaicCoverUrls || (playlist as any).mosaicCovers
                  return (
                    <MediaTile
                      key={playlist.id}
                      to="/playlists/$id"
                      params={{ id: playlist.id }}
                      title={playlist.title}
                      subtitle={`${playlist.ownerName} · ${playlist.tracksCount} tracks`}
                      imageUrl={playlist.coverImageUrl}
                      customCover={
                        <PlaylistCover
                          coverImageUrl={playlist.coverImageUrl}
                          mosaicCovers={mosaicCovers}
                          title={playlist.title}
                          className="w-full h-full"
                        />
                      }
                      fallbackInitials="♫"
                    />
                  )
                })}
              </div>
            </div>
          )}

          {/* 6. COMMUNITY / USERS SECTION (MediaTile Grid Style) */}
          {results.users.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-baseline justify-between border-b border-line pb-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-serif italic font-semibold text-lg sm:text-xl text-ink">
                    Community
                  </h3>
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-soft">
                    ({results.users.length})
                  </span>
                </div>
                {activeCategory === 'all' && results.users.length >= 6 && (
                  <button
                    type="button"
                    onClick={() => setActiveCategory('users')}
                    className="font-mono text-[10px] uppercase tracking-[0.14em] text-blue hover:text-ink transition-colors cursor-pointer"
                  >
                    View all &rarr;
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">
                {results.users.map((user) => (
                  <MediaTile
                    key={user.id}
                    to="/users/$id"
                    params={{ id: user.id }}
                    title={user.displayName}
                    subtitle={user.role}
                    imageUrl={user.avatarUrl}
                    fallbackInitials={user.displayName.slice(0, 2).toUpperCase()}
                    isRoundImage={true}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
