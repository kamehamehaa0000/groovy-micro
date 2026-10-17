import { useEffect, useRef, useState } from 'react'
import { Disc3, Lock, Calendar, X, Globe, Link2 } from 'lucide-react'
import { toast } from 'sonner'
import { ArtistCreditPicker, type SelectedCredit } from '../ArtistCreditPicker'
import { MarqueeText } from '../common/MarqueeText'
import { catalogApi, formatDuration } from '../../lib/catalog.api'
import { PRIMARY_GENRES, GENRE_SUBGENRES_MAP } from '../../lib/taxonomy'
import type { ArtistProfile } from '../../types/artist'
import type { Album, AlbumType, ReleaseVisibility } from '../../types/catalog'
import {
  FieldLabel,
  GovernanceToggle,
  MonoInput,
  MoodChipRow,
  SelectField,
  SerifInput,
  TagChipInput,
  TextAreaField,
} from './fields'

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
  durationSeconds: number
  isExplicit: boolean
  coverImageUrl?: string
  credits: SelectedCredit[]
}

const pad2 = (n: number) => String(n).padStart(2, '0')

interface EditReleaseDrawerProps {
  /** The release being edited. */
  request: Album
  /** The signed-in artist, used to exclude them from credit candidates. */
  artistProfile: ArtistProfile
  onClose: () => void
  /** Fired after a successful save so the route can refetch the catalog. */
  onReleasesChanged: () => void
}

export function EditReleaseDrawer({
  request,
  artistProfile,
  onClose,
  onReleasesChanged,
}: EditReleaseDrawerProps) {
  // The form is seeded straight from the request, so the first paint is
  // already correct and the drawer never flashes empty inputs.
  const scheduledAt =
    request.status === 'SCHEDULED' && request.scheduledReleaseAt
      ? new Date(request.scheduledReleaseAt)
      : null

  const [isLoadingEditData, setIsLoadingEditData] = useState(true)
  const [editReleaseTitle, setEditReleaseTitle] = useState(request.title)
  const [editReleaseType, setEditReleaseType] = useState<AlbumType>(
    request.albumType,
  )
  const [editReleaseGenre] = useState(request.genre || '')
  const [editReleasePrimaryGenre, setEditReleasePrimaryGenre] =
    useState<string>(request.primaryGenre || '')
  const [editReleaseSubGenre, setEditReleaseSubGenre] = useState<string>(
    request.subGenre || '',
  )
  const [editReleaseMoods, setEditReleaseMoods] = useState<string[]>(
    request.moods || [],
  )
  const [editReleaseTags, setEditReleaseTags] = useState<string[]>(
    request.tags || [],
  )
  const [editReleaseDescription, setEditReleaseDescription] = useState(
    request.description || '',
  )
  const [editReleaseCoverUrl, setEditReleaseCoverUrl] = useState(
    request.coverImageUrl,
  )
  const [isUploadingEditCover, setIsUploadingEditCover] = useState(false)
  const [editReleaseVisibility, setEditReleaseVisibility] =
    useState<ReleaseVisibility>(request.visibility || 'PUBLIC')
  const [editReleaseAllowComments, setEditReleaseAllowComments] = useState(
    request.allowComments ?? true,
  )
  const [editReleaseMode, setEditReleaseMode] = useState<
    'IMMEDIATE' | 'SCHEDULED'
  >(scheduledAt ? 'SCHEDULED' : 'IMMEDIATE')
  const [editReleaseDate, setEditReleaseDate] = useState(
    scheduledAt
      ? `${scheduledAt.getFullYear()}-${pad2(scheduledAt.getMonth() + 1)}-${pad2(scheduledAt.getDate())}`
      : '',
  )
  const [editReleaseTime, setEditReleaseTime] = useState(
    scheduledAt
      ? `${pad2(scheduledAt.getHours())}:${pad2(scheduledAt.getMinutes())}`
      : '',
  )
  const [editTracks, setEditTracks] = useState<EditTrackDraft[]>([])
  const [isSavingRelease, setIsSavingRelease] = useState(false)
  const editCoverInputRef = useRef<HTMLInputElement>(null)

  // Hydrate the cut list once. The drawer remounts for every release it
  // edits, so a mount-only effect is enough.
  useEffect(() => {
    toast.dismiss()
    let cancelled = false
    const loadTracks = async () => {
      try {
        const detail = await catalogApi.getAlbum(
          request.id,
          request.shareToken || undefined,
        )
        if (cancelled) return
        if (detail && detail.tracks) {
          setEditTracks(
            detail.tracks.map((t) => ({
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
          setEditTracks([])
        }
      } catch (err: any) {
        console.warn('Could not load album tracks for edit modal:', err)
        if (!cancelled) setEditTracks([])
      } finally {
        if (!cancelled) setIsLoadingEditData(false)
      }
    }
    loadTracks()
    return () => {
      cancelled = true
    }
  }, [request])

  const handleCloseEditModal = () => {
    onClose()
    setEditTracks([])
    if (editCoverInputRef.current) editCoverInputRef.current.value = ''
  }

  const handleEditCoverSelect = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploadingEditCover(true)
    toast.dismiss()

    try {
      const publicUrl = await catalogApi.uploadAlbumCover(file)
      setEditReleaseCoverUrl(publicUrl)
      toast.success('Replacement cover artwork uploaded to Cloudflare R2.')
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload cover artwork')
    } finally {
      setIsUploadingEditCover(false)
    }
  }

  const handleSaveReleaseEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editReleaseTitle.trim()) {
      toast.error('Release title cannot be blank')
      return
    }

    setIsSavingRelease(true)
    toast.dismiss()

    try {
      let scheduledReleaseAtIso: string | null | undefined = undefined
      if (editReleaseMode === 'SCHEDULED') {
        if (!editReleaseDate || !editReleaseTime) {
          toast.error(
            'Please select both a date and time for the scheduled drop',
          )
          setIsSavingRelease(false)
          return
        }
        const parsed = new Date(
          `${editReleaseDate}T${editReleaseTime}`,
        ).getTime()
        if (isNaN(parsed)) {
          toast.error('Invalid scheduled drop timestamp')
          setIsSavingRelease(false)
          return
        }
        if (parsed <= Date.now()) {
          toast.error('Scheduled release time must be in the future')
          setIsSavingRelease(false)
          return
        }
        scheduledReleaseAtIso = new Date(parsed).toISOString()
      } else if (
        request.status === 'SCHEDULED' &&
        editReleaseMode === 'IMMEDIATE'
      ) {
        // Switching to immediate publishes the album and clears scheduled timestamp
        scheduledReleaseAtIso = null
      }

      // 1. Update Album Level Metadata
      await catalogApi.updateAlbum(request.id, {
        title: editReleaseTitle.trim(),
        albumType: editReleaseType,
        genre: editReleasePrimaryGenre || editReleaseGenre.trim() || null,
        primaryGenre: editReleasePrimaryGenre || null,
        subGenre: editReleaseSubGenre || null,
        moods: editReleaseMoods,
        tags: editReleaseTags,
        description: editReleaseDescription.trim() || null,
        coverImageUrl: editReleaseCoverUrl,
        visibility: editReleaseVisibility,
        scheduledReleaseAt: scheduledReleaseAtIso,
        allowComments: editReleaseAllowComments,
      })

      // 2. Update all tracks (title, genre, explicit, cover, credits)
      if (editTracks.length > 0) {
        for (const track of editTracks) {
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
            coverImageUrl: track.coverImageUrl || undefined,
            credits: track.credits.map((c) => ({
              artistId: c.artistId,
              role: c.role,
            })),
          })
        }
      }

      toast.success(
        `🎉 Master release "${editReleaseTitle}" updated successfully!`,
      )
      handleCloseEditModal()
      onReleasesChanged()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update release')
    } finally {
      setIsSavingRelease(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-foreground/60 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="w-full sm:max-w-3xl bg-card border-t sm:border border-border rounded-control shadow-2xl flex flex-col max-h-[92dvh] sm:max-h-[88vh] overflow-hidden my-0 sm:my-auto">
        {/* Mobile Drag Handle */}
        <div className="sm:hidden w-12 h-1 bg-muted-foreground/30 rounded-full mx-auto my-2.5 shrink-0" />
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 overscroll-contain">
          {/* Modal Header */}
          <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
            <div className="min-w-0 flex-1">
              <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground block">
                Studio Suite &bull; Master Release Editor
              </span>
              <MarqueeText
                className="min-w-0 w-full"
                innerClassName="font-serif italic text-title sm:text-2xl text-foreground font-semibold"
              >
                {`Edit Release: ${request.title}`}
              </MarqueeText>
            </div>
            <button
              type="button"
              onClick={handleCloseEditModal}
              disabled={isSavingRelease}
              className="w-8 h-8 rounded-control border border-border flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer shrink-0 disabled:opacity-50 transition-colors"
              aria-label="Close release editor"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {isLoadingEditData ? (
            <div className="py-16 text-center font-mono text-caption text-muted-foreground animate-pulse">
              Loading release details, master cuts &amp; collaborator
              credits...
            </div>
          ) : (
            <form onSubmit={handleSaveReleaseEdit} className="space-y-6">
              {/* Basic Metadata Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <FieldLabel>
                    Release Title{' '}
                    <span className="text-destructive">*</span>
                  </FieldLabel>
                  <SerifInput
                    type="text"
                    required
                    value={editReleaseTitle}
                    onChange={(e) => setEditReleaseTitle(e.target.value)}
                    placeholder="Release title"
                  />
                </div>

                <div>
                  <FieldLabel>Release Format</FieldLabel>
                  <SelectField
                    size="lg"
                    value={editReleaseType}
                    onChange={(e) =>
                      setEditReleaseType(e.target.value as AlbumType)
                    }
                  >
                    {(
                      [
                        'SINGLE',
                        'ALBUM',
                        'EP',
                        'LP',
                        'MIXTAPE',
                      ] as AlbumType[]
                    ).map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </SelectField>
                </div>
              </div>

              {/* Taxonomy & Classification Row */}
              <div className="space-y-4 pt-2 border-t border-border-soft">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Primary Genre Dropdown */}
                  <div>
                    <FieldLabel>Primary Genre</FieldLabel>
                    <SelectField
                      value={editReleasePrimaryGenre}
                      onChange={(e) => {
                        setEditReleasePrimaryGenre(e.target.value)
                        setEditReleaseSubGenre('')
                      }}
                    >
                      <option value="">Select Primary Genre...</option>
                      {PRIMARY_GENRES.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </SelectField>
                    <p className="font-mono text-eyebrow text-muted-foreground mt-1.5">
                      Used for catalog indexing, genre discovery &amp; radio
                      curation.
                    </p>
                  </div>

                  {/* Sub-Genre Dropdown */}
                  <div>
                    <FieldLabel>Sub-Genre (Optional)</FieldLabel>
                    <SelectField
                      value={editReleaseSubGenre}
                      onChange={(e) =>
                        setEditReleaseSubGenre(e.target.value)
                      }
                      disabled={
                        !editReleasePrimaryGenre ||
                        !GENRE_SUBGENRES_MAP[editReleasePrimaryGenre]
                          ?.length
                      }
                    >
                      <option value="">Select Sub-Genre...</option>
                      {editReleasePrimaryGenre &&
                        GENRE_SUBGENRES_MAP[editReleasePrimaryGenre]?.map(
                          (sg) => (
                            <option key={sg} value={sg}>
                              {sg}
                            </option>
                          ),
                        )}
                    </SelectField>
                  </div>
                </div>

                {/* Mood Selection (1-3 optional) */}
                <MoodChipRow
                  selected={editReleaseMoods}
                  onChange={setEditReleaseMoods}
                />

                {/* Custom Tags */}
                <TagChipInput
                  tags={editReleaseTags}
                  onChange={setEditReleaseTags}
                />
              </div>

              {/* Master Cover Artwork */}
              <div className="pt-2 border-t border-border-soft">
                <FieldLabel>Master Cover Artwork</FieldLabel>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-muted border border-border shrink-0 overflow-hidden flex items-center justify-center">
                    {editReleaseCoverUrl ? (
                      <img
                        src={editReleaseCoverUrl}
                        alt="Cover preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Disc3 className="w-6 h-6 text-muted-foreground/40 shrink-0" />
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-eyebrow text-eyebrow uppercase tracking-wider py-1.5 px-3 border border-border bg-background hover:border-foreground text-foreground cursor-pointer inline-flex items-center gap-1.5">
                      <span>
                        {isUploadingEditCover
                          ? 'Uploading to R2...'
                          : 'Upload Replacement Artwork'}
                      </span>
                      <input
                        ref={editCoverInputRef}
                        type="file"
                        accept="image/*"
                        disabled={isUploadingEditCover || isSavingRelease}
                        onChange={handleEditCoverSelect}
                        className="hidden"
                      />
                    </label>
                    <p className="font-mono text-eyebrow text-muted-foreground">
                      Direct Cloudflare R2 upload (PNG, JPG, WEBP).
                    </p>
                  </div>
                </div>
              </div>

              {/* Catalog Visibility Tier Selector */}
              <div className="space-y-2 pt-2 border-t border-border-soft">
                <div className="flex items-center justify-between">
                  <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground">
                    Catalog Visibility Tier
                  </label>
                  <span className="font-mono text-eyebrow text-muted-foreground">
                    Current:{' '}
                    <strong className="text-foreground">
                      {editReleaseVisibility}
                    </strong>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setEditReleaseVisibility('PUBLIC')}
                    className={`p-3 border rounded-control text-left cursor-pointer transition-colors ${
                      editReleaseVisibility === 'PUBLIC'
                        ? 'border-success/60 bg-success-soft'
                        : 'border-border bg-background hover:border-foreground/50'
                    }`}
                  >
                    <div className="font-eyebrow text-eyebrow uppercase tracking-wider font-semibold text-foreground flex items-center gap-1.5">
                      <Globe className="w-3 h-3 shrink-0" />
                      <span>Public</span>
                    </div>
                    <p className="font-sans text-eyebrow text-muted-foreground mt-1 leading-snug">
                      Discoverable on artist profile, search, and
                      algorithmic radio.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditReleaseVisibility('UNLISTED')}
                    className={`p-3 border rounded-control text-left cursor-pointer transition-colors ${
                      editReleaseVisibility === 'UNLISTED'
                        ? 'border-info/60 bg-info-soft'
                        : 'border-border bg-background hover:border-foreground/50'
                    }`}
                  >
                    <div className="font-eyebrow text-eyebrow uppercase tracking-wider font-semibold text-foreground flex items-center gap-1.5">
                      <Link2 className="w-3 h-3 shrink-0" />
                      <span>Unlisted</span>
                    </div>
                    <p className="font-sans text-eyebrow text-muted-foreground mt-1 leading-snug">
                      Hidden from search and profile. Accessible only via
                      secret token URL.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditReleaseVisibility('PRIVATE')}
                    className={`p-3 border rounded-control text-left cursor-pointer transition-colors ${
                      editReleaseVisibility === 'PRIVATE'
                        ? 'border-destructive/60 bg-destructive-soft'
                        : 'border-border bg-background hover:border-foreground/50'
                    }`}
                  >
                    <div className="font-eyebrow text-eyebrow uppercase tracking-wider font-semibold text-foreground flex items-center gap-1.5">
                      <Lock className="w-3 h-3 text-destructive shrink-0" />
                      <span>Private</span>
                    </div>
                    <p className="font-sans text-eyebrow text-muted-foreground mt-1 leading-snug">
                      Strictly confidential. Visible only in your Studio
                      suite.
                    </p>
                  </button>
                </div>

                {editReleaseVisibility === 'UNLISTED' &&
                  request.shareToken && (
                    <div className="p-3 border border-info/30 bg-info-soft rounded-control flex items-center justify-between gap-3 mt-2">
                      <div className="min-w-0 font-mono text-eyebrow text-foreground truncate">
                        <span className="text-muted-foreground">
                          Secret Link:{' '}
                        </span>
                        <span className="underline">
                          {window.location.origin}/albums/
                          {request.slug}?shareToken=
                          {request.shareToken}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const url = `${window.location.origin}/albums/${request.slug}?shareToken=${request.shareToken}`
                          navigator.clipboard.writeText(url)
                          toast.success(
                            'Copied secret share link to clipboard!',
                          )
                        }}
                        className="font-eyebrow text-eyebrow uppercase tracking-wider py-1 px-2.5 border border-info/40 bg-info-soft text-info hover:bg-info/20 shrink-0 cursor-pointer"
                      >
                        Copy Link
                      </button>
                    </div>
                  )}
              </div>

              {/* Release Timing & Scheduling */}
              <div className="space-y-3 pt-2 border-t border-border-soft">
                <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground block">
                  Release Timing &amp; Drop Scheduling
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setEditReleaseMode('IMMEDIATE')}
                    className={`font-eyebrow text-caption uppercase tracking-wider py-2.5 px-3 border transition-colors cursor-pointer text-center ${
                      editReleaseMode === 'IMMEDIATE'
                        ? 'border-foreground bg-foreground text-background font-semibold'
                        : 'border-border bg-background text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Immediate / Published
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditReleaseMode('SCHEDULED')
                      if (!editReleaseDate) {
                        const tomorrow = new Date(
                          Date.now() + 24 * 60 * 60 * 1000,
                        )
                        setEditReleaseDate(
                          tomorrow.toISOString().split('T')[0],
                        )
                        setEditReleaseTime('00:00')
                      }
                    }}
                    className={`font-eyebrow text-caption uppercase tracking-wider py-2.5 px-3 border transition-colors cursor-pointer text-center flex items-center justify-center gap-1.5 ${
                      editReleaseMode === 'SCHEDULED'
                        ? 'border-foreground bg-foreground text-background font-semibold'
                        : 'border-border bg-background text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Calendar className="w-3.5 h-3.5 shrink-0" />
                    <span>Scheduled Drop</span>
                  </button>
                </div>

                {editReleaseMode === 'SCHEDULED' && (
                  <div className="p-3.5 border border-primary/30 bg-primary/5 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <FieldLabel tone="muted" spacing="tight">
                          Drop Date
                        </FieldLabel>
                        <MonoInput
                          type="date"
                          min={new Date().toISOString().split('T')[0]}
                          value={editReleaseDate}
                          onChange={(e) =>
                            setEditReleaseDate(e.target.value)
                          }
                        />
                      </div>
                      <div>
                        <FieldLabel tone="muted" spacing="tight">
                          Drop Time (Local)
                        </FieldLabel>
                        <MonoInput
                          type="time"
                          value={editReleaseTime}
                          onChange={(e) =>
                            setEditReleaseTime(e.target.value)
                          }
                        />
                      </div>
                    </div>
                    <p className="font-mono text-eyebrow text-muted-foreground">
                      Fans can pre-save this release. The automated BullMQ
                      scheduler will automatically release it to listeners
                      at the specified time.
                    </p>
                  </div>
                )}
              </div>

              {/* Description & Liner Notes */}
              <div className="pt-2 border-t border-border-soft">
                <FieldLabel>Release Description / Liner Notes</FieldLabel>
                <TextAreaField
                  rows={3}
                  value={editReleaseDescription}
                  onChange={(e) =>
                    setEditReleaseDescription(e.target.value)
                  }
                  placeholder="Liner notes, studio sessions, recording personnel, narrative..."
                />
              </div>

              {/* Creator Governance: Comments & Discussions */}
              <GovernanceToggle
                checked={editReleaseAllowComments}
                onChange={setEditReleaseAllowComments}
                title="Discussion &amp; Comments"
                description="Allow listeners and curators to post comments and replies on this release."
                surface="background"
              />

              {/* Master Cuts & Collaborator Credits */}
              {editTracks.length > 0 && (
                <div className="space-y-4 pt-2 border-t border-border-soft">
                  <div className="flex items-center justify-between">
                    <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground">
                      Master Cuts &amp; Collaborator Credits (
                      {editTracks.length})
                    </label>
                    <span className="font-mono text-eyebrow text-muted-foreground">
                      Edit titles, individual genres, explicit tags &amp;
                      contributor credits
                    </span>
                  </div>

                  <div className="space-y-3">
                    {editTracks.map((track, idx) => (
                      <div
                        key={track.id}
                        className="p-3.5 border border-border bg-background space-y-3"
                      >
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                          <span className="font-mono text-caption text-muted-foreground w-6">
                            {String(idx + 1).padStart(2, '0')}
                          </span>

                          <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2 w-full">
                            <input
                              type="text"
                              required
                              value={track.title}
                              onChange={(e) => {
                                const val = e.target.value
                                setEditTracks((prev) =>
                                  prev.map((t) =>
                                    t.id === track.id
                                      ? { ...t, title: val }
                                      : t,
                                  ),
                                )
                              }}
                              placeholder="Cut Title"
                              className="font-serif italic text-caption py-1.5 px-2.5 border border-border bg-card text-foreground"
                            />

                            <input
                              type="text"
                              value={track.genre}
                              onChange={(e) => {
                                const val = e.target.value
                                setEditTracks((prev) =>
                                  prev.map((t) =>
                                    t.id === track.id
                                      ? { ...t, genre: val }
                                      : t,
                                  ),
                                )
                              }}
                              placeholder="Genre (e.g. Ambient)"
                              className="font-mono text-caption py-1.5 px-2.5 border border-border bg-card text-foreground"
                            />

                            <div className="flex items-center gap-2">
                              <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground flex items-center gap-1 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={track.isExplicit}
                                  onChange={(e) => {
                                    const val = e.target.checked
                                    setEditTracks((prev) =>
                                      prev.map((t) =>
                                        t.id === track.id
                                          ? { ...t, isExplicit: val }
                                          : t,
                                      ),
                                    )
                                  }}
                                />
                                <span>Explicit</span>
                              </label>

                              {track.durationSeconds > 0 && (
                                <span className="font-mono text-eyebrow text-muted-foreground ml-auto">
                                  {formatDuration(track.durationSeconds)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Acoustic Details (BPM & Musical Key) */}
                        <div className="flex items-center gap-3 pt-1 border-t border-border-soft/40">
                          <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground">
                            Acoustics:
                          </span>
                          <div className="flex items-center gap-1.5">
                            <label className="font-eyebrow text-eyebrow uppercase text-muted-foreground">
                              BPM
                            </label>
                            <input
                              type="number"
                              min={30}
                              max={300}
                              placeholder="Auto/120"
                              value={track.bpm ?? ''}
                              onChange={(e) => {
                                const val = e.target.value
                                  ? Number(e.target.value)
                                  : null
                                setEditTracks((prev) =>
                                  prev.map((t) =>
                                    t.id === track.id
                                      ? { ...t, bpm: val }
                                      : t,
                                  ),
                                )
                              }}
                              className="w-20 font-mono text-eyebrow py-0.5 px-2 border border-border bg-card text-foreground"
                            />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <label className="font-eyebrow text-eyebrow uppercase text-muted-foreground">
                              Key
                            </label>
                            <input
                              type="text"
                              placeholder="e.g. C min"
                              value={track.musicalKey ?? ''}
                              onChange={(e) => {
                                const val = e.target.value
                                setEditTracks((prev) =>
                                  prev.map((t) =>
                                    t.id === track.id
                                      ? { ...t, musicalKey: val }
                                      : t,
                                  ),
                                )
                              }}
                              className="w-24 font-mono text-eyebrow py-0.5 px-2 border border-border bg-card text-foreground"
                            />
                          </div>
                        </div>

                        {/* Collaborator & Credit Attribution */}
                        <div className="pt-2 border-t border-border-soft/60">
                          <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block mb-1.5">
                            Collaborator Credits (Featured / Producers /
                            Composers / Lyricists)
                          </span>
                          <ArtistCreditPicker
                            credits={track.credits || []}
                            onChange={(newCredits) =>
                              setEditTracks((prev) =>
                                prev.map((t) =>
                                  t.id === track.id
                                    ? { ...t, credits: newCredits }
                                    : t,
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

              {/* Submit / Cancel Actions */}
              <div className="flex items-center justify-between gap-3 pt-4 border-t border-border pb-safe">
                <button
                  type="button"
                  onClick={handleCloseEditModal}
                  disabled={isSavingRelease}
                  className="font-eyebrow text-eyebrow uppercase tracking-wider py-2.5 px-4 border border-border rounded-control text-muted-foreground hover:text-foreground cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingRelease || isUploadingEditCover}
                  className="font-eyebrow text-eyebrow uppercase tracking-wider py-2.5 px-6 bg-primary text-primary-foreground rounded-control hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 font-semibold flex items-center gap-2 shadow-raised"
                >
                  {isSavingRelease ? (
                    <span>Saving Changes...</span>
                  ) : (
                    <span>✦ Save Release Changes</span>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
