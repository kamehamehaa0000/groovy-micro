import { useState, useRef } from 'react'
import { Disc3 } from 'lucide-react'
import { toast } from 'sonner'
import { catalogApi } from '../../lib/catalog.api'
import type { Song } from '../../types/catalog'
import type { DetachCutRequest } from './studio.types'

interface DetachCutDrawerProps {
  /** The cut to detach and the release it currently belongs to. */
  request: DetachCutRequest
  onClose: () => void
  /** Fired after a successful detach so the route can refetch releases. */
  onReleasesChanged: () => void
  /** Replaces the cached cut list for the parent release after a detach. */
  onAlbumTracksChanged: (albumId: string, tracks: Song[]) => void
}

export function DetachCutDrawer({
  request,
  onClose,
  onReleasesChanged,
  onAlbumTracksChanged,
}: DetachCutDrawerProps) {
  const [detachCoverUrl, setDetachCoverUrl] = useState('')
  const [isUploadingDetachCover, setIsUploadingDetachCover] = useState(false)
  const [isSubmittingDetach, setIsSubmittingDetach] = useState(false)
  const detachCoverInputRef = useRef<HTMLInputElement>(null)

  const handleCloseDetachModal = () => {
    onClose()
    setDetachCoverUrl('')
    if (detachCoverInputRef.current) detachCoverInputRef.current.value = ''
  }

  const handleDetachCoverSelect = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploadingDetachCover(true)
    toast.dismiss()

    try {
      const publicUrl = await catalogApi.uploadAlbumCover(file)
      setDetachCoverUrl(publicUrl)
      toast.success('Custom single artwork uploaded to Cloudflare R2.')
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload single artwork')
    } finally {
      setIsUploadingDetachCover(false)
    }
  }

  const handleConfirmDetach = async () => {

    setIsSubmittingDetach(true)
    toast.dismiss()

    try {
      await catalogApi.updateSong(request.song.id, {
        albumId: null,
        coverImageUrl: detachCoverUrl || undefined,
      })

      toast.success(
        `🎉 Master cut "${request.song.title}" detached and spun off into standalone SINGLE release!`,
      )

      // Refresh album details and releases
      const fullAlbum = await catalogApi.getAlbum(
        request.parentAlbum.id,
      )
      onAlbumTracksChanged(request.parentAlbum.id, fullAlbum.tracks)
      handleCloseDetachModal()
      onReleasesChanged()
    } catch (err: any) {
      toast.error(err.message || 'Failed to detach track')
    } finally {
      setIsSubmittingDetach(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-foreground/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-card border-2 border-border shadow-2xl p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground block">
              Catalog Action &bull; Spin-off Single
            </span>
            <h3 className="font-serif italic text-heading text-foreground">
              Detach Cut
            </h3>
          </div>
          <button
            type="button"
            onClick={handleCloseDetachModal}
            disabled={isSubmittingDetach}
            className="font-mono text-caption text-muted-foreground hover:text-foreground cursor-pointer disabled:opacity-50"
          >
            ✕ Close
          </button>
        </div>

        <p className="font-sans text-caption text-muted-foreground leading-relaxed">
          Detaching{' '}
          <strong className="text-foreground font-medium font-serif italic">
            "{request.song.title}"
          </strong>{' '}
          from{' '}
          <strong className="text-foreground font-medium font-serif italic">
            {request.parentAlbum.title}
          </strong>{' '}
          will turn it into an independent standalone{' '}
          <span className="font-mono text-eyebrow font-semibold text-foreground">
            SINGLE
          </span>{' '}
          release.
        </p>

        {/* Artwork Selection */}
        <div className="space-y-3 pt-1 border-t border-border-soft">
          <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground block">
            Cover Artwork for New Single
          </label>
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 border border-border bg-muted flex items-center justify-center overflow-hidden shrink-0">
              {detachCoverUrl ||
              request.parentAlbum.coverImageUrl ? (
                <img
                  src={
                    detachCoverUrl ||
                    request.parentAlbum.coverImageUrl ||
                    ''
                  }
                  alt="Single Cover Preview"
                  className="w-full h-full object-cover"
                />
              ) : (
                <Disc3 className="w-8 h-8 text-muted-foreground/40 shrink-0" />
              )}
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <label className="font-eyebrow text-eyebrow uppercase tracking-wider py-1.5 px-3 border border-border bg-background hover:border-foreground text-foreground cursor-pointer inline-flex items-center gap-1.5">
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
                    className="font-eyebrow text-eyebrow uppercase tracking-wider py-1.5 px-2 border border-border text-muted-foreground hover:text-destructive hover:border-destructive cursor-pointer"
                  >
                    Revert to Album Art
                  </button>
                )}
              </div>
              <p className="font-mono text-eyebrow text-muted-foreground">
                {detachCoverUrl
                  ? 'Custom cover uploaded (Cloudflare R2 edge).'
                  : 'Will inherit parent album cover if no custom image is uploaded.'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
          <button
            type="button"
            onClick={handleCloseDetachModal}
            disabled={isSubmittingDetach}
            className="font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-4 border border-border text-muted-foreground hover:text-foreground cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmDetach}
            disabled={isSubmittingDetach || isUploadingDetachCover}
            className="font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-5 bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 font-semibold"
          >
            {isSubmittingDetach
              ? 'Detaching Cut...'
              : '✦ Detach & Spin Off Single'}
          </button>
        </div>
      </div>
    </div>
  )
}
