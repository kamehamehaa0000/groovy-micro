import type { ReactNode, SVGProps } from 'react'
import { cn } from './cn'

/* ============================================================================
   GROOVY — ICON CONTRACT
   ----------------------------------------------------------------------------
   Every icon in the app is drawn to one geometry, so a screen mixing icons
   never looks accidental:

     · viewBox          24 × 24 (always)
     · stroked icons    fill "none" · stroke "currentColor" · width 2
                        caps + joins "round"
     · glyph icons      fill "currentColor" (play, pause, pin, skip, verified…)
     · colour           inherited from `currentColor` — never hard-coded
     · accessibility    `aria-hidden` by default; pass `aria-label`/`role` for
                        an icon that carries meaning on its own

   Size lives in `className` and uses the Tailwind scale — stick to these five:

     size-3 (12px) · size-3.5 (14px) · size-4 (16px, default) · size-5 (20px)
     · size-6 (24px)

   `className` is a *default parameter* (not a merge), exactly like the old
   `Icons.tsx`: passing `className="size-5"` replaces the default instead of
   fighting it in the cascade.
   ========================================================================= */

export type IconProps = Omit<SVGProps<SVGSVGElement>, 'children' | 'ref'>

interface IconBaseProps extends IconProps {
  /** Filled shape rather than a stroke. */
  glyph?: boolean
  children: ReactNode
}

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

const GLYPH = { fill: 'currentColor' } as const

/** The single geometry wrapper. Use it to add bespoke icons to the set. */
export function IconBase({
  glyph = false,
  className,
  children,
  ...rest
}: IconBaseProps) {
  const labelled = rest['aria-label'] != null || rest.role != null
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden={labelled ? undefined : true}
      focusable="false"
      className={cn('shrink-0', className)}
      {...(glyph ? GLYPH : STROKE)}
      {...rest}
    >
      {children}
    </svg>
  )
}

/* ------------------------------------------------------------------ theme */

export const SunIcon = ({ className = 'size-4', ...p }: IconProps = {}) => (
  <IconBase className={className} {...p}>
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </IconBase>
)

export const MoonIcon = ({ className = 'size-4', ...p }: IconProps = {}) => (
  <IconBase className={className} {...p}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </IconBase>
)

/* ------------------------------------------------------------ navigation */

export const ChevronDownIcon = ({ className = 'size-4', ...p }: IconProps = {}) => (
  <IconBase className={className} {...p}>
    <polyline points="6 9 12 15 18 9" />
  </IconBase>
)

export const ChevronUpIcon = ({ className = 'size-4', ...p }: IconProps = {}) => (
  <IconBase className={className} {...p}>
    <polyline points="6 15 12 9 18 15" />
  </IconBase>
)

export const ChevronLeftIcon = ({ className = 'size-4', ...p }: IconProps = {}) => (
  <IconBase className={className} {...p}>
    <polyline points="15 6 9 12 15 18" />
  </IconBase>
)

export const ChevronRightIcon = ({ className = 'size-4', ...p }: IconProps = {}) => (
  <IconBase className={className} {...p}>
    <polyline points="9 6 15 12 9 18" />
  </IconBase>
)

export const ExternalLinkIcon = ({ className = 'size-4', ...p }: IconProps = {}) => (
  <IconBase className={className} {...p}>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </IconBase>
)

export const XIcon = ({ className = 'size-4', ...p }: IconProps = {}) => (
  <IconBase className={className} {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </IconBase>
)

export const CheckIcon = ({ className = 'size-4', ...p }: IconProps = {}) => (
  <IconBase className={className} {...p}>
    <polyline points="20 6 9 17 4 12" />
  </IconBase>
)

export const MoreHorizontalIcon = ({ className = 'size-4', ...p }: IconProps = {}) => (
  <IconBase className={className} {...p}>
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
    <circle cx="5" cy="12" r="1" />
  </IconBase>
)

export const HomeIcon = ({ className = 'size-4', ...p }: IconProps = {}) => (
  <IconBase className={className} {...p}>
    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </IconBase>
)

export const UserIcon = ({ className = 'size-4', ...p }: IconProps = {}) => (
  <IconBase className={className} {...p}>
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </IconBase>
)

export const BellIcon = ({ className = 'size-4', ...p }: IconProps = {}) => (
  <IconBase className={className} {...p}>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </IconBase>
)

/* -------------------------------------------------------------- playback */

export const PlayIcon = ({ className = 'size-4', ...p }: IconProps = {}) => (
  <IconBase glyph className={className} {...p}>
    <polygon points="5 3 19 12 5 21 5 3" />
  </IconBase>
)

export const PauseIcon = ({ className = 'size-4', ...p }: IconProps = {}) => (
  <IconBase glyph className={className} {...p}>
    <rect x="6" y="4" width="4" height="16" />
    <rect x="14" y="4" width="4" height="16" />
  </IconBase>
)

export const SkipBackIcon = ({ className = 'size-4', ...p }: IconProps = {}) => (
  <IconBase glyph className={className} {...p}>
    <polygon points="19 20 9 12 19 4 19 20" />
    <line x1="5" y1="19" x2="5" y2="5" />
  </IconBase>
)

export const SkipForwardIcon = ({ className = 'size-4', ...p }: IconProps = {}) => (
  <IconBase glyph className={className} {...p}>
    <polygon points="5 4 15 12 5 20 5 4" />
    <line x1="19" y1="5" x2="19" y2="19" />
  </IconBase>
)

export const ShuffleIcon = ({ className = 'size-4', ...p }: IconProps = {}) => (
  <IconBase className={className} {...p}>
    <polyline points="16 3 21 3 21 8" />
    <line x1="4" y1="20" x2="21" y2="3" />
    <polyline points="21 16 21 21 16 21" />
    <line x1="15" y1="15" x2="21" y2="21" />
    <line x1="4" y1="4" x2="9" y2="9" />
  </IconBase>
)

export const RepeatIcon = ({ className = 'size-4', ...p }: IconProps = {}) => (
  <IconBase className={className} {...p}>
    <path d="m17 2 4 4-4 4" />
    <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
    <path d="m7 22-4-4 4-4" />
    <path d="M21 13v1a4 4 0 0 1-4 4H3" />
  </IconBase>
)

export const VolumeIcon = ({ className = 'size-4', ...p }: IconProps = {}) => (
  <IconBase className={className} {...p}>
    <path d="M11 5 6 9H2v6h4l5 4z" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
  </IconBase>
)

/* ----------------------------------------------------------- music media */

export const DiscIcon = ({ className = 'size-4', ...p }: IconProps = {}) => (
  <IconBase className={className} {...p}>
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="3" />
  </IconBase>
)

export const MusicIcon = ({ className = 'size-4', ...p }: IconProps = {}) => (
  <IconBase className={className} {...p}>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </IconBase>
)

/* ----------------------------------------------------------- actions / ui */

export const SearchIcon = ({ className = 'size-4', ...p }: IconProps = {}) => (
  <IconBase className={className} {...p}>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </IconBase>
)

export const PlusIcon = ({ className = 'size-4', ...p }: IconProps = {}) => (
  <IconBase className={className} {...p}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </IconBase>
)

export const MinusIcon = ({ className = 'size-4', ...p }: IconProps = {}) => (
  <IconBase className={className} {...p}>
    <path d="M5 12h14" />
  </IconBase>
)

export const EditIcon = ({ className = 'size-4', ...p }: IconProps = {}) => (
  <IconBase className={className} {...p}>
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </IconBase>
)

export const TrashIcon = ({ className = 'size-4', ...p }: IconProps = {}) => (
  <IconBase className={className} {...p}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </IconBase>
)

export const UndoIcon = ({ className = 'size-4', ...p }: IconProps = {}) => (
  <IconBase className={className} {...p}>
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
  </IconBase>
)

export const RedoIcon = ({ className = 'size-4', ...p }: IconProps = {}) => (
  <IconBase className={className} {...p}>
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </IconBase>
)

export const UploadCloudIcon = ({ className = 'size-4', ...p }: IconProps = {}) => (
  <IconBase className={className} {...p}>
    <polyline points="16 16 12 12 8 16" />
    <line x1="12" y1="12" x2="12" y2="21" />
    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
  </IconBase>
)

export const SortIcon = ({ className = 'size-4', ...p }: IconProps = {}) => (
  <IconBase className={className} {...p}>
    <path d="m3 16 4 4 4-4" />
    <path d="M7 20V4" />
    <path d="m21 8-4-4-4 4" />
    <path d="M17 4v16" />
  </IconBase>
)

export const LockIcon = ({ className = 'size-4', ...p }: IconProps = {}) => (
  <IconBase className={className} {...p}>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </IconBase>
)

export const CalendarIcon = ({ className = 'size-4', ...p }: IconProps = {}) => (
  <IconBase className={className} {...p}>
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </IconBase>
)

export const ClockIcon = ({ className = 'size-4', ...p }: IconProps = {}) => (
  <IconBase className={className} {...p}>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </IconBase>
)

export const InfoIcon = ({ className = 'size-4', ...p }: IconProps = {}) => (
  <IconBase className={className} {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4" />
    <path d="M12 8h.01" />
  </IconBase>
)

export const StarIcon = ({ className = 'size-4', ...p }: IconProps = {}) => (
  <IconBase className={className} {...p}>
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </IconBase>
)

export const HeartIcon = ({
  className = 'size-4',
  filled = false,
  ...p
}: IconProps & { filled?: boolean }) => (
  <IconBase glyph={filled} className={className} {...p}>
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </IconBase>
)

export const PinIcon = ({ className = 'size-4', ...p }: IconProps = {}) => (
  <IconBase glyph className={className} {...p}>
    <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
  </IconBase>
)

export const VerifiedIcon = ({ className = 'size-4', ...p }: IconProps = {}) => (
  <IconBase glyph className={className} {...p}>
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1.2 14.2l-3.5-3.5 1.4-1.4 2.1 2.1 5.3-5.3 1.4 1.4-6.7 6.7z" />
  </IconBase>
)

export const GridIcon = ({ className = 'size-4', ...p }: IconProps = {}) => (
  <IconBase className={className} {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
  </IconBase>
)

export const ListIcon = ({ className = 'size-4', ...p }: IconProps = {}) => (
  <IconBase className={className} {...p}>
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </IconBase>
)

export const PanelRightIcon = ({ className = 'size-4', ...p }: IconProps = {}) => (
  <IconBase className={className} {...p}>
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M15 3v18" />
    <path d="m8.5 9.5 2.5 2.5-2.5 2.5" />
  </IconBase>
)
