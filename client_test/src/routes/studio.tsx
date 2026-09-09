import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '../stores/auth.store'
import { artistsApi, slugifyText } from '../lib/artists.api'
import type { ArtistProfile } from '../types/artist'
import {
  VerifiedBadgeSVG,
  ExternalLinkSVG,
  UploadCloudSVG,
} from '../Components/icons'

export const Route = createFileRoute('/studio')({
  component: StudioComponent,
})

function StudioComponent() {
  const navigate = useNavigate()
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthStore()

  const [artistProfile, setArtistProfile] = useState<ArtistProfile | null>(null)
  const [isLoadingProfile, setIsLoadingProfile] = useState(false)
  const [errorNotice, setErrorNotice] = useState<string | null>(null)
  const [successNotice, setSuccessNotice] = useState<string | null>(null)

  // Upgrade Form State (for Listeners)
  const [stageName, setStageName] = useState('')
  const [customSlug, setCustomSlug] = useState('')
  const [bio, setBio] = useState('')
  const [instagram, setInstagram] = useState('')
  const [website, setWebsite] = useState('')
  const [spotify, setSpotify] = useState('')
  const [isSubmittingUpgrade, setIsSubmittingUpgrade] = useState(false)

  // Banner Upload State
  const [isUploadingBanner, setIsUploadingBanner] = useState(false)
  const bannerInputRef = useRef<HTMLInputElement>(null)

  // Verification Application State
  const [verifyPitch, setVerifyPitch] = useState('')
  const [verifyContactEmail, setVerifyContactEmail] = useState('')
  const [verifyContactPhone, setVerifyContactPhone] = useState('')
  const [verifyLinks, setVerifyLinks] = useState<string[]>([''])
  const [isSubmittingVerify, setIsSubmittingVerify] = useState(false)
  const [showResubmitForm, setShowResubmitForm] = useState(false)

  // Profile Edit State
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [editStageName, setEditStageName] = useState('')
  const [editSlug, setEditSlug] = useState('')
  const [editBio, setEditBio] = useState('')
  const [editInstagram, setEditInstagram] = useState('')
  const [editWebsite, setEditWebsite] = useState('')
  const [editSpotify, setEditSpotify] = useState('')
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  // Authentication check
  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      navigate({ to: '/login' })
    }
  }, [isAuthLoading, isAuthenticated, navigate])

  // Fetch Artist Profile if user has ARTIST or ADMIN role
  useEffect(() => {
    if (user && (user.role === 'ARTIST' || user.role === 'ADMIN')) {
      setIsLoadingProfile(true)
      artistsApi
        .getMyProfile()
        .then((profile) => {
          setArtistProfile(profile)
          setEditStageName(profile.stageName)
          setEditSlug(profile.slug)
          setEditBio(profile.bio || '')
          setEditInstagram(profile.socialLinks?.instagram || '')
          setEditWebsite(profile.socialLinks?.website || '')
          setEditSpotify(profile.socialLinks?.spotify || '')
          setVerifyContactEmail(user.email)
        })
        .catch((err) => {
          console.warn('Could not load artist profile:', err)
        })
        .finally(() => {
          setIsLoadingProfile(false)
        })
    }
  }, [user])

  // Clear notice after 4 seconds
  useEffect(() => {
    if (successNotice || errorNotice) {
      const t = setTimeout(() => {
        setSuccessNotice(null)
        setErrorNotice(null)
      }, 5000)
      return () => clearTimeout(t)
    }
  }, [successNotice, errorNotice])

  if (isAuthLoading || (user?.role === 'ARTIST' && isLoadingProfile)) {
    return (
      <div className="py-32 text-center font-mono text-xs uppercase tracking-[0.16em] text-ink-soft animate-pulse">
        Initializing Creator Studio...
      </div>
    )
  }

  if (!user) return null

  // =========================================================================
  // STATE A: LISTENER UPGRADE EXPERIENCE
  // =========================================================================
  if (user.role === 'LISTENER' && !artistProfile) {
    const previewSlug = customSlug.trim()
      ? slugifyText(customSlug)
      : slugifyText(stageName) || 'your-stage-name'

    const handleInstantUpgrade = async (e: React.FormEvent) => {
      e.preventDefault()
      if (!stageName.trim()) {
        setErrorNotice('Please provide a stage name')
        return
      }

      setIsSubmittingUpgrade(true)
      setErrorNotice(null)

      try {
        const socialLinks: Record<string, string> = {}
        if (instagram.trim()) socialLinks.instagram = instagram.trim()
        if (website.trim()) socialLinks.website = website.trim()
        if (spotify.trim()) socialLinks.spotify = spotify.trim()

        const res = await artistsApi.createProfile({
          stageName: stageName.trim(),
          slug: customSlug.trim() ? slugifyText(customSlug) : undefined,
          bio: bio.trim() || undefined,
          socialLinks:
            Object.keys(socialLinks).length > 0 ? socialLinks : undefined,
        })

        setArtistProfile(res.profile)
        setSuccessNotice(
          '🎉 Welcome to Groovy Creator Studio! Your artist identity is live.',
        )
      } catch (err: any) {
        setErrorNotice(
          err.message || 'Instant upgrade failed. Please check your details.',
        )
      } finally {
        setIsSubmittingUpgrade(false)
      }
    }

    return (
      <div className="max-w-3xl mx-auto px-5 sm:px-8 py-12">
        <div className="border-b border-line pb-6 mb-8">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-blue block mb-2">
            Maison Creator Studio
          </span>
          <h1 className="font-serif italic text-3xl sm:text-4xl text-ink tracking-tight">
            Launch Your Artist Identity
          </h1>
          <p className="font-sans text-xs text-ink-soft mt-2 leading-relaxed">
            Upgrade instantly from a listener account to an official Groovy
            artist profile. Release master tracks, manage your presence, and
            curate your discography.
          </p>
        </div>

        {errorNotice && (
          <div className="p-4 mb-6 border border-red-300 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300 font-mono text-xs">
            {errorNotice}
          </div>
        )}

        <form onSubmit={handleInstantUpgrade} className="flex flex-col gap-6">
          <div className="p-6 border border-line bg-panel flex flex-col gap-5 shadow-2xs">
            {/* Stage Name */}
            <div>
              <label className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink block mb-2">
                Stage / Ensemble Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={stageName}
                onChange={(e) => setStageName(e.target.value)}
                placeholder="e.g. Hélène Vane, The Cinematic Trio"
                className="w-full font-serif italic text-base py-2.5 px-3 border border-line bg-canvas text-ink focus:outline-none focus:border-ink transition-colors"
              />
            </div>

            {/* Vanity Slug & Live URL Preview */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink">
                  Vanity Handle (Slug)
                </label>
                <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-soft">
                  Auto-generated if blank
                </span>
              </div>
              <input
                type="text"
                value={customSlug}
                onChange={(e) => setCustomSlug(e.target.value)}
                placeholder="e.g. helene-vane"
                className="w-full font-mono text-xs py-2.5 px-3 border border-line bg-canvas text-ink focus:outline-none focus:border-ink transition-colors"
              />
              <div className="mt-2 font-mono text-[10px] text-ink-soft flex items-center gap-1">
                <span>Public profile URL:</span>
                <span className="text-blue font-semibold">
                  groovy.app/artists/{previewSlug}
                </span>
              </div>
            </div>

            {/* Bio */}
            <div>
              <label className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink block mb-2">
                Artist Biography
              </label>
              <textarea
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Share your musical background, style, influences, or instruments..."
                className="w-full font-sans text-xs py-2.5 px-3 border border-line bg-canvas text-ink focus:outline-none focus:border-ink transition-colors resize-y leading-relaxed"
              />
            </div>

            {/* Social Links */}
            <div className="pt-4 border-t border-line-soft">
              <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-soft block mb-3">
                Official Channels (Optional)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-soft block mb-1">
                    Instagram URL
                  </label>
                  <input
                    type="url"
                    value={instagram}
                    onChange={(e) => setInstagram(e.target.value)}
                    placeholder="https://instagram.com/..."
                    className="w-full font-mono text-xs py-2 px-3 border border-line bg-canvas text-ink focus:outline-none focus:border-ink"
                  />
                </div>
                <div>
                  <label className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-soft block mb-1">
                    Website URL
                  </label>
                  <input
                    type="url"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://yourwebsite.com"
                    className="w-full font-mono text-xs py-2 px-3 border border-line bg-canvas text-ink focus:outline-none focus:border-ink"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-soft block mb-1">
                    Spotify Artist URL
                  </label>
                  <input
                    type="url"
                    value={spotify}
                    onChange={(e) => setSpotify(e.target.value)}
                    placeholder="https://open.spotify.com/artist/..."
                    className="w-full font-mono text-xs py-2 px-3 border border-line bg-canvas text-ink focus:outline-none focus:border-ink"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmittingUpgrade}
            className="w-full font-mono text-xs uppercase tracking-[0.16em] py-3.5 px-6 bg-ink text-canvas hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 font-semibold"
          >
            {isSubmittingUpgrade
              ? 'Activating Studio...'
              : '✦ Activate Artist Studio (Instant Upgrade)'}
          </button>
        </form>
      </div>
    )
  }

  // =========================================================================
  // STATE B: FULL ARTIST STUDIO DASHBOARD
  // =========================================================================
  if (!artistProfile) {
    return (
      <div className="max-w-xl mx-auto py-24 text-center">
        <p className="font-serif italic text-lg text-ink">
          No artist profile detected.
        </p>
        <p className="font-mono text-xs text-ink-soft mt-1">
          Please try refreshing the page.
        </p>
      </div>
    )
  }

  // Handle Banner Upload via Cloudflare R2
  const handleBannerSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploadingBanner(true)
    setErrorNotice(null)

    try {
      const publicUrl = await artistsApi.uploadBanner(artistProfile.id, file)
      setArtistProfile((prev) =>
        prev ? { ...prev, bannerUrl: publicUrl } : null,
      )
      setSuccessNotice('Banner image uploaded to Cloudflare R2 and synced.')
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to upload banner')
    } finally {
      setIsUploadingBanner(false)
      if (bannerInputRef.current) bannerInputRef.current.value = ''
    }
  }

  // Handle Profile Update Save
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSavingEdit(true)
    setErrorNotice(null)

    try {
      const socialLinks: Record<string, string> = {}
      if (editInstagram.trim()) socialLinks.instagram = editInstagram.trim()
      if (editWebsite.trim()) socialLinks.website = editWebsite.trim()
      if (editSpotify.trim()) socialLinks.spotify = editSpotify.trim()

      const res = await artistsApi.updateMyProfile({
        stageName: editStageName.trim() || undefined,
        slug: editSlug.trim() ? slugifyText(editSlug) : undefined,
        bio: editBio.trim() || null,
        socialLinks,
      })

      setArtistProfile(res.profile)
      setIsEditingProfile(false)
      setSuccessNotice('Artist profile details updated successfully.')
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to update profile')
    } finally {
      setIsSavingEdit(false)
    }
  }

  // Handle Verification Application Submission
  const handleSubmitVerification = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanLinks = verifyLinks.map((l) => l.trim()).filter(Boolean)

    if (cleanLinks.length === 0) {
      setErrorNotice(
        'Please provide at least one proof link (e.g. Spotify, official website)',
      )
      return
    }

    setIsSubmittingVerify(true)
    setErrorNotice(null)

    try {
      const res = await artistsApi.requestVerification({
        message: verifyPitch.trim(),
        contactEmail: verifyContactEmail.trim() || undefined,
        contactPhone: verifyContactPhone.trim() || undefined,
        links: cleanLinks,
      })

      setArtistProfile(res.profile)
      setShowResubmitForm(false)
      setSuccessNotice(
        'Verification application submitted for administrative review.',
      )
    } catch (err: any) {
      setErrorNotice(err.message || 'Verification submission failed')
    } finally {
      setIsSubmittingVerify(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 py-10 w-full">
      {/* Toast Alerts */}
      {successNotice && (
        <div className="p-4 mb-6 border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-200 font-mono text-xs shadow-2xs">
          {successNotice}
        </div>
      )}
      {errorNotice && (
        <div className="p-4 mb-6 border border-red-300 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300 font-mono text-xs shadow-2xs">
          {errorNotice}
        </div>
      )}

      {/* Studio Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-line mb-8">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-blue block mb-1">
            Maison Studio Suite
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-serif italic text-3xl text-ink">
              {artistProfile.stageName}
            </h1>
            {artistProfile.verified && (
              <VerifiedBadgeSVG className="w-5 h-5 text-blue" />
            )}
          </div>
          <span className="font-mono text-xs text-ink-soft">
            @{artistProfile.slug}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/artists/$idOrSlug"
            params={{ idOrSlug: artistProfile.slug }}
            className="font-mono text-[10.5px] uppercase tracking-[0.14em] py-2 px-4 border border-line bg-panel hover:bg-canvas text-ink transition-colors flex items-center gap-1.5"
          >
            <span>Public Profile</span>
            <ExternalLinkSVG className="w-3 h-3 text-ink-soft" />
          </Link>
        </div>
      </div>

      {/* Studio Telemetry Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        <div className="p-5 border border-line bg-panel">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-soft block">
            Monthly Listeners
          </span>
          <span className="font-serif italic text-2xl text-ink mt-1 block">
            {artistProfile.monthlyListeners.toLocaleString()}
          </span>
        </div>
        <div className="p-5 border border-line bg-panel">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-soft block">
            Total Followers
          </span>
          <span className="font-serif italic text-2xl text-ink mt-1 block">
            {(artistProfile.followersCount ?? 0).toLocaleString()}
          </span>
        </div>
        <div className="p-5 border border-line bg-panel">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-soft block">
            Verification Status
          </span>
          <div className="mt-1 flex items-center gap-2">
            <span
              className={`font-mono text-xs uppercase tracking-[0.12em] font-semibold ${
                artistProfile.verificationStatus === 'VERIFIED'
                  ? 'text-blue'
                  : artistProfile.verificationStatus === 'PENDING'
                    ? 'text-amber-600 dark:text-amber-400'
                    : artistProfile.verificationStatus === 'REJECTED'
                      ? 'text-red-500'
                      : 'text-ink-soft'
              }`}
            >
              {artistProfile.verificationStatus}
            </span>
            {artistProfile.verified && (
              <VerifiedBadgeSVG className="w-4 h-4 text-blue" />
            )}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* BANNER CUSTOMIZER (CLOUDFLARE R2) */}
      {/* ========================================================================= */}
      <div className="mb-12 p-6 border border-line bg-panel shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="font-serif italic text-xl text-ink">
              Artist Profile Banner
            </h2>
            <p className="font-sans text-xs text-ink-soft mt-0.5">
              High-resolution cover displayed across your public artist page
              (stored on Cloudflare R2).
            </p>
          </div>

          <button
            type="button"
            disabled={isUploadingBanner}
            onClick={() => bannerInputRef.current?.click()}
            className="font-mono text-[10px] uppercase tracking-[0.14em] py-2 px-4 bg-ink text-canvas hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-2 self-start sm:self-auto shrink-0"
          >
            <UploadCloudSVG className="w-4 h-4" />
            <span>
              {isUploadingBanner ? 'Uploading to R2...' : 'Upload Banner'}
            </span>
          </button>
          <input
            ref={bannerInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/avif"
            onChange={handleBannerSelect}
            className="hidden"
          />
        </div>

        {/* Banner Preview Area */}
        <div className="w-full h-44 sm:h-56 bg-canvas-deep border border-line overflow-hidden relative">
          {artistProfile.bannerUrl ? (
            <img
              src={artistProfile.bannerUrl}
              alt="Artist banner"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-ink-soft font-mono text-xs">
              <UploadCloudSVG className="w-8 h-8 opacity-40 mb-2" />
              <span>No banner uploaded yet</span>
            </div>
          )}
          {isUploadingBanner && (
            <div className="absolute inset-0 bg-canvas/80 backdrop-blur-xs flex items-center justify-center font-mono text-xs text-ink animate-pulse">
              Transferring asset to Cloudflare R2 storage...
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* IDENTITY & DETAILS EDITOR */}
      {/* ========================================================================= */}
      <div className="mb-12 p-6 border border-line bg-panel shadow-2xs">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-line-soft">
          <div>
            <h2 className="font-serif italic text-xl text-ink">
              Identity & Presentation
            </h2>
            <p className="font-sans text-xs text-ink-soft mt-0.5">
              Customize your public stage name, biography, and external links.
            </p>
          </div>

          {!isEditingProfile && (
            <button
              type="button"
              onClick={() => setIsEditingProfile(true)}
              className="font-mono text-[10px] uppercase tracking-[0.14em] py-1.5 px-3 border border-line bg-canvas hover:border-ink text-ink transition-colors cursor-pointer"
            >
              Edit Details
            </button>
          )}
        </div>

        {isEditingProfile ? (
          <form onSubmit={handleSaveProfile} className="flex flex-col gap-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block mb-1.5">
                  Stage Name
                </label>
                <input
                  type="text"
                  required
                  value={editStageName}
                  onChange={(e) => setEditStageName(e.target.value)}
                  className="w-full font-serif italic text-sm py-2 px-3 border border-line bg-canvas text-ink focus:outline-none focus:border-ink"
                />
              </div>

              <div>
                <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block mb-1.5">
                  Vanity Slug
                </label>
                <input
                  type="text"
                  required
                  value={editSlug}
                  onChange={(e) => setEditSlug(e.target.value)}
                  className="w-full font-mono text-xs py-2 px-3 border border-line bg-canvas text-ink focus:outline-none focus:border-ink"
                />
              </div>
            </div>

            <div>
              <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block mb-1.5">
                Biography
              </label>
              <textarea
                rows={4}
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                className="w-full font-sans text-xs py-2 px-3 border border-line bg-canvas text-ink focus:outline-none focus:border-ink resize-y leading-relaxed"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-soft block mb-1">
                  Instagram
                </label>
                <input
                  type="url"
                  value={editInstagram}
                  onChange={(e) => setEditInstagram(e.target.value)}
                  placeholder="https://instagram.com/..."
                  className="w-full font-mono text-xs py-1.5 px-2.5 border border-line bg-canvas text-ink"
                />
              </div>
              <div>
                <label className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-soft block mb-1">
                  Website
                </label>
                <input
                  type="url"
                  value={editWebsite}
                  onChange={(e) => setEditWebsite(e.target.value)}
                  placeholder="https://..."
                  className="w-full font-mono text-xs py-1.5 px-2.5 border border-line bg-canvas text-ink"
                />
              </div>
              <div>
                <label className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-soft block mb-1">
                  Spotify
                </label>
                <input
                  type="url"
                  value={editSpotify}
                  onChange={(e) => setEditSpotify(e.target.value)}
                  placeholder="https://open.spotify.com/..."
                  className="w-full font-mono text-xs py-1.5 px-2.5 border border-line bg-canvas text-ink"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={isSavingEdit}
                className="font-mono text-[10.5px] uppercase tracking-[0.14em] py-2 px-5 bg-ink text-canvas hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
              >
                {isSavingEdit ? 'Saving...' : 'Save Profile Changes'}
              </button>
              <button
                type="button"
                onClick={() => setIsEditingProfile(false)}
                className="font-mono text-[10.5px] uppercase tracking-[0.14em] py-2 px-4 border border-line text-ink-soft hover:text-ink cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-4 text-xs font-sans text-ink">
            <div>
              <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-soft block mb-1">
                Biography
              </span>
              <p className="leading-relaxed whitespace-pre-line text-ink-soft">
                {artistProfile.bio || 'No biography set yet.'}
              </p>
            </div>

            {artistProfile.socialLinks &&
              Object.keys(artistProfile.socialLinks).length > 0 && (
                <div>
                  <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-soft block mb-2">
                    Social Channels
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(artistProfile.socialLinks).map(([k, v]) => (
                      <a
                        key={k}
                        href={v}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-[10px] py-1 px-2.5 border border-line bg-canvas hover:border-ink text-ink capitalize inline-flex items-center gap-1"
                      >
                        <span>{k}</span>
                        <ExternalLinkSVG className="w-2.5 h-2.5 text-ink-soft" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* VERIFICATION DESK APPLICATION */}
      {/* ========================================================================= */}
      <div className="p-6 border border-line bg-panel shadow-2xs">
        <div className="mb-6 pb-4 border-b border-line-soft">
          <h2 className="font-serif italic text-xl text-ink">
            Creator Verification
          </h2>
          <p className="font-sans text-xs text-ink-soft mt-0.5">
            Verified badges certify official recording artists and unlocks
            prominent catalog placement.
          </p>
        </div>

        {artistProfile.verificationStatus === 'VERIFIED' ? (
          <div className="p-6 border border-blue/20 bg-blue/5 flex items-center gap-4">
            <VerifiedBadgeSVG className="w-8 h-8 text-blue shrink-0" />
            <div>
              <h3 className="font-serif italic text-base text-ink">
                Officially Verified Artist
              </h3>
              <p className="font-sans text-xs text-ink-soft mt-0.5">
                Your artist profile has been verified by the administration
                desk. The verified emblem is active on your public profile and
                catalog releases.
              </p>
            </div>
          </div>
        ) : artistProfile.verificationStatus === 'PENDING' ? (
          <div className="p-6 border border-amber-300/40 bg-amber-50/50 dark:bg-amber-950/10 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
              <h3 className="font-serif italic text-base text-ink">
                Application Under Review
              </h3>
            </div>
            <p className="font-sans text-xs text-ink-soft leading-relaxed">
              Your verification application was received and is queued for
              administrative audit. Proof links and official artist identities
              are usually reviewed within 24-48 hours.
            </p>
            {artistProfile.verificationDetails?.message && (
              <div className="mt-2 p-3 border border-line-soft bg-canvas/60 font-sans text-xs text-ink-soft italic">
                "{artistProfile.verificationDetails.message}"
              </div>
            )}
          </div>
        ) : artistProfile.verificationStatus === 'REJECTED' &&
          !showResubmitForm ? (
          <div className="p-6 border border-red-300/60 bg-red-50/40 dark:bg-red-950/10 flex flex-col gap-4">
            <div>
              <h3 className="font-serif italic text-base text-red-600 dark:text-red-400">
                Application Needs Revision
              </h3>
              <p className="font-sans text-xs text-ink-soft mt-1">
                The administrative review requested adjustments to your
                verification materials:
              </p>
              <div className="mt-2 p-3 border border-red-200 dark:border-red-900/40 bg-canvas font-mono text-xs text-red-700 dark:text-red-300">
                {artistProfile.rejectionReason ||
                  'Please provide verifiable official links.'}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setShowResubmitForm(true)
                setVerifyPitch(artistProfile.verificationDetails?.message || '')
                if (artistProfile.verificationDetails?.links) {
                  setVerifyLinks(artistProfile.verificationDetails.links)
                }
              }}
              className="self-start font-mono text-[10.5px] uppercase tracking-[0.14em] py-2 px-4 bg-ink text-canvas hover:opacity-90 transition-opacity cursor-pointer"
            >
              Update & Resubmit Application &rarr;
            </button>
          </div>
        ) : (
          /* FORM: Apply or Resubmit */
          <form
            onSubmit={handleSubmitVerification}
            className="flex flex-col gap-5"
          >
            <div>
              <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block mb-1.5">
                Verification Pitch / Artist Background{' '}
                <span className="text-red-500">*</span>
              </label>
              <textarea
                required
                rows={3}
                value={verifyPitch}
                onChange={(e) => setVerifyPitch(e.target.value)}
                placeholder="Briefly describe your musical career, past releases, live performances, or label affiliations..."
                className="w-full font-sans text-xs py-2.5 px-3 border border-line bg-canvas text-ink focus:outline-none focus:border-ink resize-y leading-relaxed"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block mb-1.5">
                  Contact Email
                </label>
                <input
                  type="email"
                  value={verifyContactEmail}
                  onChange={(e) => setVerifyContactEmail(e.target.value)}
                  placeholder="artist@example.com"
                  className="w-full font-mono text-xs py-2 px-3 border border-line bg-canvas text-ink"
                />
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block mb-1.5">
                  Contact Phone (Optional)
                </label>
                <input
                  type="tel"
                  value={verifyContactPhone}
                  onChange={(e) => setVerifyContactPhone(e.target.value)}
                  placeholder="+1 555-0199"
                  className="w-full font-mono text-xs py-2 px-3 border border-line bg-canvas text-ink"
                />
              </div>
            </div>

            {/* Proof Links */}
            <div>
              <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block mb-1.5">
                Official Proof & Portfolio Links{' '}
                <span className="text-red-500">*</span>
              </label>
              <p className="font-sans text-xs text-ink-soft mb-3">
                Include links to verified Spotify, Apple Music, Bandcamp,
                official website, or press articles.
              </p>

              <div className="flex flex-col gap-2">
                {verifyLinks.map((link, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="url"
                      required
                      value={link}
                      onChange={(e) => {
                        const copy = [...verifyLinks]
                        copy[idx] = e.target.value
                        setVerifyLinks(copy)
                      }}
                      placeholder="https://open.spotify.com/artist/..."
                      className="flex-1 font-mono text-xs py-2 px-3 border border-line bg-canvas text-ink"
                    />
                    {verifyLinks.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          setVerifyLinks(
                            verifyLinks.filter((_, i) => i !== idx),
                          )
                        }}
                        className="font-mono text-xs py-2 px-3 border border-line text-ink-soft hover:text-red-500 hover:border-red-400 cursor-pointer"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}

                {verifyLinks.length < 5 && (
                  <button
                    type="button"
                    onClick={() => setVerifyLinks([...verifyLinks, ''])}
                    className="self-start font-mono text-[10px] uppercase tracking-[0.12em] py-1.5 px-3 border border-dashed border-line text-ink-soft hover:text-ink hover:border-ink cursor-pointer mt-1"
                  >
                    + Add Another Link
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={isSubmittingVerify}
                className="font-mono text-[10.5px] uppercase tracking-[0.14em] py-2.5 px-6 bg-ink text-canvas hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 font-semibold"
              >
                {isSubmittingVerify
                  ? 'Submitting...'
                  : 'Submit Verification Request'}
              </button>
              {showResubmitForm && (
                <button
                  type="button"
                  onClick={() => setShowResubmitForm(false)}
                  className="font-mono text-[10.5px] uppercase tracking-[0.14em] py-2 px-4 border border-line text-ink-soft hover:text-ink cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
