import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { artistsApi } from '../lib/artists.api'
import type { ArtistProfile } from '../types/artist'
import {
  VerifiedBadgeSVG,
  ExternalLinkSVG,
  SvgArtworkSpiral,
} from '../Components/icons'
import { useAuthStore } from '../stores/auth.store'

export const Route = createFileRoute('/artists/$idOrSlug')({
  component: ArtistPublicProfileComponent,
})

function ArtistPublicProfileComponent() {
  const { idOrSlug } = Route.useParams()
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuthStore()

  const [artist, setArtist] = useState<ArtistProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Follow state
  const [isFollowing, setIsFollowing] = useState(false)
  const [followersCount, setFollowersCount] = useState(0)
  const [isFollowLoading, setIsFollowLoading] = useState(false)

  // Copy link feedback
  const [copiedLink, setCopiedLink] = useState(false)

  useEffect(() => {
    let isMounted = true
    setIsLoading(true)
    setErrorMsg(null)

    artistsApi
      .getByIdOrSlug(idOrSlug)
      .then((data) => {
        if (!isMounted) return
        setArtist(data)
        setIsFollowing(!!data.isFollowing)
        setFollowersCount(data.followersCount ?? 0)
      })
      .catch((err) => {
        if (!isMounted) return
        setErrorMsg(err.message || 'Failed to load artist profile')
      })
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [idOrSlug])

  const handleToggleFollow = async () => {
    if (!isAuthenticated) {
      navigate({ to: '/login' })
      return
    }
    if (!artist || isFollowLoading) return

    setIsFollowLoading(true)
    const prevFollowing = isFollowing
    const prevCount = followersCount

    // Optimistic update
    setIsFollowing(!prevFollowing)
    setFollowersCount(
      prevFollowing ? Math.max(0, prevCount - 1) : prevCount + 1,
    )

    try {
      if (prevFollowing) {
        const res = await artistsApi.unfollow(artist.id)
        setFollowersCount(res.followersCount)
        setIsFollowing(false)
      } else {
        const res = await artistsApi.follow(artist.id)
        setFollowersCount(res.followersCount)
        setIsFollowing(true)
      }
    } catch (err: any) {
      // Rollback on failure
      setIsFollowing(prevFollowing)
      setFollowersCount(prevCount)
      alert(err.message || 'Could not update follow status')
    } finally {
      setIsFollowLoading(false)
    }
  }

  const handleCopyShareLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href)
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2000)
    }
  }

  if (isLoading) {
    return (
      <div className="py-32 text-center font-mono text-xs uppercase tracking-[0.16em] text-ink-soft animate-pulse">
        Retrieving artist catalog...
      </div>
    )
  }

  if (errorMsg || !artist) {
    return (
      <div className="max-w-xl mx-auto py-24 px-6 text-center">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-blue block mb-2">
          404 Archive Notice
        </span>
        <h1 className="font-serif italic text-3xl text-ink">
          Artist Profile Not Found
        </h1>
        <p className="font-sans text-xs text-ink-soft mt-3 leading-relaxed">
          The requested artist identifier{' '}
          <span className="font-mono text-ink">"{idOrSlug}"</span> could not be
          located in the registered roster.
        </p>
        <Link
          to="/artists"
          className="inline-block mt-6 font-mono text-[10.5px] uppercase tracking-[0.14em] py-2 px-4 border border-line bg-panel hover:bg-canvas text-ink transition-colors"
        >
          &larr; Return to Roster
        </Link>
      </div>
    )
  }

  const isOwner = user?.id === artist.userId

  return (
    <div className="w-full pb-20">
      {/* ===================== HERO BANNER ===================== */}
      <div className="w-full h-64 sm:h-80 md:h-96 relative bg-canvas-deep border-b border-line overflow-hidden">
        {artist.bannerUrl ? (
          <img
            src={artist.bannerUrl}
            alt={artist.stageName}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full relative flex items-center justify-center">
            <SvgArtworkSpiral />
            <span className="font-serif italic text-5xl sm:text-7xl text-ink-soft/20 select-none">
              {artist.stageName}
            </span>
          </div>
        )}

        {/* Ambient Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/40 to-transparent" />

        {/* Top Controls Overlay */}
        <div className="absolute top-4 left-4 right-4 max-w-6xl mx-auto flex items-center justify-between pointer-events-none">
          <Link
            to="/artists"
            className="pointer-events-auto font-mono text-[10px] uppercase tracking-[0.14em] py-1.5 px-3 bg-canvas/80 backdrop-blur-xs border border-line text-ink hover:bg-canvas transition-colors shadow-2xs"
          >
            &larr; Roster
          </Link>

          <button
            type="button"
            onClick={handleCopyShareLink}
            className="pointer-events-auto font-mono text-[10px] uppercase tracking-[0.14em] py-1.5 px-3 bg-canvas/80 backdrop-blur-xs border border-line text-ink hover:bg-canvas transition-colors shadow-2xs cursor-pointer"
          >
            {copiedLink ? '✓ Copied URL' : 'Share Profile'}
          </button>
        </div>
      </div>

      {/* ===================== ARTIST IDENTITY BAR ===================== */}
      <div className="max-w-6xl mx-auto px-5 sm:px-8 -mt-16 sm:-mt-20 relative z-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-line">
          {/* Identity & Badges */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="font-serif italic text-3xl sm:text-5xl text-ink tracking-tight">
                {artist.stageName}
              </h1>
              {artist.verified && (
                <div
                  title="Verified Creator"
                  className="inline-flex items-center gap-1 py-0.5 px-2 bg-blue/10 border border-blue/20 rounded-full font-mono text-[9px] uppercase tracking-[0.14em] text-blue font-semibold"
                >
                  <VerifiedBadgeSVG className="w-3.5 h-3.5" />
                  <span>Verified</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-4 text-ink-soft font-mono text-xs">
              <span>@{artist.slug}</span>
              <span>•</span>
              <span>
                {artist.monthlyListeners.toLocaleString()} monthly listeners
              </span>
              <span>•</span>
              <span>{followersCount.toLocaleString()} followers</span>
            </div>
          </div>

          {/* Action Button */}
          <div className="flex items-center gap-3">
            {isOwner ? (
              <Link
                to="/studio"
                className="font-mono text-[10.5px] uppercase tracking-[0.14em] py-2.5 px-5 bg-ink text-canvas hover:opacity-90 transition-opacity"
              >
                ✦ Manage in Studio
              </Link>
            ) : (
              <button
                type="button"
                disabled={isFollowLoading}
                onClick={handleToggleFollow}
                className={`font-mono text-[10.5px] uppercase tracking-[0.14em] py-2.5 px-6 transition-all cursor-pointer ${
                  isFollowing
                    ? 'border border-line bg-panel hover:border-red-400 hover:text-red-500 text-ink'
                    : 'bg-ink text-canvas hover:opacity-90'
                }`}
              >
                {isFollowLoading
                  ? 'Updating...'
                  : isFollowing
                    ? 'Following'
                    : 'Follow Artist'}
              </button>
            )}
          </div>
        </div>

        {/* ===================== BIOGRAPHY & SOCIALS ===================== */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mt-10">
          {/* Left Column: Biography */}
          <div className="md:col-span-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft block mb-3">
              About the Artist
            </span>
            {artist.bio ? (
              <p className="font-sans text-sm text-ink leading-relaxed whitespace-pre-line">
                {artist.bio}
              </p>
            ) : (
              <p className="font-sans text-xs italic text-ink-soft/70">
                No formal biography has been submitted for this artist.
              </p>
            )}

            {/* Releases Placeholder */}
            <div className="mt-12 pt-8 border-t border-line-soft">
              <div className="flex items-center justify-between mb-6">
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">
                  Discography & Master Recordings
                </span>
                <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-blue">
                  Catalog Sprint 2.2
                </span>
              </div>

              <div className="p-8 border border-dashed border-line bg-panel/30 text-center">
                <p className="font-serif italic text-base text-ink">
                  Master Tracks & Albums In Preparation
                </p>
                <p className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-soft mt-1">
                  Audio streaming and lossless HLS playback will be enabled in
                  the upcoming catalog sprint.
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: Social Channels & Telemetry */}
          <div className="flex flex-col gap-6">
            {/* Social Links Pill List */}
            <div className="p-5 border border-line bg-panel">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft block mb-3">
                Official Links & Press
              </span>

              {artist.socialLinks &&
              Object.keys(artist.socialLinks).length > 0 ? (
                <div className="flex flex-col gap-2">
                  {Object.entries(artist.socialLinks).map(([platform, url]) => (
                    <a
                      key={platform}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between py-2 px-3 border border-line-soft bg-canvas hover:border-ink text-ink font-mono text-xs transition-colors group"
                    >
                      <span className="capitalize">{platform}</span>
                      <ExternalLinkSVG className="w-3.5 h-3.5 text-ink-soft group-hover:text-ink transition-colors" />
                    </a>
                  ))}
                </div>
              ) : (
                <p className="font-sans text-xs text-ink-soft italic">
                  No social profiles linked.
                </p>
              )}
            </div>

            {/* Registration Metadata */}
            <div className="p-5 border border-line-soft bg-canvas-deep/50 text-ink-soft font-mono text-[10px] flex flex-col gap-1.5">
              <div className="flex justify-between">
                <span>Member Since:</span>
                <span className="text-ink">
                  {new Date(artist.createdAt).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Verification:</span>
                <span
                  className={
                    artist.verified
                      ? 'text-blue font-semibold'
                      : 'text-ink-soft'
                  }
                >
                  {artist.verificationStatus}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
