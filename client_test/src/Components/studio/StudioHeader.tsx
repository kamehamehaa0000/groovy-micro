import { Link } from '@tanstack/react-router'
import { BadgeCheck, ExternalLink, Plus } from 'lucide-react'

interface StudioHeaderProps {
  stageName: string
  slug: string
  verified?: boolean
  onNewRelease: () => void
}

export function StudioHeader({
  stageName,
  slug,
  verified,
  onNewRelease,
}: StudioHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-border mb-6">
      <div className="min-w-0">
        <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-primary block mb-0.5">
          Maison Studio Suite
        </span>
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <h1 className="font-serif italic text-2xl sm:text-3xl text-foreground font-semibold truncate min-w-0">
            {stageName}
          </h1>
          {verified && <BadgeCheck className="w-5 h-5 text-primary shrink-0" />}
        </div>
        <span className="font-mono text-caption text-muted-foreground">
          @{slug}
        </span>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <Link
          to="/artists/$idOrSlug"
          params={{ idOrSlug: slug }}
          className="flex-1 sm:flex-initial justify-center font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-3 sm:px-4 border border-border bg-card hover:bg-background text-foreground transition-colors flex items-center gap-1.5 rounded-control"
        >
          <span>Public Profile</span>
          <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0" />
        </Link>

        <button
          type="button"
          onClick={onNewRelease}
          className="flex-1 sm:flex-initial justify-center font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-3.5 sm:px-4 bg-primary text-primary-foreground hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-1.5 shadow-raised font-semibold rounded-control"
        >
          <Plus className="w-3.5 h-3.5 shrink-0" />
          <span>New Release</span>
        </button>
      </div>
    </div>
  )
}
