import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { artistsApi } from '../lib/artists.api'
import type { ArtistProfile } from '../types/artist'
import { VerifiedBadgeSVG, SearchIconSVG } from '../components/icons'
import { useAuthStore } from '../stores/auth.store'
import { useFollowsStore } from '../stores/follows.store'

export const Route = createFileRoute('/artists/')({
  component: ArtistsDirectoryComponent,
})

function ArtistsDirectoryComponent() {
  const { user } = useAuthStore()
  const followedArtistIds = useFollowsStore((s) => s.followedArtistIds)
  const hydrateArtists = useFollowsStore((s) => s.hydrateArtists)

  const [artists, setArtists] = useState<ArtistProfile[]>([])
  const [search, setSearch] = useState('')
  const [scope, setScope] = useState<'GLOBAL' | 'PERSONAL' | 'ALL'>('GLOBAL')
  const [sort, setSort] = useState<
    'listeners' | 'followers' | 'name' | 'recent'
  >('listeners')
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  useEffect(() => {
    let isMounted = true
    const timer = setTimeout(async () => {
      setIsLoading(true)
      try {
        const res = await artistsApi.searchArtists({
          search: search.trim() || undefined,
          scope,
          sort,
          page,
          limit: 24,
        })
        if (isMounted) {
          setArtists(res.data)
          setTotalCount(res.pagination.total)
          setTotalPages(res.pagination.totalPages)
          hydrateArtists(res.data)
        }
      } catch (err) {
        console.error('Failed to load artists roster:', err)
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }, 250)

    return () => {
      isMounted = false
      clearTimeout(timer)
    }
  }, [search, scope, sort, page, user?.id, hydrateArtists])

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 w-full ">
      {/* Maison Hero Header */}
      <div className="border-b border-border pb-8 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div>
            <span className="font-eyebrow text-[11px] uppercase tracking-widest text-primary block mb-2">
              Groovy Artists Index
            </span>
            <h1 className="font-serif italic text-3xl sm:text-4xl text-foreground tracking-tight">
              The Roster
            </h1>
            <p className="font-sans text-xs text-muted-foreground max-w-lg mt-2 leading-relaxed">
              Discover verified recording artists, composers, and personal
              collection creators shaping the Groovy acoustics.
            </p>
          </div>

          {/* Upgrade CTA for listeners */}
          {user?.role === 'LISTENER' && !user?.artistProfile && (
            <Link
              to="/studio"
              className="inline-flex items-center gap-2 font-eyebrow text-[11px] uppercase tracking-wider py-2.5 px-4 bg-foreground text-background hover:opacity-90 transition-opacity shrink-0"
            >
              <span>✦ Become an Artist</span>
            </Link>
          )}
        </div>

        {/* Scope Filter Tabs */}
        <div className="mt-8 flex flex-wrap items-center gap-2 border-b border-border pb-4">
          <button
            type="button"
            onClick={() => {
              setScope('GLOBAL')
              setPage(1)
            }}
            className={`font-eyebrow text-[11px] rounded-md uppercase tracking-wider px-3.5 py-1.5 transition-all cursor-pointer ${
              scope === 'GLOBAL'
                ? 'bg-foreground text-background font-semibold shadow-xs'
                : 'bg-card text-muted-foreground hover:text-foreground border border-border'
            }`}
          >
            Groovy Artists
          </button>
          <button
            type="button"
            onClick={() => {
              setScope('PERSONAL')
              setPage(1)
            }}
            className={`font-eyebrow text-[11px] rounded-md uppercase tracking-wider px-3.5 py-1.5 transition-all cursor-pointer ${
              scope === 'PERSONAL'
                ? 'bg-foreground text-background font-semibold shadow-xs'
                : 'bg-card text-muted-foreground hover:text-foreground border border-border'
            }`}
          >
            Personal Collection
          </button>
          <button
            type="button"
            onClick={() => {
              setScope('ALL')
              setPage(1)
            }}
            className={`font-eyebrow text-[11px] rounded-md uppercase tracking-wider px-3.5 py-1.5 transition-all cursor-pointer ${
              scope === 'ALL'
                ? 'bg-foreground text-background font-semibold shadow-xs'
                : 'bg-card text-muted-foreground hover:text-foreground border border-border'
            }`}
          >
            All Artists
          </button>
        </div>

        {/* Search & Sort Controls Row */}
        <div className="mt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative w-full sm:max-w-md">
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder="Search by artist name or vanity handle..."
              className="w-full font-mono text-xs py-2.5 pl-9 pr-9 border border-border bg-card rounded-xl text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-foreground/70 transition-all shadow-2xs"
            />
            <SearchIconSVG className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch('')
                  setPage(1)
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer text-xs p-1"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <label
                htmlFor="artist-sort"
                className="font-eyebrow text-[11px] uppercase tracking-wider text-muted-foreground shrink-0"
              >
                Sort:
              </label>
              <select
                id="artist-sort"
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value as any)
                  setPage(1)
                }}
                className="font-mono rounded-xl text-xs py-2 px-3 border border-border bg-card text-foreground focus:outline-none focus:border-foreground transition-colors cursor-pointer"
              >
                <option value="listeners">Monthly Listeners</option>
                <option value="followers">Followers</option>
                <option value="name">Alphabetical (A-Z)</option>
                <option value="recent">Recently Added</option>
              </select>
            </div>

            <span className="font-eyebrow text-[11px] uppercase tracking-widest text-muted-foreground ml-2 shrink-0 border-l border-border pl-3">
              {totalCount} {totalCount === 1 ? 'Artist' : 'Artists'}
            </span>
          </div>
        </div>
      </div>

      {/* Grid of Artists */}
      {isLoading ? (
        <div className="py-24 text-center font-eyebrow text-xs uppercase tracking-wider text-muted-foreground animate-pulse">
          Fetching curated roster...
        </div>
      ) : artists.length === 0 ? (
        <div className="py-20 text-center border border-dashed border-border p-10 bg-card/40">
          <p className="font-serif italic text-lg text-foreground">No artists found</p>
          <p className="font-eyebrow text-[11px] uppercase tracking-widest text-muted-foreground mt-1">
            {search
              ? 'Try adjusting your search query'
              : scope === 'PERSONAL' && !user
                ? 'Sign in to access your personal collection artists'
                : scope === 'PERSONAL'
                  ? 'No personal artists yet. Import music to build your personal roster'
                  : 'Be the first to join the roster'}
          </p>
          {scope === 'PERSONAL' && user ? (
            <Link
              to="/vault"
              className="inline-block mt-4 font-eyebrow text-xs uppercase tracking-wider text-primary hover:underline"
            >
              Go to Personal Collection &rarr;
            </Link>
          ) : (
            user?.role === 'LISTENER' && (
              <Link
                to="/studio"
                className="inline-block mt-4 font-eyebrow text-xs uppercase tracking-wider text-primary hover:underline"
              >
                Launch Your Artist Studio &rarr;
              </Link>
            )
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {artists.map((artist) => (
              <Link
                key={artist.id}
                to="/artists/$idOrSlug"
                params={{ idOrSlug: artist.slug }}
                className="group block rounded-md overflow-clip border border-border bg-card hover:border-foreground transition-all duration-200  text-inherit no-underline shadow-2xs hover:shadow-sm"
              >
                {/* Card Banner Preview */}
                <div className="h-28 w-full bg-muted relative overflow-hidden border-b border-border-soft">
                  {artist.bannerUrl ? (
                    <img
                      src={artist.bannerUrl}
                      alt={artist.stageName}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground/30 font-serif italic text-3xl select-none">
                      {artist.stageName.charAt(0)}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-linear-to-t from-card/70 to-transparent pointer-events-none" />
                </div>

                {/* Card Meta Content */}
                <div className="p-5">
                  <div className="flex items-center justify-between gap-1.5 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-sans font-semibold text-base sm:text-lg text-foreground group-hover:text-primary transition-colors">
                        {artist.stageName}
                      </h3>
                      {artist.verified && (
                        <VerifiedBadgeSVG className="w-4 h-4 text-primary shrink-0 inline-block" />
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {artist.scope === 'PERSONAL' && (
                        <span className="font-eyebrow text-[11px] uppercase tracking-wider px-1.5 py-0.5 border border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold">
                          Personal
                        </span>
                      )}
                      {followedArtistIds.has(artist.id) && (
                        <span className="font-eyebrow text-[11px] uppercase tracking-wider px-1.5 py-0.5 border border-primary/40 bg-primary/10 text-primary font-semibold">
                          ✓ Following
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="font-eyebrow text-[11px] uppercase tracking-wider text-muted-foreground mt-0.5">
                    @{artist.slug}
                  </div>

                  {artist.bio ? (
                    <p className="font-sans text-xs text-muted-foreground mt-3 line-clamp-2 leading-relaxed">
                      {artist.bio}
                    </p>
                  ) : (
                    <p className="font-sans text-xs italic text-muted-foreground/60 mt-3">
                      {artist.scope === 'PERSONAL'
                        ? 'Personal collection artist.'
                        : 'Recording artist on Groovy.'}
                    </p>
                  )}

                  <div className="mt-4 pt-3 border-t border-border-soft flex items-center justify-between font-eyebrow text-[11px] uppercase tracking-wider text-muted-foreground">
                    <span>
                      {artist.scope === 'PERSONAL'
                        ? 'Personal Artist'
                        : `${artist.monthlyListeners.toLocaleString()} monthly listeners`}
                    </span>
                    <span className="text-primary group-hover:translate-x-0.5 transition-transform">
                      Explore &rarr;
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="mt-10 pt-6 border-t border-border flex items-center justify-between">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="font-eyebrow text-xs uppercase tracking-wider py-2 px-4 border border-border bg-card text-foreground hover:border-foreground transition-colors disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
              >
                &larr; Previous
              </button>
              <span className="font-mono text-xs text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="font-eyebrow text-xs uppercase tracking-wider py-2 px-4 border border-border bg-card text-foreground hover:border-foreground transition-colors disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
              >
                Next &rarr;
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
