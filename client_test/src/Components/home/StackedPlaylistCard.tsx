import { memo } from 'react'
import { Link } from '@tanstack/react-router'
import { PlaylistCover } from '../PlaylistCover'
import type { UserPlaylistSummary } from '../../lib/recommendations.api'
import { cn } from '../ui/cn'

export interface StackedPlaylistCardProps {
  playlist: UserPlaylistSummary
  className?: string
}

export const StackedPlaylistCard = memo(function StackedPlaylistCard({
  playlist,
  className,
}: StackedPlaylistCardProps) {
  return (
    <Link
      to="/playlists/$id"
      params={{ id: playlist.id }}
      className={cn(
        'group relative flex flex-col p-2 pt-3 pr-3 rounded-2xl hover:bg-secondary/30 active:scale-[0.98] transition-all select-none min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        className,
      )}
    >
      {/* 1. Stacked Visual Layers Container */}
      <div className="relative w-full aspect-square mb-2">
        {/* Layer 2 (Deepest offset card) */}
        <div
          aria-hidden="true"
          className="absolute top-0 right-0 w-[calc(100%-10px)] aspect-square rounded-2xl bg-secondary/40 border border-border/30 -translate-x-2.5 -translate-y-2.5 scale-[0.92] origin-top-right z-0"
        />

        {/* Layer 1 (Middle offset card) */}
        <div
          aria-hidden="true"
          className="absolute top-0 right-0 w-[calc(100%-5px)] aspect-square rounded-2xl bg-secondary/80 border border-border/50 -translate-x-1.5 -translate-y-1.5 scale-[0.96] origin-top-right z-[1]"
        />

        {/* Front Cover Artwork */}
        <div className="relative z-10 w-full aspect-square rounded-2xl overflow-hidden bg-muted border border-border shadow-xs">
          <PlaylistCover
            coverImageUrl={playlist.coverImageUrl}
            title={playlist.title}
          />
        </div>
      </div>

      {/* 2. Title & Metadata */}
      <div className="w-full min-w-0">
        <div className="font-semibold text-body truncate text-foreground group-hover:text-primary transition-colors">
          {playlist.title}
        </div>
        <div className="text-caption text-muted-foreground truncate mt-0.5">
          {playlist.totalTracks} tracks · {playlist.isOwner ? 'By you' : playlist.ownerName}
        </div>
      </div>
    </Link>
  )
})
