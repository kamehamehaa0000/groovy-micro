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
              className="inline-flex items-center gap-2 py-1 px-2.5 border border-line bg-canvas font-mono text-[10.5px] shadow-2xs"
            >
              <span className="font-serif italic font-medium text-ink flex items-center gap-1">
                {c.stageName}
                {c.verified && (
                  <VerifiedBadgeSVG className="w-3 h-3 text-blue shrink-0" />
                )}
              </span>

              <span className="text-ink-soft text-[9px]">@{c.slug}</span>

              {/* Role Select Dropdown */}
              <select
                value={c.role}
                onChange={(e) =>
                  handleRoleChange(c.artistId, e.target.value as CreditRole)
                }
                className="bg-panel border border-line-soft text-ink font-mono text-[9px] uppercase tracking-wider py-0.5 px-1.5 focus:outline-none"
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
                className="text-ink-soft hover:text-red-500 cursor-pointer p-0.5 ml-0.5"
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
          className="font-mono text-[9.5px] uppercase tracking-[0.12em] py-1 px-2.5 border border-dashed border-line text-ink-soft hover:text-ink hover:border-ink cursor-pointer inline-flex items-center gap-1"
        >
          <span>+ Add Collaborator / Credit</span>
        </button>
      ) : (
        <div className="relative max-w-md">
          <div className="flex items-center gap-1.5 border border-line bg-canvas px-2.5 py-1.5 shadow-2xs">
            <span className="font-mono text-[10px] text-ink-soft">Search:</span>
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search stage name or @handle..."
              className="flex-1 font-sans text-xs bg-transparent text-ink focus:outline-none"
            />
            {isSearching ? (
              <span className="font-mono text-[9px] text-ink-soft animate-pulse">
                ...
              </span>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false)
                  setQuery('')
                }}
                className="font-mono text-[10px] text-ink-soft hover:text-ink cursor-pointer px-1"
              >
                ✕
              </button>
            )}
          </div>

          {/* Autocomplete Results Panel */}
          {query.trim().length >= 2 && (
            <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-panel border border-line shadow-md divide-y divide-line/40 max-h-56 overflow-y-auto">
              {results.length > 0 ? (
                results.map((artist) => (
                  <button
                    key={artist.id}
                    type="button"
                    onClick={() => handleSelectArtist(artist)}
                    className="w-full text-left px-3 py-2 hover:bg-canvas-deep flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-canvas border border-line flex items-center justify-center font-serif italic text-xs shrink-0 overflow-hidden">
                        {artist.bannerUrl ? (
                          <img
                            src={artist.bannerUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          artist.stageName.charAt(0).toUpperCase()
                        )}
                      </div>

                      <div className="truncate">
                        <div className="font-serif italic text-xs text-ink flex items-center gap-1">
                          <span className="truncate">{artist.stageName}</span>
                          {artist.verified && (
                            <VerifiedBadgeSVG className="w-3 h-3 text-blue shrink-0" />
                          )}
                        </div>
                        <span className="font-mono text-[9px] text-ink-soft">
                          @{artist.slug}
                        </span>
                      </div>
                    </div>

                    <span className="font-mono text-[9px] uppercase tracking-wider text-blue shrink-0 pl-2">
                      + Credit
                    </span>
                  </button>
                ))
              ) : hasSearched && !isSearching ? (
                <div className="p-3 text-left">
                  <div className="font-mono text-[10px] text-ink flex items-center gap-1">
                    <span>Artist not found on Groovy</span>
                  </div>
                  <p className="font-sans text-[10.5px] text-ink-soft mt-1 leading-relaxed">
                    No registered artist matches "
                    <span className="font-mono text-ink">{query}</span>". To
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
