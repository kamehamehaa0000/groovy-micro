import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '../stores/auth.store'
import { artistsApi, slugifyText } from '../lib/artists.api'
import { catalogApi, formatDuration } from '../lib/catalog.api'
import type { ArtistProfile } from '../types/artist'
import type { Album, Song, AlbumType } from '../types/catalog'
import {
  VerifiedBadgeSVG,
  ExternalLinkSVG,
  UploadCloudSVG,
  DiscIconSVG,
  TrashIconSVG,
  UndoIconSVG,
  PlusIconSVG,
} from '../components/icons'
import {
  ArtistCreditPicker,
  type SelectedCredit,
} from '../components/ArtistCreditPicker'

export const Route = createFileRoute('/studio')({
  component: StudioComponent,
})

type StudioTab = 'releases' | 'trash' | 'profile' | 'verification'

interface TrackDraft {
  id: string
  title: string
  genre: string
  durationSeconds: number
  isExplicit: boolean
  rawAudioKey?: string
  audioUrl?: string
  audioFileName?: string
  coverImageUrl?: string
  isUploadingAudio?: boolean
  credits: SelectedCredit[]
}

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
  const [releaseTitle, setReleaseTitle] = useState('')
  const [releaseType, setReleaseType] = useState<AlbumType>('SINGLE')
  const [releaseDescription, setReleaseDescription] = useState('')
  const [releaseCoverUrl, setReleaseCoverUrl] = useState('')
  const [isUploadingCover, setIsUploadingCover] = useState(false)
  const [isSubmittingRelease, setIsSubmittingRelease] = useState(false)
  const coverInputRef = useRef<HTMLInputElement>(null)

  // Detach Cut Modal State
  const [detachModalData, setDetachModalData] = useState<{
    song: Song
    parentAlbum: Album
  } | null>(null)
  const [detachCoverUrl, setDetachCoverUrl] = useState('')
  const [isUploadingDetachCover, setIsUploadingDetachCover] = useState(false)
  const [isSubmittingDetach, setIsSubmittingDetach] = useState(false)
  const detachCoverInputRef = useRef<HTMLInputElement>(null)

  // Single-release specific fields (when releaseType === 'SINGLE')
  const [singleTrackGenre, setSingleTrackGenre] = useState('')
  const [singleTrackDuration, setSingleTrackDuration] = useState(0)
  const [singleTrackExplicit, setSingleTrackExplicit] = useState(false)
  const [singleTrackAudioUrl, setSingleTrackAudioUrl] = useState('')
  const [singleTrackAudioKey, setSingleTrackAudioKey] = useState('')
  const [singleTrackAudioFileName, setSingleTrackAudioFileName] = useState('')
  const [isUploadingSingleAudio, setIsUploadingSingleAudio] = useState(false)
  const [singleTrackCredits, setSingleTrackCredits] = useState<SelectedCredit[]>([])
  const singleAudioInputRef = useRef<HTMLInputElement>(null)

  // Multi-track draft cuts (when releaseType !== 'SINGLE')
  const [draftTracks, setDraftTracks] = useState<TrackDraft[]>([])

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

  // Expanded album tracks view in Studio
  const [expandedAlbumId, setExpandedAlbumId] = useState<string | null>(null)
  const [albumTrackMap, setAlbumTrackMap] = useState<Record<string, Song[]>>({})
  const [isLoadingAlbumTracks, setIsLoadingAlbumTracks] = useState(false)

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
      if (activeTab === 'releases') {
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
    setDetachCoverUrl('')
    setErrorNotice(null)
  }

  const handleCloseDetachModal = () => {
    setDetachModalData(null)
    setDetachCoverUrl('')
    if (detachCoverInputRef.current) detachCoverInputRef.current.value = ''
  }

  const handleDetachCoverSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploadingDetachCover(true)
    setErrorNotice(null)

    try {
      const publicUrl = await catalogApi.uploadAlbumCover(file)
      setDetachCoverUrl(publicUrl)
      setSuccessNotice('Custom single artwork uploaded to Cloudflare R2.')
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to upload single artwork')
    } finally {
      setIsUploadingDetachCover(false)
    }
  }

  const handleConfirmDetach = async () => {
    if (!detachModalData) return

    setIsSubmittingDetach(true)
    setErrorNotice(null)

    try {
      await catalogApi.updateSong(detachModalData.song.id, {
        albumId: null,
        coverImageUrl: detachCoverUrl || undefined,
      })

      setSuccessNotice(
        `🎉 Master cut "${detachModalData.song.title}" detached and spun off into standalone SINGLE release!`,
      )

      // Refresh album details and releases
      const fullAlbum = await catalogApi.getAlbum(detachModalData.parentAlbum.id)
      setAlbumTrackMap((prev) => ({
        ...prev,
        [detachModalData.parentAlbum.id]: fullAlbum.tracks,
      }))
      handleCloseDetachModal()
      loadReleases()
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to detach track')
    } finally {
      setIsSubmittingDetach(false)
    }
  }

  // Soft delete album
  const handleDeleteAlbum = async (albumId: string) => {
    if (
      !confirm(
        'Move this release and all its cuts to trash? (Available for 30-day restore)',
      )
    )
      return

    try {
      await catalogApi.deleteAlbum(albumId)
      setSuccessNotice(
        'Release moved to 30-day trash. You can restore it anytime within 30 days.',
      )
      loadReleases()
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to archive release')
    }
  }

  // Soft delete standalone song
  const handleDeleteSong = async (songId: string) => {
    if (
      !confirm(
        'Move this master track to trash? (Available for 30-day restore)',
      )
    )
      return

    try {
      await catalogApi.deleteSong(songId)
      setSuccessNotice('Track moved to 30-day trash.')
      loadReleases()
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to archive track')
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

  // Cover image upload for new release
  const handleCoverSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploadingCover(true)
    setErrorNotice(null)

    try {
      const publicUrl = await catalogApi.uploadAlbumCover(file)
      setReleaseCoverUrl(publicUrl)
      setSuccessNotice('Cover art uploaded to Cloudflare R2.')
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to upload cover art')
    } finally {
      setIsUploadingCover(false)
    }
  }

  // Audio file select for track draft in new release
  const handleDraftAudioSelect = async (
    draftId: string,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0]
    if (!file) return

    setDraftTracks((prev) =>
      prev.map((t) => (t.id === draftId ? { ...t, isUploadingAudio: true } : t)),
    )
    setErrorNotice(null)

    try {
      const { storageKey, publicUrl, durationSeconds } =
        await catalogApi.uploadAudioRaw(file)

      // Auto-populate title if empty
      const cleanName = file.name.replace(/\.[^/.]+$/, '')

      setDraftTracks((prev) =>
        prev.map((t) =>
          t.id === draftId
            ? {
                ...t,
                rawAudioKey: storageKey,
                audioUrl: publicUrl,
                audioFileName: file.name,
                durationSeconds: durationSeconds || t.durationSeconds,
                title: t.title.trim() ? t.title : cleanName,
                isUploadingAudio: false,
              }
            : t,
        ),
      )
      setSuccessNotice(`Master audio "${file.name}" uploaded to R2.`)
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to upload audio cut')
      setDraftTracks((prev) =>
        prev.map((t) =>
          t.id === draftId ? { ...t, isUploadingAudio: false } : t,
        ),
      )
    }
  }

  const handleResetDraftAudio = (draftId: string) => {
    setDraftTracks((prev) =>
      prev.map((t) =>
        t.id === draftId
          ? {
              ...t,
              rawAudioKey: undefined,
              audioUrl: undefined,
              audioFileName: undefined,
              durationSeconds: 0,
            }
          : t,
      ),
    )
  }

  const resetReleaseForm = () => {
    setReleaseTitle('')
    setReleaseType('SINGLE')
    setReleaseDescription('')
    setReleaseCoverUrl('')
    setSingleTrackGenre('')
    setSingleTrackDuration(0)
    setSingleTrackExplicit(false)
    setSingleTrackAudioUrl('')
    setSingleTrackAudioKey('')
    setSingleTrackAudioFileName('')
    setSingleTrackCredits([])
    setDraftTracks([
      {
        id: crypto.randomUUID(),
        title: '',
        genre: '',
        durationSeconds: 0,
        isExplicit: false,
        credits: [],
      },
    ])
    if (coverInputRef.current) coverInputRef.current.value = ''
    if (singleAudioInputRef.current) singleAudioInputRef.current.value = ''
  }

  // Standalone Single Audio Upload
  const handleSingleAudioSelect = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploadingSingleAudio(true)
    setErrorNotice(null)

    try {
      const { storageKey, publicUrl, durationSeconds } =
        await catalogApi.uploadAudioRaw(file)
      setSingleTrackAudioKey(storageKey)
      setSingleTrackAudioUrl(publicUrl)
      setSingleTrackAudioFileName(file.name)
      setSingleTrackDuration(durationSeconds)
      if (!releaseTitle.trim()) {
        setReleaseTitle(file.name.replace(/\.[^/.]+$/, ''))
      }
      setSuccessNotice(`Audio master "${file.name}" added successfully.`)
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to upload audio')
    } finally {
      setIsUploadingSingleAudio(false)
    }
  }

  const handleResetSingleAudio = () => {
    setSingleTrackAudioKey('')
    setSingleTrackAudioUrl('')
    setSingleTrackAudioFileName('')
    setSingleTrackDuration(0)
    if (singleAudioInputRef.current) {
      singleAudioInputRef.current.value = ''
    }
  }

  // Create Release Form Submit (handles both Single releases and Multi-track releases)
  const handlePublishRelease = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!releaseTitle.trim()) {
      setErrorNotice(
        releaseType === 'SINGLE'
          ? 'Please provide a single title'
          : 'Please provide a release title',
      )
      return
    }
    if (!releaseCoverUrl) {
      setErrorNotice('Please upload cover artwork image (Cloudflare R2)')
      return
    }

    setIsSubmittingRelease(true)
    setErrorNotice(null)

    const todayDate = new Date().toISOString().split('T')[0]

    try {
      if (releaseType === 'SINGLE') {
        if (!singleTrackAudioUrl && !singleTrackAudioKey) {
          setErrorNotice('Please upload a master audio file for the single release')
          setIsSubmittingRelease(false)
          return
        }

        const singleTrackPayload = [
          {
            title: releaseTitle.trim(),
            genre: singleTrackGenre.trim() || undefined,
            durationSeconds: singleTrackDuration,
            trackNumber: 1,
            discNumber: 1,
            isExplicit: singleTrackExplicit,
            rawAudioKey: singleTrackAudioKey || undefined,
            audioUrl: singleTrackAudioUrl || undefined,
            coverImageUrl: releaseCoverUrl,
            credits:
              singleTrackCredits.length > 0
                ? singleTrackCredits.map((c) => ({
                    artistId: c.artistId,
                    role: c.role,
                  }))
                : undefined,
          },
        ]

        await catalogApi.createAlbum({
          title: releaseTitle.trim(),
          albumType: 'SINGLE',
          coverImageUrl: releaseCoverUrl,
          description: releaseDescription.trim() || undefined,
          releaseDate: todayDate,
          tracks: singleTrackPayload,
        })

        setSuccessNotice(
          `🎉 Standalone single release "${releaseTitle}" published successfully!`,
        )
      } else {
        if (draftTracks.length === 0) {
          setErrorNotice('Please add at least one cut to the release')
          setIsSubmittingRelease(false)
          return
        }

        const tracksPayload = draftTracks.map((t, idx) => ({
          title: t.title.trim() || `Cut ${idx + 1}`,
          genre: t.genre.trim() || undefined,
          durationSeconds: t.durationSeconds,
          trackNumber: idx + 1,
          discNumber: 1,
          isExplicit: t.isExplicit,
          rawAudioKey: t.rawAudioKey,
          audioUrl: t.audioUrl,
          coverImageUrl: t.coverImageUrl,
          credits:
            t.credits && t.credits.length > 0
              ? t.credits.map((c) => ({
                  artistId: c.artistId,
                  role: c.role,
                }))
              : undefined,
        }))

        await catalogApi.createAlbum({
          title: releaseTitle.trim(),
          albumType: releaseType,
          coverImageUrl: releaseCoverUrl,
          description: releaseDescription.trim() || undefined,
          releaseDate: todayDate,
          tracks: tracksPayload.length > 0 ? tracksPayload : undefined,
        })

        setSuccessNotice(
          `🎉 Master ${releaseType} release "${releaseTitle}" published successfully!`,
        )
      }

      setIsCreateReleaseOpen(false)
      resetReleaseForm()
      loadReleases()
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to create release')
    } finally {
      setIsSubmittingRelease(false)
    }
  }

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

      {/* Studio Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-line pb-px mb-8 font-mono text-xs uppercase tracking-[0.14em] overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('releases')}
          className={`py-2.5 px-4 border-b-2 cursor-pointer transition-colors whitespace-nowrap ${
            activeTab === 'releases'
              ? 'border-blue text-ink font-semibold'
              : 'border-transparent text-ink-soft hover:text-ink'
          }`}
        >
          Catalog & Releases ({albums.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('trash')}
          className={`py-2.5 px-4 border-b-2 cursor-pointer transition-colors whitespace-nowrap ${
            activeTab === 'trash'
              ? 'border-blue text-ink font-semibold'
              : 'border-transparent text-ink-soft hover:text-ink'
          }`}
        >
          30-Day Trash ({trashAlbums.length + trashSongs.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className={`py-2.5 px-4 border-b-2 cursor-pointer transition-colors whitespace-nowrap ${
            activeTab === 'profile'
              ? 'border-blue text-ink font-semibold'
              : 'border-transparent text-ink-soft hover:text-ink'
          }`}
        >
          Profile & Branding
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('verification')}
          className={`py-2.5 px-4 border-b-2 cursor-pointer transition-colors whitespace-nowrap ${
            activeTab === 'verification'
              ? 'border-blue text-ink font-semibold'
              : 'border-transparent text-ink-soft hover:text-ink'
          }`}
        >
          Verification Desk
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: CATALOG & RELEASES */}
      {/* ========================================================================= */}
      {activeTab === 'releases' && (
        <div className="space-y-10">
          {/* Top Actions & Overview */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="font-serif italic text-2xl text-ink">
                Master Releases & Recordings
              </h2>
              <p className="font-sans text-xs text-ink-soft mt-0.5">
                Manage your studio master tapes, published albums, and
                standalone singles.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  resetReleaseForm()
                  setIsCreateReleaseOpen(true)
                }}
                className="font-mono text-[10.5px] uppercase tracking-[0.14em] py-2 px-4 bg-ink text-canvas hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-1.5 shadow-2xs font-semibold"
              >
                <PlusIconSVG className="w-3.5 h-3.5" />
                <span>✦ New Release</span>
              </button>
            </div>
          </div>

          {/* Unified Master Release Modal */}
          {isCreateReleaseOpen && (
            <div className="p-6 border-2 border-line bg-panel shadow-md space-y-6">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <div>
                  <h3 className="font-serif italic text-xl text-ink">
                    {releaseType === 'SINGLE'
                      ? 'Publish Standalone Single Release'
                      : `Publish New Master ${releaseType}`}
                  </h3>
                  <p className="font-mono text-[9.5px] text-ink-soft mt-0.5">
                    {releaseType === 'SINGLE'
                      ? 'Streamlined single release with dedicated master artwork, R2 lossless audio, and collaborator credits.'
                      : 'Multi-cut studio release with sequential tracklist ordering, R2 master cuts, and contributor attribution.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreateReleaseOpen(false)}
                  className="font-mono text-xs text-ink-soft hover:text-ink cursor-pointer"
                >
                  ✕ Close
                </button>
              </div>

              {/* Release Format / Type Selector */}
              <div>
                <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block mb-2">
                  Release Format / Type
                </label>
                <div className="flex flex-wrap gap-2">
                  {(['SINGLE', 'ALBUM', 'EP', 'LP', 'MIXTAPE'] as AlbumType[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setReleaseType(type)}
                      className={`font-mono text-xs uppercase tracking-wider py-1.5 px-3.5 border transition-colors cursor-pointer ${
                        releaseType === type
                          ? 'border-ink bg-ink text-canvas font-semibold'
                          : 'border-line bg-canvas text-ink-soft hover:text-ink'
                      }`}
                    >
                      {type === 'SINGLE' ? '✦ Single (1 Cut)' : type}
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={handlePublishRelease} className="space-y-6">
                {/* Basic Release Metadata */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block mb-1.5">
                      {releaseType === 'SINGLE' ? 'Single Title' : 'Release Title'}{' '}
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={releaseTitle}
                      onChange={(e) => setReleaseTitle(e.target.value)}
                      placeholder={
                        releaseType === 'SINGLE'
                          ? 'e.g. Autumn in Saint-Germain'
                          : 'e.g. Kind of Blue, Rue de Sèvres Sessions'
                      }
                      className="w-full font-serif italic text-base py-2 px-3 border border-line bg-canvas text-ink focus:outline-none focus:border-ink"
                    />
                  </div>

                  <div>
                    <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block mb-1.5">
                      Release Date
                    </label>
                    <div className="w-full font-mono text-xs py-2 px-3 border border-line bg-canvas-deep text-ink flex items-center justify-between">
                      <span>
                        {new Date().toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider text-ink-soft bg-panel px-1.5 py-0.5 border border-line/60">
                        Today &bull; Immediate
                      </span>
                    </div>
                  </div>
                </div>

                {/* Release Artwork Upload (Square 1:1) */}
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block mb-1">
                    {releaseType === 'SINGLE' ? 'Single Cover Artwork (Cloudflare R2)' : 'Release Cover Artwork (Cloudflare R2)'}{' '}
                    <span className="text-red-500">*</span>
                  </label>
                  <p className="font-sans text-xs text-ink-soft mb-2">
                    Square artwork (1:1 ratio), minimum 1400x1400px recommended (JPEG, PNG, or WebP). Stored on Cloudflare R2 edge CDN.
                  </p>
                  <div className="flex items-center gap-4">
                    <div className="w-20 h-20 border border-line bg-canvas-deep flex items-center justify-center overflow-hidden shrink-0">
                      {releaseCoverUrl ? (
                        <img
                          src={releaseCoverUrl}
                          alt="Cover preview"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <DiscIconSVG className="w-8 h-8 text-ink-soft/40" />
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-2">
                        <label className="font-mono text-[10px] uppercase tracking-[0.12em] py-1.5 px-3 border border-line bg-canvas hover:border-ink text-ink cursor-pointer inline-flex items-center gap-1.5">
                          <span>
                            {isUploadingCover
                              ? 'Uploading to R2...'
                              : releaseCoverUrl
                                ? 'Replace Artwork'
                                : 'Upload Cover Artwork'}
                          </span>
                          <input
                            ref={coverInputRef}
                            type="file"
                            accept="image/*"
                            disabled={isUploadingCover}
                            onChange={handleCoverSelect}
                            className="hidden"
                          />
                        </label>
                        {releaseCoverUrl && (
                          <button
                            type="button"
                            onClick={() => {
                              setReleaseCoverUrl('')
                              if (coverInputRef.current) coverInputRef.current.value = ''
                            }}
                            className="font-mono text-[10px] uppercase tracking-[0.12em] py-1.5 px-2.5 border border-line text-ink-soft hover:text-red-500 hover:border-red-400 cursor-pointer"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <span className="font-mono text-[9px] text-ink-soft">
                        {releaseCoverUrl
                          ? '✓ Artwork attached to release'
                          : 'Official release artwork required'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Liner Notes & Description */}
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block mb-1.5">
                    Liner Notes & Description (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={releaseDescription}
                    onChange={(e) => setReleaseDescription(e.target.value)}
                    placeholder="Recording location, inspiration, gear, or credits..."
                    className="w-full font-sans text-xs py-2 px-3 border border-line bg-canvas text-ink focus:outline-none focus:border-ink resize-y"
                  />
                </div>

                {/* ADAPTIVE SECTION A: SINGLE RELEASE STREAMLINED FLOW */}
                {releaseType === 'SINGLE' ? (
                  <div className="pt-4 border-t border-line-soft space-y-4">
                    <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink block">
                      Single Master Recording
                    </span>

                    {/* Master Audio Section */}
                    <div className="p-3.5 border border-line bg-canvas space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink font-semibold">
                          Master Audio Recording
                        </span>
                        <label className="font-mono text-xs uppercase tracking-wider text-ink-soft flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={singleTrackExplicit}
                            onChange={(e) => setSingleTrackExplicit(e.target.checked)}
                          />
                          <span>Explicit Content</span>
                        </label>
                      </div>

                      {singleTrackAudioKey || singleTrackAudioUrl ? (
                        <div className="p-3 border border-green-500/40 bg-green-500/10 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-5 h-5 rounded-full bg-green-600 text-canvas flex items-center justify-center font-mono text-xs font-bold shrink-0">
                              ✓
                            </span>
                            <div className="min-w-0">
                              <div className="font-serif italic text-sm text-ink truncate">
                                {singleTrackAudioFileName || releaseTitle || 'Master Audio Track'}
                              </div>
                              <div className="font-mono text-[9.5px] text-ink-soft">
                                Audio file added successfully &bull; Duration: {formatDuration(singleTrackDuration)}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              disabled
                              className="font-mono text-[9.5px] uppercase tracking-wider py-1.5 px-3 border border-line-soft bg-canvas text-ink-soft/60 cursor-not-allowed"
                              title="An audio master is already uploaded. Reset audio to choose another."
                            >
                              ✓ Audio Attached
                            </button>
                            <button
                              type="button"
                              onClick={handleResetSingleAudio}
                              className="font-mono text-[9.5px] uppercase tracking-wider py-1.5 px-3 border border-line text-ink-soft hover:text-red-500 hover:border-red-400 bg-panel cursor-pointer transition-colors"
                              title="Remove uploaded audio and select a new file"
                            >
                              ✕ Reset Audio
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 border border-dashed border-line bg-panel">
                          <label className="font-mono text-[10px] uppercase tracking-[0.12em] py-2 px-4 border border-line bg-canvas hover:border-ink text-ink cursor-pointer inline-flex items-center gap-2 self-start">
                            <span>
                              {isUploadingSingleAudio
                                ? 'Uploading Master Audio to R2...'
                                : 'Select Audio Master (FLAC/WAV/MP3)'}
                            </span>
                            <input
                              ref={singleAudioInputRef}
                              type="file"
                              accept="audio/*"
                              disabled={isUploadingSingleAudio}
                              onChange={handleSingleAudioSelect}
                              className="hidden"
                            />
                          </label>
                          <span className="font-mono text-[9.5px] text-ink-soft">
                            Lossless FLAC, WAV, or 320kbps MP3
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Genre Input */}
                    <div>
                      <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block mb-1">
                        Genre
                      </label>
                      <input
                        type="text"
                        value={singleTrackGenre}
                        onChange={(e) => setSingleTrackGenre(e.target.value)}
                        placeholder="e.g. Modern Jazz, Neo-Soul, Ambient Electronic"
                        className="w-full font-mono text-xs py-2 px-3 border border-line bg-canvas text-ink"
                      />
                    </div>

                    {/* Collaborator & Credit Attribution */}
                    <div className="pt-2 border-t border-line-soft">
                      <span className="font-mono text-[9.5px] uppercase tracking-wider text-ink-soft block mb-1.5">
                        Collaborators & Credits (Featured / Producers / Composers / Lyricists / Engineers)
                      </span>
                      <ArtistCreditPicker
                        credits={singleTrackCredits}
                        onChange={setSingleTrackCredits}
                        currentArtistId={artistProfile.id}
                      />
                    </div>
                  </div>
                ) : (
                  /* ADAPTIVE SECTION B: MULTI-TRACK ALBUM / EP / LP / MIXTAPE BUILDER */
                  <div className="pt-4 border-t border-line-soft space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink">
                        Master Cuts / Tracklist ({draftTracks.length})
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setDraftTracks([
                            ...draftTracks,
                            {
                              id: crypto.randomUUID(),
                              title: '',
                              genre: '',
                              durationSeconds: 0,
                              isExplicit: false,
                              credits: [],
                            },
                          ])
                        }
                        className="font-mono text-[9.5px] uppercase tracking-[0.12em] py-1 px-2.5 border border-dashed border-line text-ink-soft hover:text-ink cursor-pointer"
                      >
                        + Add Cut
                      </button>
                    </div>

                    <div className="space-y-3">
                      {draftTracks.map((draft, idx) => (
                        <div
                          key={draft.id}
                          className="p-3.5 border border-line bg-canvas space-y-3"
                        >
                          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                            <span className="font-mono text-xs text-ink-soft w-6">
                              {String(idx + 1).padStart(2, '0')}
                            </span>

                            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2 w-full">
                              <input
                                type="text"
                                required
                                placeholder="Cut Title"
                                value={draft.title}
                                onChange={(e) => {
                                  const val = e.target.value
                                  setDraftTracks((prev) =>
                                    prev.map((t) =>
                                      t.id === draft.id ? { ...t, title: val } : t,
                                    ),
                                  )
                                }}
                                className="font-serif italic text-xs py-1.5 px-2.5 border border-line bg-panel text-ink"
                              />

                              <input
                                type="text"
                                placeholder="Genre (e.g. Jazz)"
                                value={draft.genre}
                                onChange={(e) => {
                                  const val = e.target.value
                                  setDraftTracks((prev) =>
                                    prev.map((t) =>
                                      t.id === draft.id ? { ...t, genre: val } : t,
                                    ),
                                  )
                                }}
                                className="font-mono text-xs py-1.5 px-2.5 border border-line bg-panel text-ink"
                              />

                              <div className="flex items-center gap-2">
                                <label className="font-mono text-[9.5px] uppercase tracking-wider text-ink-soft flex items-center gap-1 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={draft.isExplicit}
                                    onChange={(e) => {
                                      const val = e.target.checked
                                      setDraftTracks((prev) =>
                                        prev.map((t) =>
                                          t.id === draft.id
                                            ? { ...t, isExplicit: val }
                                            : t,
                                        ),
                                      )
                                    }}
                                  />
                                  <span>Explicit</span>
                                </label>

                                {draft.durationSeconds > 0 && (
                                  <span className="font-mono text-[10px] text-ink-soft ml-auto">
                                    {formatDuration(draft.durationSeconds)}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Audio Upload Input for this track */}
                            <div className="flex items-center gap-2 shrink-0">
                              {draft.audioUrl || draft.rawAudioKey ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-[9px] uppercase tracking-wider px-2 py-1 border border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300 flex items-center gap-1">
                                    <span>✓</span>
                                    <span>{formatDuration(draft.durationSeconds)}</span>
                                  </span>
                                  <button
                                    type="button"
                                    disabled
                                    className="font-mono text-[9px] uppercase tracking-wider py-1 px-2 border border-line-soft bg-canvas text-ink-soft/60 cursor-not-allowed"
                                    title="Master audio attached. Use reset to replace."
                                  >
                                    Attached
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleResetDraftAudio(draft.id)}
                                    className="font-mono text-[9px] uppercase tracking-wider py-1 px-2 border border-line text-ink-soft hover:text-red-500 hover:border-red-400 bg-panel cursor-pointer transition-colors"
                                    title="Reset audio file for this cut"
                                  >
                                    ✕ Reset
                                  </button>
                                </div>
                              ) : (
                                <label className="font-mono text-[9.5px] uppercase tracking-[0.12em] py-1.5 px-2.5 border border-line bg-panel hover:border-ink text-ink cursor-pointer">
                                  <span>
                                    {draft.isUploadingAudio
                                      ? 'Uploading...'
                                      : 'Select Audio (FLAC/MP3)'}
                                  </span>
                                  <input
                                    type="file"
                                    accept="audio/*"
                                    disabled={draft.isUploadingAudio}
                                    onChange={(e) =>
                                      handleDraftAudioSelect(draft.id, e)
                                    }
                                    className="hidden"
                                  />
                                </label>
                              )}

                              {draftTracks.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDraftTracks(
                                      draftTracks.filter((t) => t.id !== draft.id),
                                    )
                                  }
                                  className="p-1 text-ink-soft hover:text-red-500 cursor-pointer"
                                  title="Remove Cut"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Collaborator & Credit Attribution */}
                          <div className="pt-2 border-t border-line-soft/60">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="font-mono text-[9px] uppercase tracking-wider text-ink-soft">
                                Collaborators & Credits (Featured / Producers / Composers)
                              </span>
                            </div>
                            <ArtistCreditPicker
                              credits={draft.credits || []}
                              onChange={(newCredits) =>
                                setDraftTracks((prev) =>
                                  prev.map((t) =>
                                    t.id === draft.id ? { ...t, credits: newCredits } : t,
                                  ),
                                )
                              }
                              currentArtistId={artistProfile.id}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3 pt-3 border-t border-line">
                  <button
                    type="submit"
                    disabled={isSubmittingRelease}
                    className="font-mono text-xs uppercase tracking-[0.16em] py-2.5 px-6 bg-ink text-canvas hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 font-semibold"
                  >
                    {isSubmittingRelease
                      ? 'Publishing Master Release...'
                      : releaseType === 'SINGLE'
                        ? '✦ Publish Single Release'
                        : `Publish Master ${releaseType}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCreateReleaseOpen(false)}
                    className="font-mono text-xs uppercase tracking-[0.14em] py-2.5 px-4 border border-line text-ink-soft hover:text-ink cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Releases List */}
          <div className="space-y-4">
            <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
              Active Releases ({albums.length})
            </h3>

            {isLoadingReleases ? (
              <div className="p-8 text-center font-mono text-xs text-ink-soft animate-pulse">
                Querying studio releases...
              </div>
            ) : albums.length === 0 ? (
              <div className="p-10 border border-dashed border-line bg-panel text-center">
                <DiscIconSVG className="w-10 h-10 text-ink-soft/40 mx-auto mb-2" />
                <p className="font-serif italic text-base text-ink">
                  No active master releases yet
                </p>
                <p className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-soft mt-1">
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
                    <div
                      key={album.id}
                      className="border border-line bg-panel p-4 sm:p-5 shadow-2xs space-y-4"
                    >
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="w-16 h-16 bg-canvas-deep border border-line shrink-0 overflow-hidden relative">
                            {album.coverImageUrl ? (
                              <img
                                src={album.coverImageUrl}
                                alt={album.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <DiscIconSVG className="w-6 h-6 text-ink-soft/40" />
                              </div>
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[8.5px] uppercase tracking-wider px-1.5 py-0.5 border border-line bg-canvas text-blue font-semibold">
                                {album.albumType}
                              </span>
                              <span className="font-mono text-[10px] text-ink-soft">
                                {album.releaseDate
                                  ? new Date(
                                      album.releaseDate,
                                    ).toLocaleDateString()
                                  : 'Recent'}
                              </span>
                            </div>
                            <h4 className="font-serif italic text-lg text-ink truncate mt-0.5">
                              {album.title}
                            </h4>
                            <div className="font-mono text-[10px] text-ink-soft">
                              {album.totalTracks} cuts &bull;{' '}
                              {formatDuration(album.totalDurationSeconds)}{' '}
                              &bull; {album.likesCount} likes
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                          <Link
                            to="/albums/$idOrSlug"
                            params={{ idOrSlug: album.slug }}
                            className="font-mono text-[10px] uppercase tracking-[0.12em] py-1.5 px-3 border border-line bg-canvas hover:border-ink text-ink transition-colors flex items-center gap-1"
                          >
                            <span>View</span>
                            <ExternalLinkSVG className="w-2.5 h-2.5 text-ink-soft" />
                          </Link>

                          <button
                            type="button"
                            onClick={() => handleToggleAlbumExpand(album.id)}
                            className="font-mono text-[10px] uppercase tracking-[0.12em] py-1.5 px-3 border border-line bg-canvas hover:border-ink text-ink cursor-pointer"
                          >
                            {isExpanded ? 'Hide Cuts' : 'Inspect Cuts'}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteAlbum(album.id)}
                            className="p-1.5 border border-line text-ink-soft hover:text-red-500 hover:border-red-400 cursor-pointer"
                            title="Move to 30-Day Trash"
                          >
                            <TrashIconSVG className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Expanded Tracklist & Detach Feature */}
                      {isExpanded && (
                        <div className="pt-3 border-t border-line-soft space-y-2">
                          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-soft block mb-2">
                            Included Master Cuts ({tracks.length})
                          </span>

                          {isLoadingAlbumTracks && tracks.length === 0 ? (
                            <div className="font-mono text-xs text-ink-soft animate-pulse">
                              Loading tracks...
                            </div>
                          ) : tracks.length === 0 ? (
                            <div className="font-sans text-xs text-ink-soft italic">
                              No tracks in this album.
                            </div>
                          ) : (
                            <div className="divide-y divide-line/40 border border-line-soft bg-canvas">
                              {tracks.map((track, i) => (
                                <div
                                  key={track.id}
                                  className="p-2.5 flex items-center justify-between text-xs gap-3"
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <span className="font-mono text-[10px] text-ink-soft w-5">
                                      {String(
                                        track.trackNumber || i + 1,
                                      ).padStart(2, '0')}
                                    </span>
                                    <span className="font-serif italic text-ink truncate">
                                      {track.title}
                                    </span>
                                    {track.isExplicit && (
                                      <span className="font-mono text-[8px] px-1 border border-line text-ink-soft">
                                        E
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-3 shrink-0">
                                    <span className="font-mono text-[10px] text-ink-soft">
                                      {formatDuration(track.durationSeconds)}
                                    </span>

                                    {album.albumType !== 'SINGLE' && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleOpenDetachModal(track, album)
                                        }
                                        className="font-mono text-[9px] uppercase tracking-wider py-1 px-2 border border-line-soft bg-panel hover:border-ink text-ink-soft hover:text-ink cursor-pointer"
                                        title="Detach cut and spin off into standalone single with optional custom artwork"
                                      >
                                        Detach Cut
                                      </button>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleDeleteSong(track.id)
                                      }
                                      className="p-1 text-ink-soft hover:text-red-500 cursor-pointer"
                                      title="Trash track"
                                    >
                                      <TrashIconSVG className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
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
          <div className="p-4 border border-amber-300 bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200 font-sans text-xs flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] font-semibold">
              30-Day Recovery Guarantee
            </span>
            <p className="leading-relaxed">
              Archived releases and master recordings are retained in this safe
              vault for 30 days before irreversible purging. You can restore
              them to your active catalog at any time with a single click.
            </p>
          </div>

          <div className="space-y-4">
            <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
              Archived Releases ({trashAlbums.length})
            </h3>

            {isLoadingTrash ? (
              <div className="p-6 text-center font-mono text-xs text-ink-soft animate-pulse">
                Loading trash archive...
              </div>
            ) : trashAlbums.length === 0 ? (
              <div className="p-6 border border-line bg-panel text-center font-mono text-xs text-ink-soft">
                Trash is empty. No deleted albums found.
              </div>
            ) : (
              <div className="space-y-3">
                {trashAlbums.map((album) => (
                  <div
                    key={album.id}
                    className="p-4 border border-line bg-panel flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[8px] uppercase tracking-wider px-1.5 py-0.5 bg-canvas border border-line text-ink-soft">
                          {album.albumType}
                        </span>
                        <h4 className="font-serif italic text-base text-ink truncate">
                          {album.title}
                        </h4>
                      </div>
                      <span className="font-mono text-[9px] text-ink-soft mt-0.5 block">
                        Deleted:{' '}
                        {album.deletedAt
                          ? new Date(album.deletedAt).toLocaleDateString()
                          : 'Recently'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRestoreAlbum(album.id)}
                      className="font-mono text-[10px] uppercase tracking-[0.14em] py-2 px-3.5 bg-ink text-canvas hover:opacity-90 cursor-pointer flex items-center gap-1.5 shrink-0"
                    >
                      <UndoIconSVG className="w-3 h-3" />
                      <span>Restore Release</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Archived Songs */}
          {trashSongs.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-line-soft">
              <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                Archived Master Cuts ({trashSongs.length})
              </h3>

              <div className="space-y-2">
                {trashSongs.map((song) => (
                  <div
                    key={song.id}
                    className="p-3 border border-line bg-panel flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <span className="font-serif italic text-sm text-ink truncate block">
                        {song.title}
                      </span>
                      <span className="font-mono text-[9px] text-ink-soft">
                        Deleted:{' '}
                        {song.deletedAt
                          ? new Date(song.deletedAt).toLocaleDateString()
                          : 'Recently'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRestoreSong(song.id)}
                      className="font-mono text-[9.5px] uppercase tracking-[0.14em] py-1.5 px-3 border border-line bg-canvas hover:border-ink text-ink cursor-pointer flex items-center gap-1 shrink-0"
                    >
                      <UndoIconSVG className="w-3 h-3" />
                      <span>Restore</span>
                    </button>
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
          {/* Banner Customizer */}
          <div className="p-6 border border-line bg-panel shadow-2xs">
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

          {/* Identity & Details Editor */}
          <div className="p-6 border border-line bg-panel shadow-2xs">
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
                        {Object.entries(artistProfile.socialLinks).map(
                          ([k, v]) => (
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
                          ),
                        )}
                      </div>
                    </div>
                  )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: VERIFICATION DESK */}
      {/* ========================================================================= */}
      {activeTab === 'verification' && (
        <div className="p-6 border border-line bg-panel shadow-2xs">
          <div className="mb-6 pb-4 border-b border-line-soft">
            <h2 className="font-serif italic text-xl text-ink">
              Creator Verification
            </h2>
            <p className="font-sans text-xs text-ink-soft mt-0.5">
              Verified badges certify official recording artists and unlock
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
                  Your artist profile has been verified by the administration desk.
                  The verified emblem is active on your public profile and catalog
                  releases.
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
                  setVerifyPitch(
                    artistProfile.verificationDetails?.message || '',
                  )
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
      )}

      {/* Detach Cut Modal */}
      {detachModalData && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-panel border-2 border-line shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-soft block">
                  Catalog Action &bull; Spin-off Single
                </span>
                <h3 className="font-serif italic text-xl text-ink">
                  Detach Cut
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseDetachModal}
                disabled={isSubmittingDetach}
                className="font-mono text-xs text-ink-soft hover:text-ink cursor-pointer disabled:opacity-50"
              >
                ✕ Close
              </button>
            </div>

            <p className="font-sans text-xs text-ink-soft leading-relaxed">
              Detaching <strong className="text-ink font-medium font-serif italic">"{detachModalData.song.title}"</strong> from <strong className="text-ink font-medium font-serif italic">{detachModalData.parentAlbum.title}</strong> will turn it into an independent standalone <span className="font-mono text-[11px] font-semibold text-ink">SINGLE</span> release.
            </p>

            {/* Artwork Selection */}
            <div className="space-y-3 pt-1 border-t border-line-soft">
              <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block">
                Cover Artwork for New Single
              </label>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 border border-line bg-canvas-deep flex items-center justify-center overflow-hidden shrink-0">
                  {detachCoverUrl || detachModalData.parentAlbum.coverImageUrl ? (
                    <img
                      src={
                        detachCoverUrl ||
                        detachModalData.parentAlbum.coverImageUrl ||
                        ''
                      }
                      alt="Single Cover Preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <DiscIconSVG className="w-8 h-8 text-ink-soft/40" />
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <label className="font-mono text-[10px] uppercase tracking-[0.12em] py-1.5 px-3 border border-line bg-canvas hover:border-ink text-ink cursor-pointer inline-flex items-center gap-1.5">
                      <span>
                        {isUploadingDetachCover
                          ? 'Uploading to R2...'
                          : detachCoverUrl
                            ? 'Replace Custom Artwork'
                            : 'Upload Custom Single Artwork'}
                      </span>
                      <input
                        ref={detachCoverInputRef}
                        type="file"
                        accept="image/*"
                        disabled={isUploadingDetachCover || isSubmittingDetach}
                        onChange={handleDetachCoverSelect}
                        className="hidden"
                      />
                    </label>
                    {detachCoverUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          setDetachCoverUrl('')
                          if (detachCoverInputRef.current)
                            detachCoverInputRef.current.value = ''
                        }}
                        className="font-mono text-[10px] uppercase tracking-[0.12em] py-1.5 px-2 border border-line text-ink-soft hover:text-red-500 hover:border-red-400 cursor-pointer"
                      >
                        Revert to Album Art
                      </button>
                    )}
                  </div>
                  <p className="font-mono text-[9px] text-ink-soft">
                    {detachCoverUrl
                      ? 'Custom cover uploaded (Cloudflare R2 edge).'
                      : 'Will inherit parent album cover if no custom image is uploaded.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-line">
              <button
                type="button"
                onClick={handleCloseDetachModal}
                disabled={isSubmittingDetach}
                className="font-mono text-[10.5px] uppercase tracking-[0.14em] py-2 px-4 border border-line text-ink-soft hover:text-ink cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDetach}
                disabled={isSubmittingDetach || isUploadingDetachCover}
                className="font-mono text-[10.5px] uppercase tracking-[0.14em] py-2 px-5 bg-ink text-canvas hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 font-semibold"
              >
                {isSubmittingDetach
                  ? 'Detaching Cut...'
                  : '✦ Detach & Spin Off Single'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
