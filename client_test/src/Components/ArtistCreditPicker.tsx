import { useState, useEffect, useRef } from 'react'
import { artistsApi } from '../lib/artists.api'
import type { ArtistProfile } from '../types/artist'
import type { CreditRole } from '../types/catalog'
import { VerifiedBadgeSVG } from './icons'

export interface SelectedCredit {
  artistId: string
  stageName: string
  slug: string
  verified?: boolean
  role: CreditRole
}

interface ArtistCreditPickerProps {
  credits: SelectedCredit[]
  onChange: (credits: SelectedCredit[]) => void
  currentArtistId?: string
}

export function ArtistCreditPicker({
  credits,
  onChange,
  currentArtistId,
}: ArtistCreditPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ArtistProfile[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Live debounced search against GET /api/v1/artists?search=...
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)

    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setResults([])
      setIsSearching(false)
      setHasSearched(false)
      return
    }

    setIsSearching(true)
    searchTimeoutRef.current = setTimeout(() => {
      artistsApi
        .searchArtists({ search: trimmed, limit: 6 })
        .then((res) => {
          // Filter out already credited artists and self
          const existingIds = new Set(credits.map((c) => c.artistId))
          if (currentArtistId) existingIds.add(currentArtistId)

          setResults(res.data.filter((a) => !existingIds.has(a.id)))
          setHasSearched(true)
        })
        .catch((err) => {
          console.warn('Artist search error:', err)
          setResults([])
          setHasSearched(true)
        })
        .finally(() => {
          setIsSearching(false)
        })
    }, 250)

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    }
  }, [query, credits, currentArtistId])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelectArtist = (artist: ArtistProfile) => {
    const newCredit: SelectedCredit = {
      artistId: artist.id,
      stageName: artist.stageName,
      slug: artist.slug,
      verified: artist.verified,
      role: 'FEATURED',
    }
    onChange([...credits, newCredit])
    setQuery('')
    setResults([])
    setHasSearched(false)
    setIsOpen(false)
  }

  const handleRoleChange = (artistId: string, role: CreditRole) => {
    onChange(
      credits.map((c) => (c.artistId === artistId ? { ...c, role } : c)),
    )
  }

  const handleRemoveCredit = (artistId: string) => {
    onChange(credits.filter((c) => c.artistId !== artistId))
  }

  return (
    <div className="space-y-2.5" ref={containerRef}>
      {/* Attached Credits Pills */}
      {credits.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {credits.map((c) => (
            <div
              key={c.artistId}
              className="inline-flex items-center gap-2 py-1 px-2.5 border border-border bg-background font-mono text-[11px] shadow-2xs"
            >
              <span className="font-serif italic font-medium text-foreground flex items-center gap-1">
                {c.stageName}
                {c.verified && (
                  <VerifiedBadgeSVG className="w-3 h-3 text-primary shrink-0" />
                )}
              </span>

              <span className="text-muted-foreground text-[11px]">@{c.slug}</span>

              {/* Role Select Dropdown */}
              <select
                value={c.role}
                onChange={(e) =>
                  handleRoleChange(c.artistId, e.target.value as CreditRole)
                }
                className="bg-card border border-border-soft text-foreground font-eyebrow text-[11px] uppercase tracking-wider py-0.5 px-1.5 focus:outline-none"
              >
                <option value="FEATURED">Featured</option>
                <option value="PRODUCER">Producer</option>
                <option value="COMPOSER">Composer</option>
                <option value="LYRICIST">Lyricist</option>
                <option value="ENGINEER">Audio Engineer</option>
                <option value="MIX_AND_MASTER">Mix & Master</option>
                <option value="OTHER">Others</option>
              </select>

              <button
                type="button"
                onClick={() => handleRemoveCredit(c.artistId)}
                className="text-muted-foreground hover:text-red-500 cursor-pointer p-0.5 ml-0.5"
                title="Remove credit"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add Collaborator Trigger & Dropdown Search */}
      {!isOpen ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="font-eyebrow text-[11px] uppercase tracking-wider py-1 px-2.5 border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground cursor-pointer inline-flex items-center gap-1"
        >
          <span>+ Add Collaborator / Credit</span>
        </button>
      ) : (
        <div className="relative max-w-md">
          <div className="flex items-center gap-1.5 border border-border bg-background px-2.5 py-1.5 shadow-2xs">
            <span className="font-mono text-[11px] text-muted-foreground">Search:</span>
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search stage name or @handle..."
              className="flex-1 font-sans text-xs bg-transparent text-foreground focus:outline-none"
            />
            {isSearching ? (
              <span className="font-mono text-[11px] text-muted-foreground animate-pulse">
                ...
              </span>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false)
                  setQuery('')
                }}
                className="font-mono text-[11px] text-muted-foreground hover:text-foreground cursor-pointer px-1"
              >
                ✕
              </button>
            )}
          </div>

          {/* Autocomplete Results Panel */}
          {query.trim().length >= 2 && (
            <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-card border border-border shadow-md divide-y divide-border/40 max-h-56 overflow-y-auto">
              {results.length > 0 ? (
                results.map((artist) => (
                  <button
                    key={artist.id}
                    type="button"
                    onClick={() => handleSelectArtist(artist)}
                    className="w-full text-left px-3 py-2 hover:bg-muted flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-background border border-border flex items-center justify-center font-serif italic text-xs shrink-0 overflow-hidden">
                        {artist.avatarUrl || artist.bannerUrl ? (
                          <img
                            src={(artist.avatarUrl || artist.bannerUrl)!}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          artist.stageName.charAt(0).toUpperCase()
                        )}
                      </div>

                      <div className="truncate">
                        <div className="font-serif italic text-xs text-foreground flex items-center gap-1">
                          <span className="truncate">{artist.stageName}</span>
                          {artist.verified && (
                            <VerifiedBadgeSVG className="w-3 h-3 text-primary shrink-0" />
                          )}
                        </div>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          @{artist.slug}
                        </span>
                      </div>
                    </div>

                    <span className="font-eyebrow text-[11px] uppercase tracking-wider text-primary shrink-0 pl-2">
                      + Credit
                    </span>
                  </button>
                ))
              ) : hasSearched && !isSearching ? (
                <div className="p-3 text-left">
                  <div className="font-mono text-[11px] text-foreground flex items-center gap-1">
                    <span>Artist not found on Groovy</span>
                  </div>
                  <p className="font-sans text-xs text-muted-foreground mt-1 leading-relaxed">
                    No registered artist matches "
                    <span className="font-mono text-foreground">{query}</span>". To
                    receive discography credits, collaborators must have an
                    active Groovy profile.
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
