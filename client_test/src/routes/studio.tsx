import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useAuthStore } from '../stores/auth.store'
import { artistsApi } from '../lib/artists.api'
import { catalogApi } from '../lib/catalog.api'
import type { ArtistProfile } from '../types/artist'
import { ImageCropModal } from '../components/common/ImageCropModal'
import { ConfirmPurgeModal } from '../components/studio/ConfirmPurgeModal'
import { ConfirmSoftDeleteModal } from '../components/studio/ConfirmSoftDeleteModal'
import { DetachCutDrawer } from '../components/studio/DetachCutDrawer'
import { EditReleaseDrawer } from '../components/studio/EditReleaseDrawer'
import { StudioHeader } from '../components/studio/StudioHeader'
import { StudioTabs } from '../components/studio/StudioTabs'
import { StudioUpgradeScreen } from '../components/studio/StudioUpgradeScreen'
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

// The studio bootstraps once and never refetches on tab switches, so a failed
// first load retries a couple of times instead of stranding the page on the
// "please refresh" state (enough to ride out an API restart or a cold start).
const STUDIO_BOOTSTRAP_ATTEMPTS = 3
const STUDIO_BOOTSTRAP_RETRY_MS = 1500

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
    setAlbums,
    setDeleteConfirm,
    setDetachModalData,
    setEditingAlbum,
    setIsCreateReleaseOpen,
  } = releases

  const trash = useTrash()

  const {
    confirmPurge,
    hasLoadedTrash,
    invalidateTrash,
    isPurging,
    loadTrash,
    seedTrashCounts,
    setTrashConfirm,
    trashAlbumCount,
    trashConfirm,
    trashSongCount,
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

  const { hydrateContact } = verification

  // Authentication check
  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      navigate({ to: '/login', search: { redirect: '/studio' } })
    }
  }, [isAuthLoading, isAuthenticated, navigate])

  // Bootstrap the studio. Artists and admins get profile + releases + trash
  // tallies in a single request; everyone else keeps the profile-only probe that
  // drives the upgrade screen. An account whose role is stale but already owns a
  // profile (healed server side by this very call) still gets its catalogue.
  useEffect(() => {
    if (!user) return

    setIsLoadingProfile(true)

    // Listeners keep the profile-only probe. A 404 there is the normal "no
    // profile yet" answer, so it is a settled outcome rather than a failure.
    if (user.role !== 'ARTIST' && user.role !== 'ADMIN') {
      artistsApi
        .getMyProfile()
        .then((profile) => {
          setArtistProfile(profile)
          hydrate(profile)
          hydrateContact(user.email)
          return catalogApi
            .getStudioReleases(false)
            .then((res) => setAlbums(res.albums))
            .catch(() => {
              // Dashboard still renders; the releases tab falls back to empty
            })
        })
        .catch((err) => {
          console.warn('Could not load artist profile:', err)
          setArtistProfile(null)
        })
        .finally(() => {
          setIsLoadingProfile(false)
        })
      return
    }

    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined

    const bootstrap = async (attempt: number) => {
      try {
        const overview = await catalogApi.getStudioOverview()
        if (cancelled) return

        // A null artist is settled, not a failure: this account has no profile yet
        if (overview.artist) {
          setArtistProfile(overview.artist)
          hydrate(overview.artist)
          hydrateContact(user.email)
          setAlbums(overview.albums)
          seedTrashCounts(overview.trashCounts)
        } else {
          setArtistProfile(null)
        }
      } catch (err) {
        if (cancelled) return
        console.warn('Could not load studio overview:', err)
        if (attempt < STUDIO_BOOTSTRAP_ATTEMPTS) {
          retryTimer = setTimeout(
            () => bootstrap(attempt + 1),
            STUDIO_BOOTSTRAP_RETRY_MS * attempt,
          )
          return
        }
        setArtistProfile(null)
      }
      if (!cancelled) setIsLoadingProfile(false)
    }

    bootstrap(1)

    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [user, hydrate, hydrateContact, setAlbums, seedTrashCounts])

  // Trash loads lazily on its first visit. The badge tally already arrived with
  // the bootstrap payload, so switching tabs never refetches anything.
  useEffect(() => {
    if (activeTab === 'trash' && artistProfile && !hasLoadedTrash) {
      loadTrash()
    }
  }, [activeTab, artistProfile, hasLoadedTrash, loadTrash])

  // Soft deletes answer with the fresh tallies, so the badge updates in place and
  // the trash list only refetches when it is next opened
  const handleConfirmSoftDelete = async () => {
    const counts = await confirmSoftDelete()
    if (counts) {
      seedTrashCounts(counts)
      invalidateTrash()
    }
  }

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
    return <StudioUpgradeScreen setArtistProfile={setArtistProfile} />
  }

  // =========================================================================
  // STATE B: FULL ARTIST STUDIO DASHBOARD
  // =========================================================================
  if (!artistProfile) {
    return (
      <div className="mx-auto max-w-xl py-24 text-center">
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
    <div className="overflow-x-hidden min-w-0">
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
        trashCount={trashAlbumCount + trashSongCount}
      />

      {/* ========================================================================= */}
      {/* TAB 1: CATALOG & RELEASES */}
      {/* ========================================================================= */}
      {activeTab === 'releases' && (
        <ReleasesTab artistProfile={artistProfile} releases={releases} />
      )}

      {/* ========================================================================= */}
      {/* TAB 2: 30-DAY TRASH & ARCHIVE */}
      {/* ========================================================================= */}
      {activeTab === 'trash' && <TrashTab trash={trash} />}

      {/* ========================================================================= */}
      {/* TAB 3: PROFILE & BRANDING */}
      {/* ========================================================================= */}
      {activeTab === 'profile' && (
        <ProfileTab
          artistProfile={artistProfile}
          albums={albums}
          isLoadingReleases={isLoadingReleases}
          profile={profileForm}
        />
      )}

      {/* ========================================================================= */}
      {/* TAB 4: VERIFICATION DESK */}
      {/* ========================================================================= */}
      {activeTab === 'verification' && (
        <VerificationTab
          artistProfile={artistProfile}
          verification={verification}
        />
      )}

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
          onConfirm={handleConfirmSoftDelete}
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
    </div>
  )
}
