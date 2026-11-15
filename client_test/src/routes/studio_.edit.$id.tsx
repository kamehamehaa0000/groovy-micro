import { useState, useRef, useEffect } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  Check,
  Copy,
  Link2,
  PartyPopper,
  Sparkles,
} from 'lucide-react'
import { notify } from '../lib/toast'
import { useAuthStore } from '../stores/auth.store'
import { catalogApi } from '../lib/catalog.api'
import { isArtistAccount } from '../lib/artist-status'
import type { SelectedCredit } from '../Components/ArtistCreditPicker'
import type { ArtistProfile } from '../types/artist'
import type { AlbumDetail, AlbumType, ReleaseVisibility } from '../types/catalog'
import { Button } from '../Components/ui'
import { H1, H3 } from '../Components/ui/typography'
import { StudioUpgradeScreen } from '../Components/studio/StudioUpgradeScreen'
import { ReleaseDetailsSection } from '../Components/studio/release/ReleaseDetailsSection'
import { TrackListEditor } from '../Components/studio/TrackListEditor'
import { ImageCropModal } from '../Components/common/ImageCropModal'

export const Route = createFileRoute('/studio_/edit/$id')({
  staticData: { layout: 'wide' },
  component: StudioEditReleasePage,
})

interface EditTrackDraft {
  id: string
  title: string
  genre: string
  primaryGenre?: string
  subGenre?: string
  moods?: string[]
  tags?: string[]
  bpm?: number | null
  musicalKey?: string | null
  energy?: number | null
  isExplicit: boolean
  coverImageUrl?: string
  durationSeconds: number
  credits: SelectedCredit[]
}

const ALBUM_TYPES: { id: AlbumType; title: string; subtitle: string }[] = [
  { id: 'SINGLE', title: 'Single', subtitle: '1 track' },
  { id: 'EP', title: 'EP', subtitle: '2 to 6 tracks' },
  { id: 'ALBUM', title: 'Album', subtitle: '7+ tracks' },
  { id: 'LP', title: 'LP', subtitle: 'Full album' },
  { id: 'MIXTAPE', title: 'Mixtape', subtitle: 'Compilation' },
]

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

function StudioEditReleasePage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthStore()

  const [artistProfile, setArtistProfile] = useState<ArtistProfile | null>(null)
  const [isLoadingProfile, setIsLoadingProfile] = useState(true)

  // Album Loading State
  const [album, setAlbum] = useState<AlbumDetail | null>(null)
  const [isLoadingAlbum, setIsLoadingAlbum] = useState(true)
  const [albumLoadError, setAlbumLoadError] = useState<string | null>(null)

  // Release metadata state
  const [releaseTitle, setReleaseTitle] = useState('')
  const [releaseType, setReleaseType] = useState<AlbumType>('SINGLE')
  const [releaseDescription, setReleaseDescription] = useState('')
  const [releasePrimaryGenre, setReleasePrimaryGenre] = useState<string>('')
  const [releaseSubGenre, setReleaseSubGenre] = useState<string>('')
  const [releaseMoods, setReleaseMoods] = useState<string[]>([])
  const [releaseTags, setReleaseTags] = useState<string[]>([])
  const [releaseCoverUrl, setReleaseCoverUrl] = useState('')
  const [releaseCoverFile, setReleaseCoverFile] = useState<File | null>(null)
  const [releaseCoverPreview, setReleaseCoverPreview] = useState<string | null>(
    null,
  )
  const [coverCropFile, setCoverCropFile] = useState<File | null>(null)
  const [isUploadingCover, setIsUploadingCover] = useState(false)
  const [isSavingRelease, setIsSavingRelease] = useState(false)
  const coverInputRef = useRef<HTMLInputElement>(null)

  // Scheduled drop & visibility state
  const [releaseMode, setReleaseMode] = useState<'IMMEDIATE' | 'SCHEDULED'>(
    'IMMEDIATE',
  )
  const [scheduledDate, setScheduledDate] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')
  const [releaseVisibility, setReleaseVisibility] =
    useState<ReleaseVisibility>('PUBLIC')
  const [releaseAllowComments, setReleaseAllowComments] = useState(true)

  // Tracks State
  const [tracks, setTracks] = useState<EditTrackDraft[]>([])

  // Auth gate
  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      navigate({ to: '/login', search: { redirect: `/studio/edit/${id}` } })
    }
  }, [isAuthLoading, isAuthenticated, navigate, id])

  // Fetch artist profile
  useEffect(() => {
    if (!user) return
    setIsLoadingProfile(true)
    catalogApi
      .getStudioOverview()
      .then((overview) => {
        setArtistProfile(overview.artist || null)
      })
      .catch((err) => {
        console.warn('Could not load studio overview:', err)
        setArtistProfile(null)
      })
      .finally(() => {
        setIsLoadingProfile(false)
      })
  }, [user])

  // Fetch release detail and hydrate form
  useEffect(() => {
    setIsLoadingAlbum(true)
    setAlbumLoadError(null)

    catalogApi
      .getAlbum(id)
      .then((data) => {
        setAlbum(data)
        setReleaseTitle(data.title)
        setReleaseType(data.albumType)
        setReleaseDescription(data.description || '')
        setReleasePrimaryGenre(data.primaryGenre || '')
        setReleaseSubGenre(data.subGenre || '')
        setReleaseMoods(data.moods || [])
        setReleaseTags(data.tags || [])
        setReleaseCoverUrl(data.coverImageUrl)
        setReleaseVisibility(data.visibility || 'PUBLIC')
        setReleaseAllowComments(data.allowComments ?? true)

        const scheduledAt =
          data.status === 'SCHEDULED' && data.scheduledReleaseAt
            ? new Date(data.scheduledReleaseAt)
            : null

        setReleaseMode(scheduledAt ? 'SCHEDULED' : 'IMMEDIATE')
        setScheduledDate(
          scheduledAt
            ? `${scheduledAt.getFullYear()}-${pad2(scheduledAt.getMonth() + 1)}-${pad2(scheduledAt.getDate())}`
            : '',
        )
        setScheduledTime(
          scheduledAt
            ? `${pad2(scheduledAt.getHours())}:${pad2(scheduledAt.getMinutes())}`
            : '',
        )

        if (data.tracks && data.tracks.length > 0) {
          setTracks(
            data.tracks.map((t) => ({
              id: t.id,
              title: t.title,
              genre: t.genre || '',
              primaryGenre: t.primaryGenre || undefined,
              subGenre: t.subGenre || undefined,
              moods: t.moods || [],
              tags: t.tags || [],
              bpm: t.bpm,
              musicalKey: t.musicalKey,
              energy: t.energy,
              isExplicit: t.isExplicit,
              coverImageUrl: t.coverImageUrl || undefined,
              durationSeconds: t.durationSeconds,
              credits: (t.credits || []).map((c) => ({
                artistId: c.artistId,
                stageName: c.stageName,
                slug: c.slug,
                verified: c.verified,
                role: c.role,
              })),
            })),
          )
        } else {
          setTracks([])
        }
      })
      .catch((err: any) => {
        console.error('Failed to load release for edit:', err)
        setAlbumLoadError(err.message || 'Could not load release')
      })
      .finally(() => {
        setIsLoadingAlbum(false)
      })
  }, [id])

  // Revoke preview blob on unmount
  useEffect(() => {
    return () => {
      if (releaseCoverPreview?.startsWith('blob:')) {
        URL.revokeObjectURL(releaseCoverPreview)
      }
    }
  }, [releaseCoverPreview])

  const handleCoverSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setCoverCropFile(file)
    if (coverInputRef.current) coverInputRef.current.value = ''
  }

  const handleCoverCropComplete = (croppedFile: File) => {
    if (releaseCoverPreview?.startsWith('blob:')) {
      URL.revokeObjectURL(releaseCoverPreview)
    }
    setReleaseCoverFile(croppedFile)
    setReleaseCoverPreview(URL.createObjectURL(croppedFile))
    setCoverCropFile(null)
    notify.success('Cover artwork framed and attached.')
  }

  const handleRemoveCover = () => {
    if (releaseCoverPreview?.startsWith('blob:')) {
      URL.revokeObjectURL(releaseCoverPreview)
    }
    setReleaseCoverFile(null)
    setReleaseCoverPreview(null)
    setReleaseCoverUrl('')
    if (coverInputRef.current) coverInputRef.current.value = ''
  }

  const handleSaveRelease = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!releaseTitle.trim()) {
      notify.error('Release title cannot be blank')
      return
    }

    if (releaseMode === 'SCHEDULED' && (!scheduledDate || !scheduledTime)) {
      notify.error('Please specify both release date and time for scheduled drop')
      return
    }

    setIsSavingRelease(true)
    notify.dismiss()

    try {
      let finalCoverUrl = releaseCoverUrl
      if (releaseCoverFile) {
        setIsUploadingCover(true)
        try {
          finalCoverUrl = await catalogApi.uploadAlbumCover(releaseCoverFile)
          setReleaseCoverUrl(finalCoverUrl)
          setReleaseCoverFile(null)
        } catch (covErr: any) {
          notify.error(covErr.message || 'Failed to upload cover artwork')
          setIsSavingRelease(false)
          setIsUploadingCover(false)
          return
        } finally {
          setIsUploadingCover(false)
        }
      }

      if (!finalCoverUrl) {
        notify.error('Please provide cover artwork for the release')
        setIsSavingRelease(false)
        return
      }

      let scheduledReleaseAtIso: string | null | undefined = undefined
      if (releaseMode === 'SCHEDULED') {
        const parsed = new Date(
          `${scheduledDate}T${scheduledTime}`,
        ).getTime()
        if (isNaN(parsed)) {
          notify.error('Invalid scheduled drop timestamp')
          setIsSavingRelease(false)
          return
        }
        scheduledReleaseAtIso = new Date(parsed).toISOString()
      } else if (
        album?.status === 'SCHEDULED' &&
        releaseMode === 'IMMEDIATE'
      ) {
        scheduledReleaseAtIso = null
      }

      // 1. Update Album Level Metadata
      await catalogApi.updateAlbum(id, {
        title: releaseTitle.trim(),
        albumType: releaseType,
        genre: releasePrimaryGenre || null,
        primaryGenre: releasePrimaryGenre || null,
        subGenre: releaseSubGenre || null,
        moods: releaseMoods,
        tags: releaseTags,
        description: releaseDescription.trim() || null,
        coverImageUrl: finalCoverUrl,
        visibility: releaseVisibility,
        scheduledReleaseAt: scheduledReleaseAtIso,
        allowComments: releaseAllowComments,
      })

      // 2. Update all tracks
      if (tracks.length > 0) {
        for (const track of tracks) {
          await catalogApi.updateSong(track.id, {
            title: track.title.trim() || undefined,
            genre: track.primaryGenre || track.genre.trim() || null,
            primaryGenre: track.primaryGenre || null,
            subGenre: track.subGenre || null,
            moods: track.moods,
            tags: track.tags,
            bpm: track.bpm,
            musicalKey: track.musicalKey,
            isExplicit: track.isExplicit,
            coverImageUrl: track.coverImageUrl || finalCoverUrl,
            credits: track.credits.map((c) => ({
              artistId: c.artistId,
              role: c.role,
            })),
          })
        }
      }

      notify.success(
        `Master release "${releaseTitle}" updated successfully!`,
        { icon: <PartyPopper className="h-4 w-4" /> },
      )

      navigate({ to: '/studio', search: { tab: 'releases' } })
    } catch (err: any) {
      notify.error(err.message || 'Failed to update release')
    } finally {
      setIsSavingRelease(false)
    }
  }

  if (isAuthLoading || isLoadingProfile || isLoadingAlbum) {
    return (
      <div className="py-24 text-center font-mono text-caption text-muted-foreground animate-pulse">
        Loading release editor...
      </div>
    )
  }

  if (!isArtistAccount(user)) {
    return <StudioUpgradeScreen setArtistProfile={setArtistProfile} />
  }

  if (albumLoadError || !album) {
    return (
      <div className="py-24 text-center space-y-4">
        <div className="font-mono text-caption text-destructive">
          {albumLoadError || 'Release not found'}
        </div>
        <Link
          to="/studio"
          search={{ tab: 'releases' }}
          className="inline-flex items-center gap-1.5 font-eyebrow text-eyebrow uppercase tracking-wider py-1.5 px-3 rounded-full bg-card hover:bg-background text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Studio</span>
        </Link>
      </div>
    )
  }

  const unlistedShareUrl =
    album.shareToken && typeof window !== 'undefined'
      ? `${window.location.origin}/albums/${album.slug}?shareToken=${album.shareToken}`
      : ''

  return (
    <div className="space-y-8 pb-16">
      {/* Top Navigation & Breadcrumb */}
      <div>
        <Link
          to="/studio"
          search={{ tab: 'releases' }}
          className="inline-flex items-center gap-1.5 font-eyebrow text-eyebrow uppercase tracking-wider py-1.5 px-3 rounded-full bg-card hover:bg-background text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Studio</span>
        </Link>

        <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-primary block mb-0.5">
          Artist Studio
        </span>
        <H1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Edit Release
        </H1>
        <p className="font-sans text-caption text-muted-foreground mt-1 max-w-xl">
          Update catalog details, artwork, and tracks for "{album.title}".
        </p>
      </div>

      {/* Format Selector Pills */}
      <div className="p-5 sm:p-6 bg-card rounded-2xl shadow-raised space-y-4">
        <div>
          <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block mb-0.5">
            Step 1 · Format
          </span>
          <H3 className="text-title font-semibold text-foreground">
            Release Format
          </H3>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
          {ALBUM_TYPES.map((type) => {
            const isSelected = releaseType === type.id
            return (
              <button
                key={type.id}
                type="button"
                onClick={() => setReleaseType(type.id)}
                className={`p-3 sm:p-3.5 rounded-xl text-left transition-all cursor-pointer flex flex-col justify-between gap-2 min-w-0 ${
                  isSelected
                    ? 'bg-foreground text-background shadow-raised font-semibold'
                    : 'bg-background hover:bg-muted text-foreground'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-eyebrow text-caption uppercase tracking-wider truncate">
                    {type.title}
                  </span>
                  {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                </div>
                <span
                  className={`font-mono text-eyebrow truncate ${
                    isSelected
                      ? 'text-background/80'
                      : 'text-muted-foreground'
                  }`}
                >
                  {type.subtitle}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <form onSubmit={handleSaveRelease} className="space-y-6 sm:space-y-7">
        {/* Release Metadata Details Card */}
        <div className="p-5 sm:p-6 bg-card rounded-2xl shadow-raised space-y-5">
          <div className="pb-3 border-b border-border-soft">
            <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block mb-0.5">
              Step 2 · Details
            </span>
            <H3 className="text-title font-semibold text-foreground">
              Release Details
            </H3>
          </div>

          <ReleaseDetailsSection
            releaseType={releaseType}
            title={releaseTitle}
            onTitleChange={setReleaseTitle}
            mode={releaseMode}
            onModeChange={setReleaseMode}
            scheduledDate={scheduledDate}
            onScheduledDateChange={setScheduledDate}
            scheduledTime={scheduledTime}
            onScheduledTimeChange={setScheduledTime}
            visibility={releaseVisibility}
            onVisibilityChange={setReleaseVisibility}
            coverPreview={releaseCoverPreview}
            coverUrl={releaseCoverUrl}
            isUploadingCover={isUploadingCover}
            coverInputRef={coverInputRef}
            onCoverSelect={handleCoverSelect}
            onRemoveCover={handleRemoveCover}
            primaryGenre={releasePrimaryGenre}
            onPrimaryGenreChange={setReleasePrimaryGenre}
            subGenre={releaseSubGenre}
            onSubGenreChange={setReleaseSubGenre}
            moods={releaseMoods}
            onMoodsChange={setReleaseMoods}
            tags={releaseTags}
            onTagsChange={setReleaseTags}
            description={releaseDescription}
            onDescriptionChange={setReleaseDescription}
            allowComments={releaseAllowComments}
            onAllowCommentsChange={setReleaseAllowComments}
          />

          {/* Unlisted Secret Share Link */}
          {releaseVisibility === 'UNLISTED' && unlistedShareUrl && (
            <div className="p-3 bg-background rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-caption font-mono">
              <div className="flex items-center gap-2 min-w-0 text-muted-foreground">
                <Link2 className="w-4 h-4 shrink-0 text-primary" />
                <span className="truncate">{unlistedShareUrl}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(unlistedShareUrl)
                  notify.success('Copied secret unlisted share link!')
                }}
                className="rounded-full self-start sm:self-auto shrink-0"
              >
                <Copy className="w-3.5 h-3.5 shrink-0" />
                <span>Copy Link</span>
              </Button>
            </div>
          )}
        </div>

        {/* Tracks Section */}
        {tracks.length > 0 && (
          <div className="p-5 sm:p-6 bg-card rounded-2xl shadow-raised space-y-5">
            <div className="pb-3 border-b border-border-soft">
              <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block mb-0.5">
                Step 3 · Tracklist
              </span>
              <H3 className="text-title font-semibold text-foreground">
                Tracks &amp; Collaborator Credits ({tracks.length})
              </H3>
            </div>

            <TrackListEditor
              tracks={tracks}
              currentArtistId={artistProfile?.id}
              genrePlaceholder={releasePrimaryGenre || 'Cut genre'}
              creditLabel="Collaborators & Credits"
              creditHeadingRow
              onUpdateTrack={(id, patch) =>
                setTracks((prev) =>
                  prev.map((t) => (t.id === id ? { ...t, ...patch } : t)),
                )
              }
            />
          </div>
        )}

        {/* Action Controls Bar */}
        <div className="p-4 sm:p-5 bg-card rounded-2xl shadow-raised flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() =>
              navigate({ to: '/studio', search: { tab: 'releases' } })
            }
            className="rounded-full self-start sm:self-auto"
          >
            Cancel
          </Button>

          <Button
            variant="pixel"
            size="sm"
            type="submit"
            disabled={isSavingRelease}
          >
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span>
              {isSavingRelease
                ? 'Saving Changes...'
                : releaseMode === 'SCHEDULED'
                  ? 'Update Scheduled Release'
                  : 'Save Release Changes'}
            </span>
          </Button>
        </div>
      </form>

      {/* Artwork Crop Modal */}
      <ImageCropModal
        isOpen={!!coverCropFile}
        onClose={() => setCoverCropFile(null)}
        imageFile={coverCropFile}
        title="Crop Cover Artwork"
        subtitle="Artist Studio · Cover Artwork"
        aspectRatio={1}
        isCircularMask={false}
        targetMaxWidth={1400}
        targetMaxHeight={1400}
        onCropComplete={handleCoverCropComplete}
      />
    </div>
  )
}
