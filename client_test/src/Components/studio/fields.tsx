/**
 * Studio form primitives — the single source of truth for the field vocabulary shared
 * by the release drawers and the profile form.
 *
 * Everything here reproduces markup that already existed at the call sites, class for
 * class and element for element, so adopting it de-duplicates without moving a pixel.
 * Where the old markup was inconsistent a primitive takes an explicit flag rather than
 * quietly picking a winner; the few places this pass deliberately normalised are
 * called out inline (release date/time inputs gained the focus ring that the other
 * form controls already had, and the liner-notes textareas now share one recipe).
 *
 * This is deliberately not `Components/ui`. Those primitives carry a different
 * contract — `bg-card`, `focus:border-primary`, `rounded-control`, `font-medium`
 * labels — and their controls carry a corner radius where the studio's are square.
 * Converging the two is a design decision rather than a refactor, so this pass
 * leaves it alone.
 * Nothing here reaches for a raw value, so the drift guard still sees tokens only.
 */

import {
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { cn } from '../ui/cn'
import { ArtistCreditPicker, type SelectedCredit } from '../ArtistCreditPicker'
import { CATALOG_MOODS } from '../../lib/taxonomy'

/** The small-caps label recipe: family, size, case, tracking. */
const EYEBROW = 'font-eyebrow text-eyebrow uppercase tracking-wider'

/** Vertical rhythm for the label → control gap, in the three steps already in use. */
const LABEL_SPACING = {
  none: '',
  tight: 'mb-1',
  snug: 'mb-1.5',
  loose: 'mb-2',
} as const

export interface FieldLabelProps {
  children: ReactNode
  /** Form labels are foreground; section captions step back to muted. */
  tone?: 'foreground' | 'muted'
  spacing?: keyof typeof LABEL_SPACING
  /** `block` is what puts the control on the next line; inline rows turn it off. */
  block?: boolean
  className?: string
}

export function FieldLabel({
  children,
  tone = 'foreground',
  spacing = 'snug',
  block = true,
  className,
}: FieldLabelProps) {
  return (
    <label
      className={cn(
        EYEBROW,
        tone === 'muted' ? 'text-muted-foreground' : 'text-foreground',
        block && 'block',
        LABEL_SPACING[spacing],
        className,
      )}
    >
      {children}
    </label>
  )
}

export interface SerifInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Type role: release titles are `title`, the profile's stage name `body`. */
  size?: 'title' | 'body'
  /** List-row control: caption step, tighter padding, card surface, no focus ring. */
  compact?: boolean
}

/** The italic Fraunces control that carries a title. */
export function SerifInput({
  size = 'title',
  compact = false,
  className,
  ...props
}: SerifInputProps) {
  return (
    <input
      className={cn(
        'font-serif italic border border-border text-foreground',
        compact
          ? 'text-caption py-1.5 px-2.5 bg-card'
          : cn(
              'w-full py-2 px-3 bg-background focus:border-foreground focus:outline-none',
              size === 'body' ? 'text-body' : 'text-title',
            ),
        className,
      )}
      {...props}
    />
  )
}

export interface MonoInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /**
   * `md` is the stacked form control, `sm` a compact one (cut-row cell or
   * profile link field), `xs` an inline measurement (acoustics).
   */
  size?: 'md' | 'sm' | 'xs'
  /**
   * Fields on the page surface are standalone and announce focus; the compact
   * ones on `bg-card` sit inside dense rows and stay quiet. Defaults to card for
   * `xs` and the page surface otherwise.
   */
  surface?: 'background' | 'card'
  /** `xs` only — the two fixed widths the acoustics row uses. */
  width?: 'bpm' | 'key'
}

/** Numerals, dates, keys and other compact machine values. */
export function MonoInput({
  size = 'md',
  surface,
  width,
  className,
  ...props
}: MonoInputProps) {
  const onCard = (surface ?? (size === 'xs' ? 'card' : 'background')) === 'card'
  return (
    <input
      className={cn(
        'font-mono border border-border text-foreground',
        size === 'md' && 'w-full text-caption py-2 px-3',
        size === 'sm' && 'w-full text-caption py-1.5 px-2.5',
        size === 'xs' &&
          cn('text-eyebrow py-0.5 px-2', width === 'key' ? 'w-24' : 'w-20'),
        onCard
          ? 'bg-card'
          : 'bg-background focus:border-foreground focus:outline-none',
        className,
      )}
      {...props}
    />
  )
}

export interface TextAreaFieldProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

/** Liner notes and other prose. One recipe for every textarea in the studio. */
export function TextAreaField({ className, ...props }: TextAreaFieldProps) {
  return (
    <textarea
      className={cn(
        'w-full font-sans text-caption py-2.5 px-3 border border-border bg-background text-foreground focus:border-foreground focus:outline-none resize-y leading-relaxed',
        className,
      )}
      {...props}
    />
  )
}

export interface SelectFieldProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  /** The release-format select sits half a step taller than the inline ones. */
  size?: 'md' | 'lg'
}

export function SelectField({
  size = 'md',
  className,
  disabled,
  ...props
}: SelectFieldProps) {
  return (
    <select
      disabled={disabled}
      className={cn(
        'w-full font-mono text-caption border border-border bg-background text-foreground focus:border-foreground focus:outline-none',
        size === 'lg' ? 'py-2.5 px-3' : 'py-2 px-3',
        disabled && 'disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export interface ExplicitCheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  /** Cut rows use the eyebrow step; the single flow uses the caption step. */
  size?: 'eyebrow' | 'caption'
  label?: string
}

/** The advisory "Explicit" marker that rides beside a title or inside a cut row. */
export function ExplicitCheckbox({
  checked,
  onChange,
  size = 'eyebrow',
  label = 'Explicit',
}: ExplicitCheckboxProps) {
  return (
    <label
      className={cn(
        'font-eyebrow uppercase tracking-wider text-muted-foreground flex items-center cursor-pointer',
        size === 'caption' ? 'text-caption gap-1.5' : 'text-eyebrow gap-1',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  )
}

export interface MoodChipRowProps {
  selected: string[]
  onChange: (moods: string[]) => void
  /** Upper bound the studio enforces on mood selection. */
  max?: number
  label?: string
}

/** Multi-select mood chips with the "n/3 selected" counter. */
export function MoodChipRow({
  selected,
  onChange,
  max = 3,
  label = 'Musical Moods (Select 1 to 3)',
}: MoodChipRowProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <FieldLabel block={false} spacing="none">
          {label}
        </FieldLabel>
        <span className="font-mono text-eyebrow text-muted-foreground">
          {selected.length}/{max} selected
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {CATALOG_MOODS.map((mood) => {
          const isSelected = selected.includes(mood)
          return (
            <button
              key={mood}
              type="button"
              onClick={() => {
                if (isSelected) {
                  onChange(selected.filter((m) => m !== mood))
                } else if (selected.length < max) {
                  onChange([...selected, mood])
                }
              }}
              className={cn(
                EYEBROW,
                'py-1 px-2.5 border transition-colors cursor-pointer',
                isSelected
                  ? 'border-foreground bg-foreground text-background font-semibold'
                  : 'border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/50',
              )}
            >
              {mood}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export interface TagChipInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
  label?: string
  placeholder?: string
}

/** Lowercase tag entry: type-and-Enter (or Add) appends a chip, ✕ removes it. */
export function TagChipInput({
  tags,
  onChange,
  label = 'Catalog Tags (Press Enter to add)',
  placeholder = 'e.g. lo-fi, instrumental, summer, acoustic',
}: TagChipInputProps) {
  const [input, setInput] = useState('')

  const commit = () => {
    const trimmed = input.trim().toLowerCase()
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed])
      setInput('')
    }
  }

  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex items-center gap-2 mb-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            }
          }}
          placeholder={placeholder}
          className="flex-1 font-mono text-caption py-1.5 px-3 border border-border bg-background text-foreground focus:border-foreground focus:outline-none"
        />
        <button
          type="button"
          onClick={commit}
          className={cn(
            EYEBROW,
            'py-1.5 px-3 border border-border bg-card hover:bg-background text-foreground cursor-pointer',
          )}
        >
          + Add Tag
        </button>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="font-mono text-eyebrow py-0.5 px-2 border border-border bg-card text-foreground flex items-center gap-1.5"
            >
              <span>#{tag}</span>
              <button
                type="button"
                onClick={() => onChange(tags.filter((t) => t !== tag))}
                className="text-muted-foreground hover:text-destructive cursor-pointer ml-1"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export interface GovernanceToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  title: string
  description: string
  /** Create sets the row on a card, edit on the panel background. */
  surface?: 'card' | 'background'
}

/** The "Discussion & Comments / Enabled-Disabled" row that closes the metadata form. */
export function GovernanceToggle({
  checked,
  onChange,
  title,
  description,
  surface = 'card',
}: GovernanceToggleProps) {
  return (
    <div
      className={cn(
        'p-3.5 border border-border flex items-center justify-between',
        surface === 'background' ? 'bg-background' : 'bg-card',
      )}
    >
      <div>
        <span className={cn(EYEBROW, 'text-foreground block font-semibold')}>
          {title}
        </span>
        <p className="font-sans text-caption text-muted-foreground">
          {description}
        </p>
      </div>
      <label className="flex items-center gap-2 cursor-pointer shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="accent-primary w-4 h-4"
        />
        <span className="font-mono text-caption text-foreground font-medium">
          {checked ? 'Enabled' : 'Disabled'}
        </span>
      </label>
    </div>
  )
}

export interface CreditPickerFieldProps {
  credits: SelectedCredit[]
  onChange: (credits: SelectedCredit[]) => void
  currentArtistId?: string
  label: string
  /** Per-cut blocks sit on a fainter rule than the release-level one. */
  divider?: 'soft' | 'faint'
  /** Per-cut blocks in the create flow wrap their label in a justified row. */
  headingRow?: boolean
  className?: string
}

/** A labelled `ArtistCreditPicker` — the wrapper every credit block was repeating. */
export function CreditPickerField({
  credits,
  onChange,
  currentArtistId,
  label,
  divider = 'soft',
  headingRow = false,
  className,
}: CreditPickerFieldProps) {
  return (
    <div
      className={cn(
        'pt-2 border-t',
        divider === 'faint' ? 'border-border-soft/60' : 'border-border-soft',
        className,
      )}
    >
      {headingRow ? (
        <div className="flex items-center justify-between mb-1.5">
          <span className={cn(EYEBROW, 'text-muted-foreground')}>{label}</span>
        </div>
      ) : (
        <span className={cn(EYEBROW, 'text-muted-foreground block mb-1.5')}>
          {label}
        </span>
      )}
      <ArtistCreditPicker
        credits={credits}
        onChange={onChange}
        currentArtistId={currentArtistId}
      />
    </div>
  )
}

export interface AcousticsRowProps {
  bpm?: number | null
  musicalKey?: string | null
  onBpmChange: (bpm: number | null) => void
  onKeyChange: (key: string) => void
}

/**
 * The compact BPM + key pair that sits under a cut's fields. Its two labels use
 * the untracked eyebrow step, which is why they are not `FieldLabel`s.
 */
export function AcousticsRow({
  bpm,
  musicalKey,
  onBpmChange,
  onKeyChange,
}: AcousticsRowProps) {
  return (
    <div className="flex items-center gap-3 pt-1 border-t border-border-soft/40">
      <span className={cn(EYEBROW, 'text-muted-foreground')}>Acoustics:</span>
      <div className="flex items-center gap-1.5">
        <label className="font-eyebrow text-eyebrow uppercase text-muted-foreground">
          BPM
        </label>
        <MonoInput
          type="number"
          min={30}
          max={300}
          placeholder="Auto/120"
          value={bpm ?? ''}
          onChange={(e) =>
            onBpmChange(e.target.value ? Number(e.target.value) : null)
          }
          size="xs"
          width="bpm"
        />
      </div>
      <div className="flex items-center gap-1.5">
        <label className="font-eyebrow text-eyebrow uppercase text-muted-foreground">
          Key
        </label>
        <MonoInput
          type="text"
          placeholder="e.g. C min"
          value={musicalKey ?? ''}
          onChange={(e) => onKeyChange(e.target.value)}
          size="xs"
          width="key"
        />
      </div>
    </div>
  )
}
