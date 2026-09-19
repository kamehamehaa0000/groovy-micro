import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { artistsApi } from '../lib/artists.api'
import type { ArtistProfile } from '../types/artist'
import { VerifiedBadgeSVG } from '../components/icons'
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
  const [isLoading, setIsLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)

  useEffect(() => {
    let isMounted = true
    const timer = setTimeout(async () => {
      setIsLoading(true)
      try {
        const res = await artistsApi.searchArtists({
          search: search.trim() || undefined,
          limit: 24,
        })
        if (isMounted) {
          setArtists(res.data)
          setTotalCount(res.pagination.total)
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
  }, [search, hydrateArtists])

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 w-full">
      {/* Maison Hero Header */}
      <div className="border-b border-line pb-8 mb-10">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-blue block mb-2">
              Groovy Artists Index
            </span>
            <h1 className="font-serif italic text-3xl sm:text-4xl text-ink tracking-tight">
              The Roster
            </h1>
            <p className="font-sans text-xs text-ink-soft max-w-lg mt-2 leading-relaxed">
              Discover verified recording artists, composers, and independent
              creators shaping the Groovy acoustics.
            </p>
          </div>

          {/* Upgrade CTA for listeners */}
          {user?.role === 'LISTENER' && (
            <Link
              to="/studio"
              className="inline-flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.14em] py-2.5 px-4 bg-ink text-canvas hover:opacity-90 transition-opacity shrink-0"
            >
              <span>✦ Become an Artist</span>
            </Link>
          )}
        </div>

        {/* Search Input Filter */}
        <div className="mt-8 flex items-center max-w-md">
          <div className="relative w-full">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by artist name or vanity handle..."
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
          <span className="font-mono text-[10px] uppercase tracking-widest text-ink-soft ml-4 shrink-0">
            {totalCount} {totalCount === 1 ? 'Artist' : 'Artists'}
          </span>
        </div>
      </div>

      {/* Grid of Artists */}
      {isLoading ? (
        <div className="py-24 text-center font-mono text-xs uppercase tracking-[0.16em] text-ink-soft animate-pulse">
          Fetching curated roster...
        </div>
      ) : artists.length === 0 ? (
        <div className="py-20 text-center border border-dashed border-line p-10 bg-panel/40">
          <p className="font-serif italic text-lg text-ink">No artists found</p>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft mt-1">
            {search
              ? 'Try adjusting your search query'
              : 'Be the first to join the roster'}
          </p>
          {user?.role === 'LISTENER' && (
            <Link
              to="/studio"
              className="inline-block mt-4 font-mono text-xs uppercase tracking-[0.12em] text-blue hover:underline"
            >
              Launch Your Artist Studio &rarr;
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {artists.map((artist) => (
            <Link
              key={artist.id}
              to="/artists/$idOrSlug"
              params={{ idOrSlug: artist.slug }}
              className="group block border border-line bg-panel hover:border-ink transition-all duration-200 overflow-hidden text-inherit no-underline shadow-2xs hover:shadow-sm"
            >
              {/* Card Banner Preview */}
              <div className="h-28 w-full bg-canvas-deep relative overflow-hidden border-b border-line-soft">
                {artist.bannerUrl ? (
                  <img
                    src={artist.bannerUrl}
                    alt={artist.stageName}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-ink-soft/30 font-serif italic text-3xl select-none">
                    {artist.stageName.charAt(0)}
                  </div>
                )}
                <div className="absolute inset-0 bg-linear-to-t from-panel/70 to-transparent pointer-events-none" />
              </div>

              {/* Card Meta Content */}
              <div className="p-5">
                <div className="flex items-center justify-between gap-1.5 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-serif italic text-lg text-ink group-hover:text-blue transition-colors">
                      {artist.stageName}
                    </h3>
                    {artist.verified && (
                      <VerifiedBadgeSVG className="w-4 h-4 text-blue shrink-0 inline-block" />
                    )}
                  </div>
                  {followedArtistIds.has(artist.id) && (
                    <span className="font-mono text-[8.5px] uppercase tracking-widest px-1.5 py-0.5 border border-blue/40 bg-blue/10 text-blue font-semibold">
                      ✓ Following
                    </span>
                  )}
                </div>

                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft mt-0.5">
                  @{artist.slug}
                </div>

                {artist.bio ? (
                  <p className="font-sans text-xs text-ink-soft mt-3 line-clamp-2 leading-relaxed">
                    {artist.bio}
                  </p>
                ) : (
                  <p className="font-sans text-xs italic text-ink-soft/60 mt-3">
                    Recording artist on Groovy.
                  </p>
                )}

                <div className="mt-4 pt-3 border-t border-line-soft flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.12em] text-ink-soft">
                  <span>
                    {artist.monthlyListeners.toLocaleString()} monthly listeners
                  </span>
                  <span className="text-blue group-hover:translate-x-0.5 transition-transform">
                    Explore &rarr;
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
