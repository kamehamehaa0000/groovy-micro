import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useAuthStore } from '../stores/auth.store'
import { artistsApi, slugifyText } from '../lib/artists.api'
import type { ArtistProfile } from '../types/artist'
import { toast } from 'sonner'
import { ImageCropModal } from '../components/common/ImageCropModal'
import { ConfirmPurgeModal } from '../components/studio/ConfirmPurgeModal'
import { ConfirmSoftDeleteModal } from '../components/studio/ConfirmSoftDeleteModal'
import { DetachCutDrawer } from '../components/studio/DetachCutDrawer'
import { EditReleaseDrawer } from '../components/studio/EditReleaseDrawer'
import { StudioHeader } from '../components/studio/StudioHeader'
import { StudioTabs } from '../components/studio/StudioTabs'
import { StudioToaster } from '../components/studio/StudioToaster'
import { useProfileForm } from '../components/studio/hooks/useProfileForm'
import { useReleases } from '../components/studio/hooks/useReleases'
import { useTrash } from '../components/studio/hooks/useTrash'
import { useVerification } from '../components/studio/hooks/useVerification'
import type { StudioTab } from '../components/studio/studio.types'
import { ProfileTab } from '../components/studio/tabs/ProfileTab'
import { ReleasesTab } from '../components/studio/tabs/ReleasesTab'
import { TrashTab } from '../components/studio/tabs/TrashTab'
import { VerificationTab } from '../components/studio/tabs/VerificationTab'

export const Route = createFileRoute('/studio')({
  component: StudioComponent,
})

function StudioComponent() {
  const navigate = useNavigate()
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthStore()

  const [artistProfile, setArtistProfile] = useState<ArtistProfile | null>(null)
  const [isLoadingProfile, setIsLoadingProfile] = useState(false)
  const [activeTab, setActiveTab] = useState<StudioTab>('releases')

  const releases = useReleases()

  const {
    albums,
    confirmSoftDelete,
    deleteConfirm,
    detachModalData,
    editingAlbum,
    isDeletingItem,
    isLoadingReleases,
    setAlbumTrackMap,
    setDeleteConfirm,
    setDetachModalData,
    setEditingAlbum,
    setIsCreateReleaseOpen,
  } = releases

  const trash = useTrash()

  const {
    confirmPurge,
    isPurging,
    setTrashConfirm,
    trashAlbums,
    trashConfirm,
    trashSongs,
  } = trash

  const profileForm = useProfileForm(artistProfile, setArtistProfile)

  const {
    avatarCropFile,
    bannerCropFile,
    handleAvatarCropComplete,
    handleBannerCropComplete,
    hydrate,
    isUploadingAvatar,
    isUploadingBanner,
    setAvatarCropFile,
    setBannerCropFile,
  } = profileForm

  const verification = useVerification(setArtistProfile)

  const {
    hydrateContact,
  } = verification

  // Upgrade Form State (for Listeners)
  const [stageName, setStageName] = useState('')
  const [customSlug, setCustomSlug] = useState('')
  const [bio, setBio] = useState('')
  const [instagram, setInstagram] = useState('')
  const [website, setWebsite] = useState('')
  const [spotify, setSpotify] = useState('')
  const [isSubmittingUpgrade, setIsSubmittingUpgrade] = useState(false)

  // Authentication check
  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      navigate({ to: '/login', search: { redirect: '/studio' } })
    }
  }, [isAuthLoading, isAuthenticated, navigate])

  // Fetch Artist Profile if authenticated
  useEffect(() => {
    if (user) {
      setIsLoadingProfile(true)
      artistsApi
        .getMyProfile()
        .then((profile) => {
          setArtistProfile(profile)
          hydrate(profile)
          hydrateContact(user.email)
        })
        .catch((err) => {
          console.warn('Could not load artist profile:', err)
          setArtistProfile(null)
        })
        .finally(() => {
          setIsLoadingProfile(false)
        })
    }
  }, [user, hydrate, hydrateContact])

  useEffect(() => {
    if (artistProfile) {
      if (activeTab === 'releases' || activeTab === 'profile') {
        releases.loadReleases()
      } else if (activeTab === 'trash') {
        trash.loadTrash()
      }
    }
  }, [artistProfile, activeTab])

  if (isAuthLoading || (user?.role === 'ARTIST' && isLoadingProfile)) {
    return (
      <div className="py-32 text-center font-eyebrow text-caption uppercase tracking-widest text-muted-foreground animate-pulse">
        Initializing Creator Studio...
      </div>
    )
  }

  if (!user) return null

  if (isLoadingProfile) {
    return (
      <div className="py-24 text-center font-eyebrow text-caption uppercase tracking-widest text-muted-foreground animate-pulse">
        Retrieving artist credentials &amp; studio workspace...
      </div>
    )
  }

  // =========================================================================
  // STATE A: LISTENER UPGRADE EXPERIENCE
  // =========================================================================
  if ((user.role === 'LISTENER' || !user.role) && !artistProfile) {
    const previewSlug = customSlug.trim()
      ? slugifyText(customSlug)
      : slugifyText(stageName) || 'your-stage-name'

    const handleInstantUpgrade = async (e: React.FormEvent) => {
      e.preventDefault()
      if (!stageName.trim()) {
        toast.error('Please provide a stage name')
        return
      }

      setIsSubmittingUpgrade(true)
      toast.dismiss()

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
        toast.success(
          '🎉 Welcome to Groovy Creator Studio! Your artist identity is live.',
        )
      } catch (err: any) {
        toast.error(
          err.message || 'Instant upgrade failed. Please check your details.',
        )
      } finally {
        setIsSubmittingUpgrade(false)
      }
    }

    return (
      <div className="max-w-3xl mx-auto px-5 sm:px-8 py-12">
        <div className="border-b border-border pb-6 mb-8">
          <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-primary block mb-2">
            Maison Creator Studio
          </span>
          <h1 className="font-serif italic text-3xl sm:text-4xl text-foreground tracking-tight">
            Launch Your Artist Identity
          </h1>
          <p className="font-sans text-caption text-muted-foreground mt-2 leading-relaxed">
            Upgrade instantly from a listener account to an official Groovy
            artist profile. Release master tracks, manage your presence, and
            curate your discography.
          </p>
        </div>

        <form onSubmit={handleInstantUpgrade} className="flex flex-col gap-6">
          <div className="p-6 border border-border bg-card flex flex-col gap-5 shadow-raised">
            <div>
              <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground block mb-2">
                Stage / Ensemble Name{' '}
                <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                required
                value={stageName}
                onChange={(e) => setStageName(e.target.value)}
                placeholder="e.g. Hélène Vane, The Cinematic Trio"
                className="w-full font-serif italic text-title py-2.5 px-3 border border-border bg-background text-foreground focus:outline-none focus:border-foreground transition-colors"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground">
                  Vanity Handle (Slug)
                </label>
                <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground">
                  Auto-generated if blank
                </span>
              </div>
              <input
                type="text"
                value={customSlug}
                onChange={(e) => setCustomSlug(e.target.value)}
                placeholder="e.g. helene-vane"
                className="w-full font-mono text-caption py-2.5 px-3 border border-border bg-background text-foreground focus:outline-none focus:border-foreground transition-colors"
              />
              <div className="mt-2 font-mono text-eyebrow text-muted-foreground flex items-center gap-1">
                <span>Public profile URL:</span>
                <span className="text-primary font-semibold">
                  groovy.app/artists/{previewSlug}
                </span>
              </div>
            </div>

            <div>
              <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground block mb-2">
                Artist Biography
              </label>
              <textarea
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Share your musical background, style, influences, or instruments..."
                className="w-full font-sans text-caption py-2.5 px-3 border border-border bg-background text-foreground focus:outline-none focus:border-foreground transition-colors resize-y leading-relaxed"
              />
            </div>

            <div className="pt-4 border-t border-border-soft">
              <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block mb-3">
                Official Channels (Optional)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block mb-1">
                    Instagram URL
                  </label>
                  <input
                    type="url"
                    value={instagram}
                    onChange={(e) => setInstagram(e.target.value)}
                    placeholder="https://instagram.com/..."
                    className="w-full font-mono text-caption py-2 px-3 border border-border bg-background text-foreground focus:outline-none focus:border-foreground"
                  />
                </div>
                <div>
                  <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block mb-1">
                    Website URL
                  </label>
                  <input
                    type="url"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://yourwebsite.com"
                    className="w-full font-mono text-caption py-2 px-3 border border-border bg-background text-foreground focus:outline-none focus:border-foreground"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block mb-1">
                    Spotify Artist URL
                  </label>
                  <input
                    type="url"
                    value={spotify}
                    onChange={(e) => setSpotify(e.target.value)}
                    placeholder="https://open.spotify.com/artist/..."
                    className="w-full font-mono text-caption py-2 px-3 border border-border bg-background text-foreground focus:outline-none focus:border-foreground"
                  />
                </div>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmittingUpgrade}
            className="w-full font-eyebrow text-caption uppercase tracking-widest py-3.5 px-6 bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 font-semibold"
          >
            {isSubmittingUpgrade
              ? 'Activating Studio...'
              : '✦ Activate Artist Studio (Instant Upgrade)'}
          </button>
        </form>
        <StudioToaster />
      </div>
    )
  }

  // =========================================================================
  // STATE B: FULL ARTIST STUDIO DASHBOARD
  // =========================================================================
  if (!artistProfile) {
    return (
      <div className="max-w-xl mx-auto py-24 text-center">
        <p className="font-serif italic text-lg text-foreground">
          No artist profile detected.
        </p>
        <p className="font-mono text-caption text-muted-foreground mt-1">
          Please try refreshing the page.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-3.5 sm:px-6 lg:px-8 py-5 sm:py-8 w-full overflow-x-hidden min-w-0">
      <StudioHeader
        stageName={artistProfile.stageName}
        slug={artistProfile.slug}
        verified={artistProfile.verified}
        onNewRelease={() => setIsCreateReleaseOpen(true)}
      />

      <StudioTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        releaseCount={albums.length}
        trashCount={trashAlbums.length + trashSongs.length}
      />

      {/* ========================================================================= */}
      {/* TAB 1: CATALOG & RELEASES */}
      {/* ========================================================================= */}
      <ReleasesTab artistProfile={artistProfile} releases={releases} />

      {/* ========================================================================= */}
      {/* TAB 2: 30-DAY TRASH & ARCHIVE */}
      {/* ========================================================================= */}
      <TrashTab trash={trash} />

      {/* ========================================================================= */}
      {/* TAB 3: PROFILE & BRANDING */}
      {/* ========================================================================= */}
      <ProfileTab
        artistProfile={artistProfile}
        albums={albums}
        isLoadingReleases={isLoadingReleases}
        profile={profileForm}
      />

      {/* ========================================================================= */}
      {/* TAB 4: VERIFICATION DESK */}
      {/* ========================================================================= */}
      <VerificationTab
        artistProfile={artistProfile}
        verification={verification}
      />

      {/* Detach Cut Modal */}
      {detachModalData && (
        <DetachCutDrawer
          request={detachModalData}
          onClose={() => setDetachModalData(null)}
          onReleasesChanged={releases.loadReleases}
          onAlbumTracksChanged={(albumId, tracks) =>
            setAlbumTrackMap((prev) => ({ ...prev, [albumId]: tracks }))
          }
        />
      )}

      {/* Edit Master Release Modal / Drawer */}
      {editingAlbum && (
        <EditReleaseDrawer
          request={editingAlbum}
          artistProfile={artistProfile}
          onClose={() => setEditingAlbum(null)}
          onReleasesChanged={releases.loadReleases}
        />
      )}

      {/* Soft Delete Confirmation Modal */}
      {deleteConfirm && (
        <ConfirmSoftDeleteModal
          request={deleteConfirm}
          isDeleting={isDeletingItem}
          onCancel={() => setDeleteConfirm(null)}
          onConfirm={confirmSoftDelete}
        />
      )}

      {/* Permanent Delete / Empty Trash Confirmation Modal */}
      {trashConfirm && (
        <ConfirmPurgeModal
          request={trashConfirm}
          isPurging={isPurging}
          onCancel={() => setTrashConfirm(null)}
          onConfirm={confirmPurge}
        />
      )}

      {/* Banner Crop Modal */}
      <ImageCropModal
        isOpen={!!bannerCropFile}
        onClose={() => setBannerCropFile(null)}
        imageFile={bannerCropFile}
        title="Crop Artist Banner"
        subtitle="Maison Studio · Panoramic Banner"
        aspectRatio={3}
        isCircularMask={false}
        targetMaxWidth={1920}
        targetMaxHeight={640}
        isSubmitting={isUploadingBanner}
        onCropComplete={handleBannerCropComplete}
      />

      {/* Avatar Crop Modal */}
      <ImageCropModal
        isOpen={!!avatarCropFile}
        onClose={() => setAvatarCropFile(null)}
        imageFile={avatarCropFile}
        title="Crop Artist Avatar"
        subtitle="Maison Studio · Profile Avatar"
        aspectRatio={1}
        isCircularMask={true}
        targetMaxWidth={600}
        targetMaxHeight={600}
        isSubmitting={isUploadingAvatar}
        onCropComplete={handleAvatarCropComplete}
      />

      <StudioToaster />
    </div>
  )
}
