import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '../stores/auth.store'
import { artistsApi, slugifyText } from '../lib/artists.api'
import { catalogApi } from '../lib/catalog.api'
import type { ArtistProfile } from '../types/artist'
import type { Album, Song, ReleaseVisibility } from '../types/catalog'
import {
  BadgeCheck,
  ExternalLink,
  UploadCloud,
  Disc3,
  RotateCcw,
  X,
  Check,
} from 'lucide-react'
import { ImageCropModal } from '../components/common/ImageCropModal'
import { ProceduralCover } from '../components/common/ProceduralCover'
import { ConfirmPurgeModal } from '../components/studio/ConfirmPurgeModal'
import { ConfirmSoftDeleteModal } from '../components/studio/ConfirmSoftDeleteModal'
import { CreateReleaseDrawer } from '../components/studio/CreateReleaseDrawer'
import { DetachCutDrawer } from '../components/studio/DetachCutDrawer'
import { EditReleaseDrawer } from '../components/studio/EditReleaseDrawer'
import { ReleaseCard } from '../components/studio/ReleaseCard'
import { StudioHeader } from '../components/studio/StudioHeader'
import { StudioTabs } from '../components/studio/StudioTabs'
import type {
  DetachCutRequest,
  ReleaseDeleteRequest,
  StudioTab,
  TrashPurgeRequest,
} from '../components/studio/studio.types'

export const Route = createFileRoute('/studio')({
  component: StudioComponent,
})

function StudioComponent() {
  const navigate = useNavigate()
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthStore()

  const [artistProfile, setArtistProfile] = useState<ArtistProfile | null>(null)
  const [isLoadingProfile, setIsLoadingProfile] = useState(false)
  const [activeTab, setActiveTab] = useState<StudioTab>('releases')
  const [errorNotice, setErrorNotice] = useState<string | null>(null)
  const [successNotice, setSuccessNotice] = useState<string | null>(null)

  // Catalog Releases State
  const [albums, setAlbums] = useState<Album[]>([])
  const [isLoadingReleases, setIsLoadingReleases] = useState(false)

  // Trash Releases State
  const [trashAlbums, setTrashAlbums] = useState<Album[]>([])
  const [trashSongs, setTrashSongs] = useState<Song[]>([])
  const [isLoadingTrash, setIsLoadingTrash] = useState(false)
  const [trashConfirm, setTrashConfirm] = useState<TrashPurgeRequest | null>(
    null,
  )
  const [isPurging, setIsPurging] = useState(false)

  // Soft Delete Confirmation State (Modal)
  const [deleteConfirm, setDeleteConfirm] =
    useState<ReleaseDeleteRequest | null>(null)
  const [isDeletingItem, setIsDeletingItem] = useState(false)

  // Upgrade Form State (for Listeners)
  const [stageName, setStageName] = useState('')
  const [customSlug, setCustomSlug] = useState('')
  const [bio, setBio] = useState('')
  const [instagram, setInstagram] = useState('')
  const [website, setWebsite] = useState('')
  const [spotify, setSpotify] = useState('')
  const [isSubmittingUpgrade, setIsSubmittingUpgrade] = useState(false)

  // Release Creation Modal State (Unified Spotify-style Release Model)
  const [isCreateReleaseOpen, setIsCreateReleaseOpen] = useState(false)

  // Edit Release Modal State
  const [editingAlbum, setEditingAlbum] = useState<Album | null>(null)

  // Detach Cut Modal State
  const [detachModalData, setDetachModalData] =
    useState<DetachCutRequest | null>(null)

  // Banner & Avatar Upload & Crop State
  const [isUploadingBanner, setIsUploadingBanner] = useState(false)
  const bannerInputRef = useRef<HTMLInputElement>(null)
  const [bannerCropFile, setBannerCropFile] = useState<File | null>(null)

  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [avatarCropFile, setAvatarCropFile] = useState<File | null>(null)

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

  // Artist Spotlight & Pick State
  const [spotlightReleaseId, setSpotlightReleaseId] = useState('')
  const [spotlightComment, setSpotlightComment] = useState('')
  const [isSavingSpotlight, setIsSavingSpotlight] = useState(false)
  const [spotlightStatus, setSpotlightStatus] = useState<
    'idle' | 'saved' | 'cleared' | 'error'
  >('idle')
  const [spotlightStatusMessage, setSpotlightStatusMessage] = useState<
    string | null
  >(null)

  // Expanded album tracks view in Studio
  const [expandedAlbumId, setExpandedAlbumId] = useState<string | null>(null)
  const [visibilityMenuId, setVisibilityMenuId] = useState<string | null>(null)
  const [albumTrackMap, setAlbumTrackMap] = useState<Record<string, Song[]>>({})
  const [isLoadingAlbumTracks, setIsLoadingAlbumTracks] = useState(false)

  // Dismiss the visibility menu with Escape
  useEffect(() => {
    if (!visibilityMenuId) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setVisibilityMenuId(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [visibilityMenuId])

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
          setEditStageName(profile.stageName)
          setEditSlug(profile.slug)
          setEditBio(profile.bio || '')
          setEditInstagram(profile.socialLinks?.instagram || '')
          setEditWebsite(profile.socialLinks?.website || '')
          setEditSpotify(profile.socialLinks?.spotify || '')
          setSpotlightReleaseId(profile.pinnedReleaseId || '')
          setSpotlightComment(profile.pinnedComment || '')
          setVerifyContactEmail(user.email)
        })
        .catch((err) => {
          console.warn('Could not load artist profile:', err)
          setArtistProfile(null)
        })
        .finally(() => {
          setIsLoadingProfile(false)
        })
    }
  }, [user])

  // Load Releases for the artist
  const loadReleases = async () => {
    if (!user || (user.role !== 'ARTIST' && user.role !== 'ADMIN')) return
    setIsLoadingReleases(true)
    try {
      const res = await catalogApi.getStudioReleases(false)
      setAlbums(res.albums)
    } catch (err: any) {
      console.warn('Could not load releases:', err)
    } finally {
      setIsLoadingReleases(false)
    }
  }

  // Load Trash items
  const loadTrash = async () => {
    if (!user || (user.role !== 'ARTIST' && user.role !== 'ADMIN')) return
    setIsLoadingTrash(true)
    try {
      const res = await catalogApi.getStudioReleases(true)
      setTrashAlbums(res.albums)
      setTrashSongs(res.songs)
    } catch (err: any) {
      console.warn('Could not load trash releases:', err)
    } finally {
      setIsLoadingTrash(false)
    }
  }

  useEffect(() => {
    if (artistProfile) {
      if (activeTab === 'releases' || activeTab === 'profile') {
        loadReleases()
      } else if (activeTab === 'trash') {
        loadTrash()
      }
    }
  }, [artistProfile, activeTab])

  // Clear notice after 5 seconds
  useEffect(() => {
    if (successNotice || errorNotice) {
      const t = setTimeout(() => {
        setSuccessNotice(null)
        setErrorNotice(null)
      }, 5000)
      return () => clearTimeout(t)
    }
  }, [successNotice, errorNotice])

  // Toggle expand album tracks
  const handleToggleAlbumExpand = async (albumId: string) => {
    if (expandedAlbumId === albumId) {
      setExpandedAlbumId(null)
      return
    }

    setExpandedAlbumId(albumId)
    if (!albumTrackMap[albumId]) {
      setIsLoadingAlbumTracks(true)
      try {
        const fullAlbum = await catalogApi.getAlbum(albumId)
        setAlbumTrackMap((prev) => ({
          ...prev,
          [albumId]: fullAlbum.tracks,
        }))
      } catch (err: any) {
        setErrorNotice(err.message || 'Failed to load album tracks')
      } finally {
        setIsLoadingAlbumTracks(false)
      }
    }
  }

  // Open Detach Modal (only allowed on non-single releases)
  const handleOpenDetachModal = (song: Song, parentAlbum: Album) => {
    if (parentAlbum.albumType === 'SINGLE') {
      setErrorNotice('Cannot detach a track from a single release.')
      return
    }
    setDetachModalData({ song, parentAlbum })
    setErrorNotice(null)
  }

  // Trigger soft delete confirmation modal for an album release
  const handleDeleteAlbum = (
    albumId: string,
    title?: string,
    trackCount?: number,
  ) => {
    setDeleteConfirm({
      type: 'album',
      id: albumId,
      title: title || 'Release',
      trackCount: trackCount || 1,
    })
  }

  // Trigger soft delete confirmation modal for a song
  const handleDeleteSong = (
    songId: string,
    title?: string,
    parentAlbumId?: string,
    trackCount?: number,
  ) => {
    setDeleteConfirm({
      type: 'song',
      id: songId,
      title: title || 'Master track',
      parentAlbumId,
      trackCount,
    })
  }

  // Execute confirmed soft delete
  const confirmSoftDelete = async () => {
    if (!deleteConfirm) return

    try {
      setIsDeletingItem(true)
      setErrorNotice(null)
      if (deleteConfirm.type === 'album') {
        await catalogApi.deleteAlbum(deleteConfirm.id)
        setSuccessNotice(
          'Release and all its cuts moved to 30-day trash. You can restore it anytime within 30 days.',
        )
      } else {
        const res = await catalogApi.deleteSong(deleteConfirm.id)
        setSuccessNotice(res.message || 'Master track moved to 30-day trash.')
        if (deleteConfirm.parentAlbumId) {
          try {
            const fullAlbum = await catalogApi.getAlbum(
              deleteConfirm.parentAlbumId,
            )
            setAlbumTrackMap((prev) => ({
              ...prev,
              [deleteConfirm.parentAlbumId!]: fullAlbum.tracks,
            }))
          } catch {
            // Parent album may have been deleted if it was the last track
          }
        }
      }
      setDeleteConfirm(null)
      loadReleases()
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to archive item')
    } finally {
      setIsDeletingItem(false)
    }
  }

  // Execute confirmed permanent purge (empty trash, release, or single cut)
  const confirmPurge = () => {
    if (!trashConfirm) return
    if (trashConfirm.type === 'empty') {
      handleEmptyTrash()
    } else if (trashConfirm.type === 'permanent_release' && trashConfirm.id) {
      handlePermanentDeleteAlbum(trashConfirm.id)
    } else if (trashConfirm.type === 'permanent_song' && trashConfirm.id) {
      handlePermanentDeleteSong(trashConfirm.id)
    }
  }

  // Restore album from trash
  const handleRestoreAlbum = async (albumId: string) => {
    try {
      await catalogApi.restoreAlbum(albumId)
      setSuccessNotice('Release restored to active catalog.')
      loadTrash()
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to restore release')
    }
  }

  // Restore song from trash
  const handleRestoreSong = async (songId: string) => {
    try {
      await catalogApi.restoreSong(songId)
      setSuccessNotice('Master track restored to active catalog.')
      loadTrash()
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to restore track')
    }
  }

  // Permanently delete album release and its tracks
  const handlePermanentDeleteAlbum = async (albumId: string) => {
    try {
      setIsPurging(true)
      setErrorNotice(null)
      await catalogApi.permanentlyDeleteAlbum(albumId)
      setSuccessNotice('Release and all associated tracks permanently deleted.')
      setTrashConfirm(null)
      loadTrash()
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to permanently delete release')
    } finally {
      setIsPurging(false)
    }
  }

  // Permanently delete master cut
  const handlePermanentDeleteSong = async (songId: string) => {
    try {
      setIsPurging(true)
      setErrorNotice(null)
      await catalogApi.permanentlyDeleteSong(songId)
      setSuccessNotice('Master cut permanently deleted.')
      setTrashConfirm(null)
      loadTrash()
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to permanently delete track')
    } finally {
      setIsPurging(false)
    }
  }

  // Permanently empty all items in studio trash
  const handleEmptyTrash = async () => {
    try {
      setIsPurging(true)
      setErrorNotice(null)
      const res = await catalogApi.emptyStudioTrash()
      setSuccessNotice(res.message || 'Studio trash emptied permanently.')
      setTrashConfirm(null)
      loadTrash()
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to empty studio trash')
    } finally {
      setIsPurging(false)
    }
  }

  // Quick Visibility Changer from Release Card
  const handleQuickChangeVisibility = async (
    album: Album,
    newVisibility: ReleaseVisibility,
  ) => {
    if (album.visibility === newVisibility) return
    setErrorNotice(null)
    try {
      const updated = await catalogApi.updateAlbum(album.id, {
        visibility: newVisibility,
      })
      setAlbums((prev) =>
        prev.map((a) =>
          a.id === album.id
            ? {
                ...a,
                visibility: updated.visibility,
                shareToken: updated.shareToken ?? a.shareToken,
              }
            : a,
        ),
      )
      setSuccessNotice(
        `Visibility for "${album.title}" updated to ${newVisibility}${
          newVisibility === 'UNLISTED' ? ' (Secret share token generated)' : ''
        }.`,
      )
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to update visibility')
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

        {errorNotice && (
          <div className="p-4 mb-6 border border-destructive/40 bg-destructive-soft text-destructive font-mono text-caption">
            {errorNotice}
          </div>
        )}

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

  // Handle Banner Select -> Launch Cropper
  const handleBannerSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBannerCropFile(file)
    if (bannerInputRef.current) bannerInputRef.current.value = ''
  }

  // Handle Cropped Banner Upload via Cloudflare R2
  const handleBannerCropComplete = async (croppedFile: File) => {
    if (!artistProfile) return
    setIsUploadingBanner(true)
    setErrorNotice(null)

    try {
      const publicUrl = await artistsApi.uploadBanner(
        artistProfile.id,
        croppedFile,
      )
      setArtistProfile((prev) =>
        prev ? { ...prev, bannerUrl: publicUrl } : null,
      )
      setSuccessNotice(
        'Banner image cropped, uploaded to Cloudflare R2, and synced.',
      )
      setBannerCropFile(null)
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to upload banner')
    } finally {
      setIsUploadingBanner(false)
    }
  }

  // Handle Avatar Select -> Launch Cropper
  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarCropFile(file)
    if (avatarInputRef.current) avatarInputRef.current.value = ''
  }

  // Handle Cropped Avatar Upload via Cloudflare R2
  const handleAvatarCropComplete = async (croppedFile: File) => {
    if (!artistProfile) return
    setIsUploadingAvatar(true)
    setErrorNotice(null)

    try {
      const publicUrl = await artistsApi.uploadAvatar(
        artistProfile.id,
        croppedFile,
      )
      setArtistProfile((prev) =>
        prev ? { ...prev, avatarUrl: publicUrl } : null,
      )
      setSuccessNotice(
        'Artist avatar cropped, uploaded to Cloudflare R2, and synced.',
      )
      setAvatarCropFile(null)
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to upload avatar')
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  // Handle Remove Avatar
  const handleRemoveAvatar = async () => {
    if (!artistProfile) return
    setIsUploadingAvatar(true)
    setErrorNotice(null)
    try {
      await artistsApi.updateMyProfile({ avatarUrl: null })
      setArtistProfile((prev) => (prev ? { ...prev, avatarUrl: null } : null))
      setSuccessNotice('Artist avatar removed.')
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to remove avatar')
    } finally {
      setIsUploadingAvatar(false)
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

  // Handle Save Spotlight / Artist Pick
  const handleSaveSpotlight = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!artistProfile) return
    setIsSavingSpotlight(true)
    setErrorNotice(null)
    setSpotlightStatus('idle')
    setSpotlightStatusMessage(null)

    try {
      const res = await artistsApi.updateMyProfile({
        pinnedReleaseId: spotlightReleaseId || null,
        pinnedComment: spotlightReleaseId
          ? spotlightComment.trim() || null
          : null,
      })
      setArtistProfile(res.profile)
      setSpotlightReleaseId(res.profile.pinnedReleaseId || '')
      setSpotlightComment(res.profile.pinnedComment || '')
      const msg = spotlightReleaseId
        ? 'Artist Pick spotlight updated successfully.'
        : 'Artist Pick spotlight reset to automatic latest release.'
      setSuccessNotice(msg)
      setSpotlightStatus('saved')
      setSpotlightStatusMessage(
        spotlightReleaseId
          ? 'Spotlight saved! Your public profile is now updated.'
          : 'Reset to automatic latest release fallback.',
      )
      setTimeout(() => {
        setSpotlightStatus((prev) => (prev === 'saved' ? 'idle' : prev))
      }, 4000)
    } catch (err: any) {
      const errMsg = err.message || 'Failed to update spotlight'
      setErrorNotice(errMsg)
      setSpotlightStatus('error')
      setSpotlightStatusMessage(errMsg)
    } finally {
      setIsSavingSpotlight(false)
    }
  }

  // Handle Reset Spotlight to Latest Release
  const handleClearSpotlight = async () => {
    if (!artistProfile) return
    setIsSavingSpotlight(true)
    setErrorNotice(null)
    setSpotlightStatus('idle')
    setSpotlightStatusMessage(null)

    try {
      const res = await artistsApi.updateMyProfile({
        pinnedReleaseId: null,
        pinnedComment: null,
      })
      setArtistProfile(res.profile)
      setSpotlightReleaseId('')
      setSpotlightComment('')
      const msg = 'Artist Pick reset to automatic latest release.'
      setSuccessNotice(msg)
      setSpotlightStatus('cleared')
      setSpotlightStatusMessage('Reset to automatic latest release fallback.')
      setTimeout(() => {
        setSpotlightStatus((prev) => (prev === 'cleared' ? 'idle' : prev))
      }, 4000)
    } catch (err: any) {
      const errMsg = err.message || 'Failed to reset spotlight'
      setErrorNotice(errMsg)
      setSpotlightStatus('error')
      setSpotlightStatusMessage(errMsg)
    } finally {
      setIsSavingSpotlight(false)
    }
  }

  // Handle Discard Spotlight Changes
  const handleDiscardSpotlightChanges = () => {
    if (!artistProfile) return
    setSpotlightReleaseId(artistProfile.pinnedReleaseId || '')
    setSpotlightComment(artistProfile.pinnedComment || '')
    setSpotlightStatus('idle')
    setSpotlightStatusMessage(null)
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
    <div className="max-w-5xl mx-auto px-3.5 sm:px-6 lg:px-8 py-5 sm:py-8 w-full overflow-x-hidden min-w-0">
      {/* Toast Alerts */}
      {successNotice && (
        <div className="p-3.5 mb-6 border border-success/40 bg-success-soft text-success font-mono text-caption shadow-raised rounded-control">
          {successNotice}
        </div>
      )}
      {errorNotice && (
        <div className="p-3.5 mb-6 border border-destructive/40 bg-destructive-soft text-destructive font-mono text-caption shadow-raised rounded-control">
          {errorNotice}
        </div>
      )}

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
      {activeTab === 'releases' && (
        <div className="space-y-10">
          {/* Top Overview */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-serif italic text-xl sm:text-2xl text-foreground font-semibold">
                Master Releases & Recordings
              </h2>
              <p className="font-sans text-caption text-muted-foreground mt-0.5">
                Manage your studio master tapes, published albums, and
                standalone singles.
              </p>
            </div>
          </div>

          {/* Unified Master Release Modal / Drawer */}
          {isCreateReleaseOpen && (
            <CreateReleaseDrawer
              artistProfile={artistProfile}
              onClose={() => setIsCreateReleaseOpen(false)}
              onSuccess={setSuccessNotice}
              onError={setErrorNotice}
              onReleasesChanged={loadReleases}
            />
          )}

          {/* Releases List */}
          <div className="space-y-4">
            <h3 className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground">
              Active Releases ({albums.length})
            </h3>

            {isLoadingReleases ? (
              <div className="p-8 text-center font-mono text-caption text-muted-foreground animate-pulse">
                Querying studio releases...
              </div>
            ) : albums.length === 0 ? (
              <div className="p-10 border border-dashed border-border bg-card text-center">
                <Disc3 className="w-10 h-10 text-muted-foreground/40 mx-auto mb-2 shrink-0" />
                <p className="font-serif italic text-title text-foreground">
                  No active master releases yet
                </p>
                <p className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground mt-1">
                  Click "+ New Release" above to release your first album, EP or
                  single.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {albums.map((album) => {
                  const isExpanded = expandedAlbumId === album.id
                  const tracks = albumTrackMap[album.id] || []

                  return (
                    <ReleaseCard
                      key={album.id}
                      album={album}
                      tracks={tracks}
                      isLoadingTracks={isLoadingAlbumTracks}
                      isExpanded={isExpanded}
                      isVisibilityMenuOpen={visibilityMenuId === album.id}
                      onToggleVisibilityMenu={() =>
                        setVisibilityMenuId((cur) =>
                          cur === album.id ? null : album.id,
                        )
                      }
                      onCloseVisibilityMenu={() => setVisibilityMenuId(null)}
                      onChangeVisibility={(nextVisibility) =>
                        handleQuickChangeVisibility(album, nextVisibility)
                      }
                      onToggleExpand={() => handleToggleAlbumExpand(album.id)}
                      onCopySecretLink={() => {
                        const shareUrl = `${window.location.origin}/albums/${album.slug}?shareToken=${album.shareToken}`
                        navigator.clipboard.writeText(shareUrl)
                        setSuccessNotice(
                          `Copied secret share link for "${album.title}"!`,
                        )
                      }}
                      onEdit={() => setEditingAlbum(album)}
                      onDelete={() =>
                        handleDeleteAlbum(
                          album.id,
                          album.title,
                          album.totalTracks || tracks.length || 1,
                        )
                      }
                      onDetachCut={(track) => handleOpenDetachModal(track, album)}
                      onDeleteCut={(track) =>
                        handleDeleteSong(
                          track.id,
                          track.title,
                          album.id,
                          tracks.length,
                        )
                      }
                    />
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: 30-DAY TRASH & ARCHIVE */}
      {/* ========================================================================= */}
      {activeTab === 'trash' && (
        <div className="space-y-6">
          <div className="p-4 border border-warning/40 bg-warning-soft text-warning font-sans text-caption flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="font-eyebrow text-eyebrow uppercase tracking-widest font-semibold block mb-0.5">
                30-Day Recovery Guarantee
              </span>
              <p className="leading-relaxed">
                Archived releases and master recordings are retained in this
                safe vault for 30 days before irreversible purging. You can
                restore them to your active catalog at any time, or permanently
                purge them.
              </p>
            </div>
            {(trashAlbums.length > 0 || trashSongs.length > 0) && (
              <button
                type="button"
                disabled={isPurging}
                onClick={() => setTrashConfirm({ type: 'empty' })}
                className="font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-4 border border-destructive/40 bg-destructive-soft hover:bg-destructive/20 text-destructive transition-colors font-semibold cursor-pointer shrink-0"
              >
                {isPurging ? 'Emptying...' : 'Empty Trash'}
              </button>
            )}
          </div>

          <div className="space-y-4">
            <h3 className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground">
              Archived Releases ({trashAlbums.length})
            </h3>

            {isLoadingTrash ? (
              <div className="p-6 text-center font-mono text-caption text-muted-foreground animate-pulse">
                Loading trash archive...
              </div>
            ) : trashAlbums.length === 0 ? (
              <div className="p-6 border border-border bg-card text-center font-mono text-caption text-muted-foreground rounded-control">
                Trash is empty. No deleted albums found.
              </div>
            ) : (
              <div className="space-y-3">
                {trashAlbums.map((album) => (
                  <div
                    key={album.id}
                    className="p-4 border border-border rounded-control bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <h4 className="font-sans font-semibold text-body sm:text-title text-foreground truncate min-w-0">
                          {album.title}
                        </h4>
                        <span className="font-eyebrow text-eyebrow uppercase tracking-wider px-1.5 py-0.5 bg-background border border-border text-muted-foreground rounded-control shrink-0">
                          {album.albumType}
                        </span>
                      </div>
                      <span className="font-mono text-eyebrow text-muted-foreground mt-0.5 block">
                        Deleted:{' '}
                        {album.deletedAt
                          ? new Date(album.deletedAt).toLocaleDateString()
                          : 'Recently'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleRestoreAlbum(album.id)}
                        className="font-eyebrow rounded-control text-eyebrow uppercase tracking-wider py-2 px-3.5 bg-foreground text-background hover:opacity-90 cursor-pointer flex items-center gap-1.5"
                      >
                        <RotateCcw className="w-3 h-3 shrink-0" />
                        <span>Restore Release</span>
                      </button>
                      <button
                        type="button"
                        disabled={isPurging}
                        onClick={() =>
                          setTrashConfirm({
                            type: 'permanent_release',
                            id: album.id,
                            title: album.title,
                          })
                        }
                        className="font-eyebrow rounded-control text-eyebrow uppercase tracking-wider py-2 px-3 border border-destructive/40 hover:bg-destructive/20 text-destructive font-semibold cursor-pointer transition-colors"
                      >
                        Delete Forever
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Archived Songs */}
          {trashSongs.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-border-soft">
              <h3 className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground">
                Archived Master Cuts ({trashSongs.length})
              </h3>

              <div className="space-y-2">
                {trashSongs.map((song) => (
                  <div
                    key={song.id}
                    className="p-3 border border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <span className="font-sans font-semibold text-body text-foreground truncate block">
                        {song.title}
                      </span>
                      <span className="font-mono text-eyebrow text-muted-foreground">
                        Deleted:{' '}
                        {song.deletedAt
                          ? new Date(song.deletedAt).toLocaleDateString()
                          : 'Recently'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleRestoreSong(song.id)}
                        className="font-eyebrow text-eyebrow uppercase tracking-wider py-1.5 px-3 border border-border bg-background hover:border-foreground text-foreground cursor-pointer flex items-center gap-1"
                      >
                        <RotateCcw className="w-3 h-3 shrink-0" />
                        <span>Restore</span>
                      </button>
                      <button
                        type="button"
                        disabled={isPurging}
                        onClick={() =>
                          setTrashConfirm({
                            type: 'permanent_song',
                            id: song.id,
                            title: song.title,
                          })
                        }
                        className="font-eyebrow text-eyebrow uppercase tracking-wider py-1.5 px-3 border border-destructive/40 hover:bg-destructive/20 text-destructive font-semibold cursor-pointer transition-colors"
                      >
                        Delete Forever
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: PROFILE & BRANDING */}
      {/* ========================================================================= */}
      {activeTab === 'profile' && (
        <div className="space-y-10">
          {/* Avatar Customizer */}
          <div className="p-6 border border-border bg-card shadow-raised">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
              <div>
                <h2 className="font-serif italic text-heading text-foreground">
                  Artist Avatar / Profile Picture
                </h2>
                <p className="font-sans text-caption text-muted-foreground mt-0.5">
                  Square profile artwork used for artist credits, jam sessions,
                  and search results.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {artistProfile.avatarUrl && (
                  <button
                    type="button"
                    disabled={isUploadingAvatar}
                    onClick={handleRemoveAvatar}
                    className="font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-3 border border-border bg-background hover:border-destructive hover:text-destructive text-muted-foreground transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Remove
                  </button>
                )}
                <button
                  type="button"
                  disabled={isUploadingAvatar}
                  onClick={() => avatarInputRef.current?.click()}
                  className="font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-4 bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-2 self-start sm:self-auto shrink-0 shadow-xs"
                >
                  <UploadCloud className="w-4 h-4 shrink-0" />
                  <span>
                    {isUploadingAvatar ? 'Uploading...' : 'Upload Avatar'}
                  </span>
                </button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/avif"
                  onChange={handleAvatarSelect}
                  className="hidden"
                />
              </div>
            </div>

            <div className="flex items-center gap-5">
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border border-border bg-muted overflow-hidden relative shrink-0 flex items-center justify-center shadow-inner">
                {artistProfile.avatarUrl ? (
                  <img
                    src={artistProfile.avatarUrl}
                    alt={artistProfile.stageName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="font-serif italic text-3xl sm:text-4xl text-muted-foreground select-none">
                    {artistProfile.stageName.charAt(0).toUpperCase()}
                  </span>
                )}
                {isUploadingAvatar && (
                  <div className="absolute inset-0 bg-background/80 backdrop-blur-xs flex items-center justify-center font-mono text-eyebrow text-foreground animate-pulse text-center p-1">
                    Uploading...
                  </div>
                )}
              </div>

              <div className="font-mono text-caption text-muted-foreground space-y-1">
                <div className="text-foreground font-serif italic text-title">
                  {artistProfile.stageName}
                </div>
                <p className="text-eyebrow text-muted-foreground/80">
                  Recommended: Minimum 500 × 500px square image. An interactive
                  cropper with circular guide is provided before upload.
                </p>
              </div>
            </div>
          </div>

          {/* Banner Customizer */}
          <div className="p-6 border border-border bg-card shadow-raised">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="font-serif italic text-heading text-foreground">
                  Artist Profile Banner
                </h2>
                <p className="font-sans text-caption text-muted-foreground mt-0.5">
                  Panoramic cover displayed across your public artist page.
                  Interactive cropping and framing preview is provided before
                  upload.
                </p>
              </div>

              <button
                type="button"
                disabled={isUploadingBanner}
                onClick={() => bannerInputRef.current?.click()}
                className="font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-4 bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-2 self-start sm:self-auto shrink-0"
              >
                <UploadCloud className="w-4 h-4 shrink-0" />
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

            <div className="w-full h-44 sm:h-56 bg-muted border border-border overflow-hidden relative">
              {artistProfile.bannerUrl ? (
                <img
                  src={artistProfile.bannerUrl}
                  alt="Artist banner"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground font-mono text-caption">
                  <UploadCloud className="w-8 h-8 opacity-40 mb-2 shrink-0" />
                  <span>No banner uploaded yet</span>
                </div>
              )}
              {isUploadingBanner && (
                <div className="absolute inset-0 bg-background/80 backdrop-blur-xs flex items-center justify-center font-mono text-caption text-foreground animate-pulse">
                  Transferring asset to Cloudflare R2 storage...
                </div>
              )}
            </div>
          </div>

          {/* Identity & Details Editor */}
          <div className="p-6 border border-border bg-card shadow-raised">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-border-soft">
              <div>
                <h2 className="font-serif italic text-heading text-foreground">
                  Identity & Presentation
                </h2>
                <p className="font-sans text-caption text-muted-foreground mt-0.5">
                  Customize your public stage name, biography, and external
                  links.
                </p>
              </div>

              {!isEditingProfile && (
                <button
                  type="button"
                  onClick={() => setIsEditingProfile(true)}
                  className="font-eyebrow text-eyebrow uppercase tracking-wider py-1.5 px-3 border border-border bg-background hover:border-foreground text-foreground transition-colors cursor-pointer"
                >
                  Edit Details
                </button>
              )}
            </div>

            {isEditingProfile ? (
              <form
                onSubmit={handleSaveProfile}
                className="flex flex-col gap-5"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground block mb-1.5">
                      Stage Name
                    </label>
                    <input
                      type="text"
                      required
                      value={editStageName}
                      onChange={(e) => setEditStageName(e.target.value)}
                      className="w-full font-serif italic text-body py-2 px-3 border border-border bg-background text-foreground focus:outline-none focus:border-foreground"
                    />
                  </div>

                  <div>
                    <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground block mb-1.5">
                      Vanity Slug
                    </label>
                    <input
                      type="text"
                      required
                      value={editSlug}
                      onChange={(e) => setEditSlug(e.target.value)}
                      className="w-full font-mono text-caption py-2 px-3 border border-border bg-background text-foreground focus:outline-none focus:border-foreground"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground block mb-1.5">
                    Biography
                  </label>
                  <textarea
                    rows={4}
                    value={editBio}
                    onChange={(e) => setEditBio(e.target.value)}
                    className="w-full font-sans text-caption py-2 px-3 border border-border bg-background text-foreground focus:outline-none focus:border-foreground resize-y leading-relaxed"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block mb-1">
                      Instagram
                    </label>
                    <input
                      type="url"
                      value={editInstagram}
                      onChange={(e) => setEditInstagram(e.target.value)}
                      placeholder="https://instagram.com/..."
                      className="w-full font-mono text-caption py-1.5 px-2.5 border border-border bg-background text-foreground"
                    />
                  </div>
                  <div>
                    <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block mb-1">
                      Website
                    </label>
                    <input
                      type="url"
                      value={editWebsite}
                      onChange={(e) => setEditWebsite(e.target.value)}
                      placeholder="https://..."
                      className="w-full font-mono text-caption py-1.5 px-2.5 border border-border bg-background text-foreground"
                    />
                  </div>
                  <div>
                    <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block mb-1">
                      Spotify
                    </label>
                    <input
                      type="url"
                      value={editSpotify}
                      onChange={(e) => setEditSpotify(e.target.value)}
                      placeholder="https://open.spotify.com/..."
                      className="w-full font-mono text-caption py-1.5 px-2.5 border border-border bg-background text-foreground"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={isSavingEdit}
                    className="font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-5 bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
                  >
                    {isSavingEdit ? 'Saving...' : 'Save Profile Changes'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingProfile(false)}
                    className="font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-4 border border-border text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex flex-col gap-4 text-caption font-sans text-foreground">
                <div>
                  <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block mb-1">
                    Biography
                  </span>
                  <p className="leading-relaxed whitespace-pre-line text-muted-foreground">
                    {artistProfile.bio || 'No biography set yet.'}
                  </p>
                </div>

                {artistProfile.socialLinks &&
                  Object.keys(artistProfile.socialLinks).length > 0 && (
                    <div>
                      <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block mb-2">
                        Social Channels
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(artistProfile.socialLinks).map(
                          ([k, v]) => (
                            <a
                              key={k}
                              href={v}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-eyebrow py-1 px-2.5 border border-border bg-background hover:border-foreground text-foreground capitalize inline-flex items-center gap-1"
                            >
                              <span>{k}</span>
                              <ExternalLink className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
                            </a>
                          ),
                        )}
                      </div>
                    </div>
                  )}
              </div>
            )}
          </div>

          {/* Artist Spotlight & Pick Customizer */}
          {(() => {
            const currentPinnedRelease = artistProfile.pinnedReleaseId
              ? albums.find((a) => a.id === artistProfile.pinnedReleaseId)
              : null
            const isSpotlightDirty =
              spotlightReleaseId !== (artistProfile.pinnedReleaseId || '') ||
              spotlightComment.trim() !== (artistProfile.pinnedComment || '')

            return (
              <div className="p-6 sm:p-7 border border-border bg-card shadow-raised space-y-6 relative rounded-control">
                {/* Header & Status Indicator */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-soft">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-primary font-semibold px-2 py-0.5 rounded-control border border-primary/30 bg-primary/10">
                        ✦ Profile Spotlight
                      </span>
                      {artistProfile.pinnedReleaseId ? (
                        <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-primary bg-primary/10 border border-primary/30 px-2 py-0.5 rounded-control flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                          <span>
                            Active:{' '}
                            {currentPinnedRelease
                              ? `"${currentPinnedRelease.title}"`
                              : 'Custom Pick'}
                          </span>
                        </span>
                      ) : (
                        <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground bg-background border border-border px-2 py-0.5 rounded-control flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-success" />
                          <span>Active: Automatic Latest Drop</span>
                        </span>
                      )}
                      {isSpotlightDirty && (
                        <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-warning bg-warning-soft border border-warning/30 px-2 py-0.5 rounded-control flex items-center gap-1 font-semibold animate-pulse">
                          <span className="w-1.5 h-1.5 rounded-full bg-warning" />
                          <span>Unsaved Changes</span>
                        </span>
                      )}
                    </div>
                    <h2 className="font-serif italic text-heading text-foreground">
                      Artist Pick &amp; Spotlight
                    </h2>
                    <p className="font-sans text-caption text-muted-foreground mt-0.5 max-w-xl">
                      Feature a chosen release and personal note at the top of
                      your public artist profile. When none is selected, your
                      newest release is showcased automatically.
                    </p>
                  </div>

                  {artistProfile.pinnedReleaseId && (
                    <button
                      type="button"
                      disabled={isSavingSpotlight}
                      onClick={handleClearSpotlight}
                      className="font-eyebrow text-eyebrow uppercase tracking-wider py-1.5 px-3 border border-border bg-background hover:border-destructive hover:text-destructive text-muted-foreground transition-colors cursor-pointer self-start sm:self-auto rounded-control shrink-0"
                    >
                      Reset to Latest Release
                    </button>
                  )}
                </div>

                {/* Inline Confirmation Alert Strip */}
                {spotlightStatus === 'saved' && (
                  <div className="flex items-center justify-between gap-3 p-3.5 bg-success-soft border border-success/40 rounded-control text-success font-mono text-caption shadow-raised animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-5 h-5 rounded-full bg-success text-success-foreground flex items-center justify-center shrink-0 font-bold text-caption">
                        ✓
                      </span>
                      <div className="min-w-0">
                        <span className="font-semibold block truncate">
                          Spotlight Saved &amp; Synced!
                        </span>
                        <span className="font-sans text-eyebrow opacity-80 block truncate">
                          {spotlightStatusMessage ||
                            'Your public artist profile has been updated.'}
                        </span>
                      </div>
                    </div>
                    {artistProfile.slug && (
                      <Link
                        to="/artists/$idOrSlug"
                        params={{ idOrSlug: artistProfile.slug }}
                        target="_blank"
                        className="font-eyebrow text-eyebrow uppercase tracking-wider py-1 px-2.5 border border-success bg-background/50 hover:bg-success/20 rounded-control transition-colors shrink-0 flex items-center gap-1"
                      >
                        <span>View Live</span>
                        <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                      </Link>
                    )}
                  </div>
                )}

                {spotlightStatus === 'cleared' && (
                  <div className="flex items-center gap-2.5 p-3.5 bg-primary/10 border border-primary/30 rounded-control text-primary font-mono text-caption shadow-raised animate-in fade-in slide-in-from-top-1 duration-200">
                    <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 font-bold text-caption">
                      ✓
                    </span>
                    <div>
                      <span className="font-semibold block">
                        Spotlight Reset to Dynamic Mode
                      </span>
                      <span className="font-sans text-eyebrow opacity-80 block">
                        Your public profile will now dynamically showcase your
                        newest catalog release.
                      </span>
                    </div>
                  </div>
                )}

                {spotlightStatus === 'error' && (
                  <div className="flex items-center gap-2.5 p-3.5 bg-destructive-soft border border-destructive/40 rounded-control text-destructive font-mono text-caption shadow-raised animate-in fade-in slide-in-from-top-1 duration-200">
                    <span className="w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shrink-0 font-bold text-caption">
                      ✕
                    </span>
                    <div>
                      <span className="font-semibold block">
                        Failed to Update Spotlight
                      </span>
                      <span className="font-sans text-eyebrow opacity-80 block">
                        {spotlightStatusMessage ||
                          'An unexpected error occurred while saving.'}
                      </span>
                    </div>
                  </div>
                )}

                <form
                  onSubmit={handleSaveSpotlight}
                  className="flex flex-col gap-6"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* Release Selector */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground font-medium">
                          Spotlighted Release
                        </label>
                        {isLoadingReleases && (
                          <span className="font-mono text-eyebrow text-muted-foreground animate-pulse">
                            Loading catalog...
                          </span>
                        )}
                      </div>
                      <select
                        value={spotlightReleaseId}
                        onChange={(e) => {
                          setSpotlightReleaseId(e.target.value)
                          setSpotlightStatus('idle')
                        }}
                        className="w-full font-serif italic text-body py-2 px-3 border border-border bg-background text-foreground focus:outline-none focus:border-foreground rounded-control transition-colors"
                      >
                        <option value="">
                          -- Automatic Default: Always show latest release --
                        </option>
                        {albums.map((alb) => (
                          <option key={alb.id} value={alb.id}>
                            {alb.title} ({alb.albumType || 'Release'} &bull;{' '}
                            {alb.releaseDate
                              ? new Date(alb.releaseDate).getFullYear()
                              : 'Upcoming'}
                            )
                          </option>
                        ))}
                      </select>
                      <p className="font-sans text-eyebrow text-muted-foreground mt-1.5">
                        {spotlightReleaseId
                          ? 'Pinned release stays locked at the top of your right column until changed or deleted.'
                          : 'Dynamic mode: Groovy automatically presents your newest published drop.'}
                      </p>
                      {albums.length === 0 && !isLoadingReleases && (
                        <p className="font-mono text-eyebrow text-warning mt-1">
                          No published releases found yet. Upload a single or
                          album in the Releases tab to feature it here.
                        </p>
                      )}
                    </div>

                    {/* Optional Comment / Note */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground font-medium">
                          Artist Note / Quote (Optional)
                        </label>
                        {spotlightReleaseId && (
                          <span
                            className={`font-mono text-eyebrow ${
                              spotlightComment.length > 250
                                ? 'text-warning font-semibold'
                                : 'text-muted-foreground'
                            }`}
                          >
                            {spotlightComment.length}/280
                          </span>
                        )}
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          maxLength={280}
                          value={spotlightComment}
                          disabled={!spotlightReleaseId}
                          onChange={(e) => {
                            setSpotlightComment(e.target.value)
                            setSpotlightStatus('idle')
                          }}
                          placeholder={
                            spotlightReleaseId
                              ? 'e.g. Turn the volume up! Celebrating our new drop with you all.'
                              : 'Select a specific release first to add a custom quote'
                          }
                          className="w-full font-sans text-caption py-2 pl-3 pr-8 border border-border bg-background text-foreground focus:outline-none focus:border-foreground disabled:opacity-50 disabled:bg-muted rounded-control transition-colors"
                        />
                        {spotlightReleaseId && spotlightComment && (
                          <button
                            type="button"
                            onClick={() => {
                              setSpotlightComment('')
                              setSpotlightStatus('idle')
                            }}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-caption font-mono cursor-pointer"
                            title="Clear note"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      <p className="font-sans text-eyebrow text-muted-foreground mt-1.5">
                        {spotlightReleaseId
                          ? 'Appears in italic quotation marks directly above the release card.'
                          : 'Notes are exclusive to manually pinned releases.'}
                      </p>
                    </div>
                  </div>

                  {/* Live Preview of the Spotlight Card */}
                  {(() => {
                    const previewRelease = spotlightReleaseId
                      ? albums.find((a) => a.id === spotlightReleaseId)
                      : albums[0]

                    if (!previewRelease) {
                      return (
                        <div className="pt-2">
                          <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block mb-2">
                            Public Profile Live Preview
                          </span>
                          <div className="max-w-md border border-dashed border-border rounded-control bg-background/40 p-5 text-center text-muted-foreground font-mono text-caption">
                            Upload a release to preview the spotlight card here.
                          </div>
                        </div>
                      )
                    }

                    return (
                      <div className="pt-2">
                        <div className="flex items-center justify-between gap-2 max-w-md mb-2">
                          <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block">
                            Public Profile Live Preview &bull; Right Column Top
                          </span>
                          {artistProfile.slug && (
                            <Link
                              to="/artists/$idOrSlug"
                              params={{ idOrSlug: artistProfile.slug }}
                              target="_blank"
                              className="font-eyebrow text-eyebrow uppercase tracking-wider text-primary hover:underline inline-flex items-center gap-1"
                            >
                              <span>View Live Profile</span>
                              <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                            </Link>
                          )}
                        </div>

                        <div className="max-w-md border border-border rounded-control bg-background p-4 sm:p-5 shadow-raised space-y-3">
                          <div className="flex items-center justify-between gap-2 border-b border-border-soft pb-2.5">
                            <div className="flex items-center gap-2">
                              {artistProfile.avatarUrl && (
                                <div className="w-5 h-5 rounded-full overflow-hidden border border-border bg-background shrink-0">
                                  <img
                                    src={artistProfile.avatarUrl}
                                    alt={artistProfile.stageName}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              )}
                              <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-primary font-semibold flex items-center gap-1.5">
                                <span>
                                  {spotlightReleaseId
                                    ? '✦ Artist Pick'
                                    : '✦ Latest Drop'}
                                </span>
                              </span>
                            </div>
                            {previewRelease.albumType && (
                              <span className="font-eyebrow text-eyebrow uppercase tracking-wider px-1.5 py-0.5 rounded-control border border-border bg-background text-muted-foreground">
                                {previewRelease.albumType}
                              </span>
                            )}
                          </div>

                          {spotlightReleaseId && spotlightComment.trim() && (
                            <p className="font-serif italic text-caption text-foreground/90 leading-relaxed bg-card p-2.5 rounded-control border border-border-soft">
                              "{spotlightComment.trim()}"
                            </p>
                          )}

                          <div className="flex items-center gap-3.5 group">
                            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-control bg-muted border border-border shrink-0 overflow-hidden relative shadow-xs">
                              {previewRelease.coverImageUrl ? (
                                <img
                                  src={previewRelease.coverImageUrl}
                                  alt={previewRelease.title}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <ProceduralCover
                                  size="sm"
                                  title={previewRelease.title}
                                  artistName={artistProfile.stageName}
                                  className="w-full h-full rounded-none"
                                />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <h4 className="font-sans font-semibold text-body sm:text-title text-foreground truncate">
                                {previewRelease.title}
                              </h4>
                              <p className="font-mono text-eyebrow text-muted-foreground truncate mt-0.5">
                                {previewRelease.releaseDate
                                  ? new Date(
                                      previewRelease.releaseDate,
                                    ).getFullYear()
                                  : 'Recent'}{' '}
                                &bull; {previewRelease.totalTracks}{' '}
                                {previewRelease.totalTracks === 1
                                  ? 'cut'
                                  : 'cuts'}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Actions Bar */}
                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={isSavingSpotlight}
                      className={`font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-5 transition-all cursor-pointer rounded-control flex items-center gap-2 ${
                        spotlightStatus === 'saved'
                          ? 'bg-success text-success-foreground border border-success shadow-sm'
                          : isSpotlightDirty
                            ? 'bg-foreground text-background hover:bg-primary hover:text-primary-foreground shadow-sm'
                            : 'bg-foreground text-background hover:opacity-90'
                      } disabled:opacity-50`}
                    >
                      {isSavingSpotlight ? (
                        <>
                          <span className="w-3 h-3 border-2 border-background border-t-transparent rounded-full animate-spin inline-block" />
                          <span>Saving Changes...</span>
                        </>
                      ) : spotlightStatus === 'saved' ? (
                        <>
                          <span>✓ Saved to Profile!</span>
                        </>
                      ) : isSpotlightDirty ? (
                        <>
                          <span>Save Artist Pick</span>
                          <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
                        </>
                      ) : (
                        <span>Save Artist Pick</span>
                      )}
                    </button>

                    {isSpotlightDirty && (
                      <button
                        type="button"
                        onClick={handleDiscardSpotlightChanges}
                        disabled={isSavingSpotlight}
                        className="font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-4 border border-border bg-background hover:bg-card text-muted-foreground transition-colors cursor-pointer rounded-control"
                      >
                        Revert Changes
                      </button>
                    )}
                  </div>
                </form>
              </div>
            )
          })()}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: VERIFICATION DESK */}
      {/* ========================================================================= */}
      {activeTab === 'verification' && (
        <div className="p-6 border border-border bg-card shadow-raised">
          <div className="mb-6 pb-4 border-b border-border-soft">
            <h2 className="font-serif italic text-heading text-foreground">
              Creator Verification
            </h2>
            <p className="font-sans text-caption text-muted-foreground mt-0.5">
              Verified badges certify official recording artists and unlock
              prominent catalog placement.
            </p>
          </div>

          {artistProfile.verificationStatus === 'VERIFIED' ? (
            <div className="p-6 border border-primary/20 bg-primary/5 flex items-center gap-4">
              <BadgeCheck className="w-8 h-8 text-primary shrink-0 shrink-0" />
              <div>
                <h3 className="font-serif italic text-title text-foreground">
                  Officially Verified Artist
                </h3>
                <p className="font-sans text-caption text-muted-foreground mt-0.5">
                  Your artist profile has been verified by the administration
                  desk. The verified emblem is active on your public profile and
                  catalog releases.
                </p>
              </div>
            </div>
          ) : artistProfile.verificationStatus === 'PENDING' ? (
            <div className="p-6 border border-warning/40 bg-warning-soft flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-warning animate-ping" />
                <h3 className="font-serif italic text-title text-foreground">
                  Application Under Review
                </h3>
              </div>
              <p className="font-sans text-caption text-muted-foreground leading-relaxed">
                Your verification application was received and is queued for
                administrative audit. Proof links and official artist identities
                are usually reviewed within 24-48 hours.
              </p>
              {artistProfile.verificationDetails?.message && (
                <div className="mt-2 p-3 border border-border-soft bg-background/60 font-sans text-caption text-muted-foreground italic">
                  "{artistProfile.verificationDetails.message}"
                </div>
              )}
            </div>
          ) : artistProfile.verificationStatus === 'REJECTED' &&
            !showResubmitForm ? (
            <div className="p-6 border border-destructive/60 bg-destructive-soft flex flex-col gap-4">
              <div>
                <h3 className="font-serif italic text-title text-destructive">
                  Application Needs Revision
                </h3>
                <p className="font-sans text-caption text-muted-foreground mt-1">
                  The administrative review requested adjustments to your
                  verification materials:
                </p>
                <div className="mt-2 p-3 border border-destructive/40 bg-background font-mono text-caption text-destructive">
                  {artistProfile.rejectionReason ||
                    'Please provide verifiable official links.'}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowResubmitForm(true)
                  setVerifyPitch(
                    artistProfile.verificationDetails?.message || '',
                  )
                  if (artistProfile.verificationDetails?.links) {
                    setVerifyLinks(artistProfile.verificationDetails.links)
                  }
                }}
                className="self-start font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-4 bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
              >
                Update & Resubmit Application &rarr;
              </button>
            </div>
          ) : (
            <form
              onSubmit={handleSubmitVerification}
              className="flex flex-col gap-5"
            >
              <div>
                <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground block mb-1.5">
                  Verification Pitch / Artist Background{' '}
                  <span className="text-destructive">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={verifyPitch}
                  onChange={(e) => setVerifyPitch(e.target.value)}
                  placeholder="Briefly describe your musical career, past releases, live performances, or label affiliations..."
                  className="w-full font-sans text-caption py-2.5 px-3 border border-border bg-background text-foreground focus:outline-none focus:border-foreground resize-y leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground block mb-1.5">
                    Contact Email
                  </label>
                  <input
                    type="email"
                    value={verifyContactEmail}
                    onChange={(e) => setVerifyContactEmail(e.target.value)}
                    placeholder="artist@example.com"
                    className="w-full font-mono text-caption py-2 px-3 border border-border bg-background text-foreground"
                  />
                </div>
                <div>
                  <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground block mb-1.5">
                    Contact Phone (Optional)
                  </label>
                  <input
                    type="tel"
                    value={verifyContactPhone}
                    onChange={(e) => setVerifyContactPhone(e.target.value)}
                    placeholder="+1 555-0199"
                    className="w-full font-mono text-caption py-2 px-3 border border-border bg-background text-foreground"
                  />
                </div>
              </div>

              <div>
                <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground block mb-1.5">
                  Official Proof & Portfolio Links{' '}
                  <span className="text-destructive">*</span>
                </label>
                <p className="font-sans text-caption text-muted-foreground mb-3">
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
                        className="flex-1 font-mono text-caption py-2 px-3 border border-border bg-background text-foreground"
                      />
                      {verifyLinks.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            setVerifyLinks(
                              verifyLinks.filter((_, i) => i !== idx),
                            )
                          }}
                          className="font-mono text-caption py-2 px-3 border border-border text-muted-foreground hover:text-destructive hover:border-destructive cursor-pointer"
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
                      className="self-start font-eyebrow text-eyebrow uppercase tracking-wider py-1.5 px-3 border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground cursor-pointer mt-1"
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
                  className="font-eyebrow text-eyebrow uppercase tracking-wider py-2.5 px-6 bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 font-semibold"
                >
                  {isSubmittingVerify
                    ? 'Submitting...'
                    : 'Submit Verification Request'}
                </button>
                {showResubmitForm && (
                  <button
                    type="button"
                    onClick={() => setShowResubmitForm(false)}
                    className="font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-4 border border-border text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      )}

      {/* Detach Cut Modal */}
      {detachModalData && (
        <DetachCutDrawer
          request={detachModalData}
          onClose={() => setDetachModalData(null)}
          onSuccess={setSuccessNotice}
          onError={setErrorNotice}
          onReleasesChanged={loadReleases}
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
          onSuccess={setSuccessNotice}
          onError={setErrorNotice}
          onReleasesChanged={loadReleases}
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

      {/* ===================== VIEWPORT-WIDE FLOATING TOAST ===================== */}
      {(successNotice || errorNotice) && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-[calc(env(safe-area-inset-bottom)+8rem)] sm:bottom-12 left-1/2 -translate-x-1/2 z-50 font-eyebrow text-eyebrow uppercase tracking-wider py-3 px-6 shadow-2xl rounded-control pointer-events-none transition-all duration-200 border flex items-center gap-3 max-w-[92vw] text-center backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 ${
            errorNotice
              ? 'bg-destructive text-destructive-foreground border-destructive/50'
              : 'bg-success text-success-foreground border-success/50'
          }`}
        >
          <span className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 bg-background/25">
            {errorNotice ? (
              <X className="w-3 h-3" />
            ) : (
              <Check className="w-3 h-3" />
            )}
          </span>
          <span className="truncate">{errorNotice || successNotice}</span>
        </div>
      )}
    </div>
  )
}
