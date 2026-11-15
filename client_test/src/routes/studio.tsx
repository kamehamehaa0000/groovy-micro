import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '../stores/auth.store'
import { artistsApi } from '../lib/artists.api'
import { catalogApi } from '../lib/catalog.api'
import { isArtistAccount } from '../lib/artist-status'
import type { ArtistProfile } from '../types/artist'
import { ImageCropModal } from '../Components/common/ImageCropModal'
import { ConfirmPurgeModal } from '../Components/studio/ConfirmPurgeModal'
import { ConfirmSoftDeleteModal } from '../Components/studio/ConfirmSoftDeleteModal'
import { DetachCutDrawer } from '../Components/studio/DetachCutDrawer'
import { StudioHeader } from '../Components/studio/StudioHeader'
import { StudioTabs } from '../Components/studio/StudioTabs'
import { StudioUpgradeScreen } from '../Components/studio/StudioUpgradeScreen'
import { useProfileForm } from '../Components/studio/hooks/useProfileForm'
import { useReleases } from '../Components/studio/hooks/useReleases'
import { useTrash } from '../Components/studio/hooks/useTrash'
import { useVerification } from '../Components/studio/hooks/useVerification'
import type { StudioTab } from '../Components/studio/studio.types'
import { ProfileTab } from '../Components/studio/tabs/ProfileTab'
import { ReleasesTab } from '../Components/studio/tabs/ReleasesTab'
import { TrashTab } from '../Components/studio/tabs/TrashTab'
import { VerificationTab } from '../Components/studio/tabs/VerificationTab'

export const Route = createFileRoute('/studio')({
  staticData: { layout: 'wide' },
  validateSearch: (search: Record<string, unknown>): { tab?: StudioTab } => {
    const tab = search.tab
    return {
      tab:
        tab === 'trash' ||
        tab === 'profile' ||
        tab === 'verification' ||
        tab === 'releases'
          ? tab
          : undefined,
    }
  },
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
  // Kept separate from artistProfile so "this account has no profile" (a settled
  // answer) never looks like "the studio request failed" (recoverable error).
  const [studioLoadError, setStudioLoadError] = useState(false)
  // The tab lives in the URL, so a section can be linked to, bookmarked and
  // reached with the back button.
  const { tab: searchTab } = Route.useSearch()
  const activeTab: StudioTab = searchTab ?? 'releases'

  const setActiveTab = (tab: StudioTab) => {
    navigate({
      to: '/studio',
      search: (prev) => ({
        ...prev,
        tab: tab === 'releases' ? undefined : tab,
      }),
      replace: true,
    })
  }

  const releases = useReleases()

  const {
    albums,
    confirmSoftDelete,
    deleteConfirm,
    detachModalData,
    isDeletingItem,
    isLoadingReleases,
    setAlbumTrackMap,
    setAlbums,
    setDeleteConfirm,
    setDetachModalData,
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

  const hydrateRef = useRef(hydrate)
  hydrateRef.current = hydrate
  const hydrateContactRef = useRef(hydrateContact)
  hydrateContactRef.current = hydrateContact
  const setAlbumsRef = useRef(setAlbums)
  setAlbumsRef.current = setAlbums
  const seedTrashCountsRef = useRef(seedTrashCounts)
  seedTrashCountsRef.current = seedTrashCounts

  // Authentication check
  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      navigate({ to: '/login', search: { redirect: '/studio' } })
    }
  }, [isAuthLoading, isAuthenticated, navigate])

  // Bootstrap the studio. Artist accounts get profile + releases + trash tallies
  // in a single request; everyone else keeps the profile-only probe that drives
  // the upgrade screen. An account whose role is stale but already owns a
  // profile (healed server side by this very call) still gets its catalogue.
  useEffect(() => {
    if (!user) return

    setIsLoadingProfile(true)
    setStudioLoadError(false)

    // Listeners (and admins without a profile) keep the profile-only probe. A
    // 404 there is the normal "no profile yet" answer, so it is a settled
    // outcome rather than a failure.
    if (!isArtistAccount(user)) {
      artistsApi
        .getMyProfile()
        .then((profile) => {
          setArtistProfile(profile)
          hydrateRef.current(profile)
          hydrateContactRef.current(user.email)
          return catalogApi
            .getStudioReleases(false)
            .then((res) => setAlbumsRef.current(res.albums))
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
        setStudioLoadError(false)

        // A null artist is settled, not a failure: this account has no profile yet
        if (overview.artist) {
          setArtistProfile(overview.artist)
          hydrateRef.current(overview.artist)
          hydrateContactRef.current(user.email)
          setAlbumsRef.current(overview.albums)
          seedTrashCountsRef.current(overview.trashCounts)
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
        setStudioLoadError(true)
      }
      if (!cancelled) setIsLoadingProfile(false)
    }

    bootstrap(1)

    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [user?.id, user?.role, user?.email])

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
  // STATE A: BOOTSTRAP FAILED / NO ARTIST PROFILE YET
  // =========================================================================
  // The bootstrap failed after its retries, so this is not "no profile": show a
  // recoverable error instead of offering a profile creation that would conflict.
  if (studioLoadError) {
    return (
      <div className="mx-auto max-w-xl py-24 text-center">
        <p className="text-lg text-foreground font-medium">
          Couldn't load your studio.
        </p>
        <p className="font-mono text-caption text-muted-foreground mt-1">
          The studio service did not respond. Please refresh the page.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 font-eyebrow text-eyebrow uppercase tracking-wider py-2.5 px-5 rounded-full bg-foreground text-background hover:opacity-90 transition-opacity font-semibold cursor-pointer"
        >
          Refresh Studio
        </button>
      </div>
    )
  }

  // A settled "no profile" answer is the same for listeners, admins and stale
  // artist roles: offer the profile creation flow rather than a false error.
  if (!artistProfile) {
    return <StudioUpgradeScreen setArtistProfile={setArtistProfile} />
  }

  return (
    <div className="overflow-x-hidden min-w-0">
      <StudioHeader
        stageName={artistProfile.stageName}
        slug={artistProfile.slug}
        verified={artistProfile.verified}
        onNewRelease={() => navigate({ to: '/studio/new' })}
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
