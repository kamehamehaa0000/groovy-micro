import { Link } from '@tanstack/react-router'
import { BadgeCheck, ExternalLink, Plus } from 'lucide-react'
import { H1 } from '../ui/typography'
import { ButtonLink } from '../ui/ButtonLink'

interface StudioHeaderProps {
  stageName: string
  slug: string
  verified?: boolean
  onNewRelease?: () => void
}

export function StudioHeader({
  stageName,
  slug,
  verified,
}: StudioHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 ">
      <div className="min-w-0">
        <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-primary block mb-0.5">
          Artist Studio
        </span>
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <H1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl truncate min-w-0">
            {stageName}
          </H1>
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
          className="flex-1 sm:flex-initial justify-center font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-3 sm:px-4 rounded-full bg-card hover:bg-background text-foreground transition-colors flex items-center gap-1.5 "
        >
          <span>Public Profile</span>
          <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0" />
        </Link>

        <ButtonLink
          to="/studio/new"
          variant="pixel"
          size="sm"
        >
          <Plus className="w-3.5 h-3.5 shrink-0" />
          <span>New Release</span>
        </ButtonLink>
      </div>
    </div>
  )
}
