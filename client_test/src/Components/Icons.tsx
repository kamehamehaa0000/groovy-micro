import {
  CalendarIcon,
  ChevronDownIcon,
  DiscIcon,
  EditIcon,
  ExternalLinkIcon,
  GridIcon,
  HeartIcon,
  ListIcon,
  LockIcon,
  MusicIcon,
  PanelRightIcon,
  PauseIcon,
  PinIcon,
  PlayIcon,
  PlusIcon,
  SearchIcon,
  ShuffleIcon,
  SortIcon,
  SunIcon,
  MoonIcon,
  TrashIcon,
  UndoIcon,
  UploadCloudIcon,
  VerifiedIcon,
} from './ui/Icon'

/* ============================================================================
   Legacy icon names.
   ----------------------------------------------------------------------------
   These used to be hand-rolled SVGs with drifting geometry (12 different
   `strokeWidth`s, half of them missing `strokeLinecap`/`strokeLinejoin`, and
   four different default sizes). They now delegate to the canonical set in
   `./ui/Icon`, so every one of them shares the same 24×24 / stroke-2 /
   round-cap / currentColor contract — with the old default size preserved, so
   no call site shifts.

   New code should import from `./ui` (or `./ui/Icon`) directly.
   ========================================================================= */

export const DarkModeSVG = ({
  className = 'size-3.5 text-primary',
}: {
  className?: string
}) => <SunIcon className={className} />

export const LightModeSVG = ({
  className = 'size-3.5 text-primary',
}: {
  className?: string
}) => <MoonIcon className={className} />

export const ExternalLinkSVG = ({
  className = 'size-3',
}: {
  className?: string
}) => <ExternalLinkIcon className={className} />

export const UploadCloudSVG = ({
  className = 'size-5',
}: {
  className?: string
}) => <UploadCloudIcon className={className} />

export const PlayIconSVG = ({ className = 'size-4' }: { className?: string }) => (
  <PlayIcon className={className} />
)

export const PauseIconSVG = ({ className = 'size-4' }: { className?: string }) => (
  <PauseIcon className={className} />
)

export const HeartIconSVG = ({
  className = 'size-4',
  filled = false,
}: {
  className?: string
  filled?: boolean
}) => <HeartIcon className={className} filled={filled} />

export const DiscIconSVG = ({ className = 'size-4' }: { className?: string }) => (
  <DiscIcon className={className} />
)

export const MusicIconSVG = ({ className = 'size-4' }: { className?: string }) => (
  <MusicIcon className={className} />
)

export const TrashIconSVG = ({ className = 'size-4' }: { className?: string }) => (
  <TrashIcon className={className} />
)

export const UndoIconSVG = ({ className = 'size-4' }: { className?: string }) => (
  <UndoIcon className={className} />
)

export const PlusIconSVG = ({ className = 'size-4' }: { className?: string }) => (
  <PlusIcon className={className} />
)

export const LockIconSVG = ({ className = 'size-4' }: { className?: string }) => (
  <LockIcon className={className} />
)

export const CalendarIconSVG = ({
  className = 'size-4',
}: {
  className?: string
}) => <CalendarIcon className={className} />

export const EditIconSVG = ({ className = 'size-4' }: { className?: string }) => (
  <EditIcon className={className} />
)

export const PinIconSVG = ({ className = 'size-4' }: { className?: string }) => (
  <PinIcon className={className} />
)

export const GridIconSVG = ({ className = 'size-4' }: { className?: string }) => (
  <GridIcon className={className} />
)

export const ListIconSVG = ({ className = 'size-4' }: { className?: string }) => (
  <ListIcon className={className} />
)

export const SortIconSVG = ({ className = 'size-4' }: { className?: string }) => (
  <SortIcon className={className} />
)

export const NowPlayingSidebarIconSVG = ({
  className = 'size-4',
}: {
  className?: string
}) => <PanelRightIcon className={className} />

export const ChevronDownIconSVG = ({
  className = 'size-5',
}: {
  className?: string
}) => <ChevronDownIcon className={className} />

export const ShuffleIconSVG = ({
  className = 'size-4',
}: {
  className?: string
}) => <ShuffleIcon className={className} />

export const SearchIconSVG = ({ className = 'size-4' }: { className?: string }) => (
  <SearchIcon className={className} />
)

export const VerifiedBadgeSVG = ({
  className = 'size-4 text-primary',
}: {
  className?: string
}) => <VerifiedIcon className={className} aria-label="Verified Artist" />

/* --------------------------------------------------------------------------
   Brand marks + decorative artwork. Intentionally NOT part of the icon set:
   the Google mark is multi-colour, and the spirals are illustrations.
   ------------------------------------------------------------------------ */

export const GoogleIcon = () => (
  <svg
    height="16"
    viewBox="0 0 18 18"
    width="16"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z"
      fill="#4285F4"
    />
    <path
      d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.98v2.33A9 9 0 0 0 9 18z"
      fill="#34A853"
    />
    <path
      d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.16.28-1.7V4.97H.98A9 9 0 0 0 0 9c0 1.45.35 2.83.98 4.03l2.97-2.33z"
      fill="#FBBC05"
    />
    <path
      d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .98 4.97l2.97 2.33C4.66 5.17 6.65 3.58 9 3.58z"
      fill="#EA4335"
    />
  </svg>
)

export const SvgArtworkSpiral = () => (
  <div className="pointer-events-none absolute -right-16 -bottom-16 size-80 opacity-70">
    {/* Decorative Geometric Vinyl Record SVG Art */}
    <svg viewBox="0 0 100 100" width="100%" height="100%" fill="none">
      <g
        stroke="currentColor"
        className="text-secondary dark:text-secondary/40"
        strokeWidth="0.5"
      >
        {[8, 15, 22, 29, 36, 43, 50].map((r) => (
          <circle key={r} cx="50" cy="50" r={r} />
        ))}
      </g>
      <line
        x1="0"
        y1="0"
        x2="100"
        y2="100"
        stroke="currentColor"
        className="text-secondary dark:text-secondary/40"
        strokeWidth="0.35"
        opacity="0.4"
      />
      <line
        x1="100"
        y1="0"
        x2="0"
        y2="100"
        stroke="currentColor"
        className="text-secondary dark:text-secondary/40"
        strokeWidth="0.35"
        opacity="0.4"
      />
    </svg>
  </div>
)

export const SpiralCoverArtBig = ({ i }: { i: number }) => (
  <svg
    viewBox="0 0 100 100"
    className="size-24 text-secondary dark:text-secondary/30"
    fill="none"
    stroke="currentColor"
    strokeWidth="0.5"
  >
    {[10 + i * 2, 20 + i * 2, 30 + i * 2, 40 + i * 2].map((r) => (
      <circle key={r} cx="50" cy="50" r={r} />
    ))}
  </svg>
)
