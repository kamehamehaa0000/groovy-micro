/**
 * The type system.
 *
 * One scale for every heading in the app. The styles live here, in one file,
 * so a change to the voice of the product is a change to one list — not to
 * forty call sites that each copied the classes.
 */

/**
 * The wide tracking of an eyebrow label.
 *
 * `0.16em` was hard-coded in the two shelf headers that set the tone for the
 * app; it is a theme value now, like every other measurement.
 */
export const EYEBROW_TRACKING = 'tracking-eyebrow-wide'

/**
 * The eyebrow: the small uppercase label above a heading.
 */
export const EYEBROW = `font-eyebrow text-eyebrow font-semibold uppercase ${EYEBROW_TRACKING}`

/**
 * The one heading size. A page title and a section title are the same
 * size — the app has one voice, not two.
 */
export const HEADING_1 = 'text-2xl font-semibold tracking-tight text-foreground sm:text-3xl'
export const HEADING_2 = 'text-2xl font-semibold tracking-tight text-foreground sm:text-3xl'

/** A sub-section or card heading. */
export const HEADING_3 = 'text-title font-semibold tracking-tight text-foreground sm:text-lg'

/** The smallest heading — a card title inside a dense panel. */
export const HEADING_4 = 'text-body font-semibold text-foreground'

/** The line under a heading. */
export const SUBTITLE = 'text-sm text-muted-foreground'

/** A quieter line under a heading, for dense panels. */
export const SUBTITLE_SMALL = 'text-caption text-muted-foreground'

/** The right-hand control of a heading block ("Show all →"). */
export const HEADING_ACTION =
  'shrink-0 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground'
