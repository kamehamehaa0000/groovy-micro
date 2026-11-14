import type { ElementType, ReactNode } from 'react'
import { cn } from '../cn'
import {
  EYEBROW,
  HEADING_1,
  HEADING_2,
  HEADING_3,
  HEADING_4,
  SUBTITLE,
} from './styles'

export type EyebrowTone = 'muted' | 'ink' | 'brand' | 'success' | 'danger'

export interface EyebrowProps {
  children: ReactNode
  /** Base element. Defaults to `span`. */
  as?: ElementType
  tone?: EyebrowTone
  className?: string
}

const TONE: Record<EyebrowTone, string> = {
  muted: 'text-muted-foreground',
  ink: 'text-foreground',
  brand: 'text-primary',
  success: 'text-success',
  danger: 'text-destructive',
}

/**
 * The small uppercase label above a heading.
 *
 * The family, the size and the tracking come from the `font-eyebrow` and
 * `text-eyebrow` tokens, so the whole app can be re-voiced by flipping one
 * line in `index.css`.
 */
export function Eyebrow({
  children,
  as: Tag = 'span',
  tone = 'muted',
  className,
}: EyebrowProps) {
  return (
    <Tag className={cn(EYEBROW, TONE[tone], className)}>{children}</Tag>
  )
}

export interface HeadingProps {
  children: ReactNode
  className?: string
}

/** The page title. */
export function H1({ children, className }: HeadingProps) {
  return <h1 className={cn(HEADING_1, className)}>{children}</h1>
}

/** A section title. The same size as the page title — one voice. */
export function H2({ children, className }: HeadingProps) {
  return <h2 className={cn(HEADING_2, className)}>{children}</h2>
}

/** A sub-section or card heading. */
export function H3({ children, className }: HeadingProps) {
  return <h3 className={cn(HEADING_3, className)}>{children}</h3>
}

/** The smallest heading — a card title inside a dense panel. */
export function H4({ children, className }: HeadingProps) {
  return <h4 className={cn(HEADING_4, className)}>{children}</h4>
}

export interface SubtitleProps {
  children: ReactNode
  className?: string
}

/** The line under a heading. */
export function Subtitle({ children, className }: SubtitleProps) {
  return <p className={cn(SUBTITLE, className)}>{children}</p>
}

export interface SectionHeadingProps {
  title: ReactNode
  /** The small label above the title. */
  eyebrow?: ReactNode
  subtitle?: ReactNode
  /** A control on the right, e.g. "Show all →". */
  action?: ReactNode
  className?: string
}

/**
 * The header of a shelf or a section.
 *
 * The radio shelf and the recently-played shelf each had their own copy of
 * this block — the same eyebrow, the same title, the same subtitle, the same
 * link — pasted in side by side. One component now owns all four parts, so a
 * section cannot drift from its neighbour.
 */
export function SectionHeading({
  title,
  eyebrow,
  subtitle,
  action,
  className,
}: SectionHeadingProps) {
  return (
    <div className={cn('mb-7 flex items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        {eyebrow ? <Eyebrow className="mb-2">{eyebrow}</Eyebrow> : null}
        <H2>{title}</H2>
        {subtitle ? <Subtitle className="mt-2">{subtitle}</Subtitle> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

export {
  EYEBROW,
  HEADING_1,
  HEADING_2,
  HEADING_3,
  HEADING_4,
  SUBTITLE,
} from './styles'
