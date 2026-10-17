import { Disc3 } from 'lucide-react'
import { toast } from 'sonner'
import { CreateReleaseDrawer } from '../CreateReleaseDrawer'
import { ReleaseCard } from '../ReleaseCard'
import type { ArtistProfile } from '../../../types/artist'
import type { ReleasesState } from '../hooks/useReleases'

interface ReleasesTabProps {
  artistProfile: ArtistProfile
  releases: ReleasesState
}

export function ReleasesTab({ artistProfile, releases }: ReleasesTabProps) {
  const {
    isCreateReleaseOpen,
    setIsCreateReleaseOpen,
    loadReleases,
    albums,
    isLoadingReleases,
    expandedAlbumId,
    albumTrackMap,
    isLoadingAlbumTracks,
    visibilityMenuId,
    setVisibilityMenuId,
    handleQuickChangeVisibility,
    handleToggleAlbumExpand,
    setEditingAlbum,
    handleDeleteAlbum,
    handleOpenDetachModal,
    handleDeleteSong,
  } = releases

  return (
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
                    toast.success(
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
                  onDetachCut={(track) =>
                    handleOpenDetachModal(track, album)
                  }
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
  )
}
