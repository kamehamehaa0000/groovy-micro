import { Check } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from './cn'

export type SwitchSize = 'sm' | 'md'

export interface SwitchProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'type'> {
  /** Current on/off state. */
  checked: boolean
  /** Called with the next state whenever the switch is toggled. */
  onChange: (checked: boolean) => void
  size?: SwitchSize
}

const TRACK: Record<SwitchSize, string> = {
  sm: 'h-5 w-9',
  md: 'h-6 w-11',
}

const THUMB: Record<SwitchSize, string> = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
}

const THUMB_ON: Record<SwitchSize, string> = {
  sm: 'translate-x-4',
  md: 'translate-x-5',
}

const ICON: Record<SwitchSize, string> = {
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
}

/**
 * Boolean on/off switch.
 *
 * The track carries the state colour (primary when on, a quiet ink tint when
 * off) and the thumb springs across with a short overshoot. Only colour,
 * transform and opacity animate, so toggling never triggers layout.
 */
export function Switch({
  checked,
  onChange,
  size = 'md',
  disabled = false,
  className,
  onClick,
  ...rest
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-state={checked ? 'checked' : 'unchecked'}
      disabled={disabled}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented) onChange(!checked)
      }}
      className={cn(
        'group relative inline-flex shrink-0 cursor-pointer items-center rounded-full border transition-[background-color,border-color,box-shadow] duration-200 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-45',
        TRACK[size],
        checked
          ? 'border-primary bg-primary hover:border-primary-strong hover:bg-primary-strong'
          : 'border-border bg-foreground/15 hover:border-primary/50 hover:bg-foreground/20',
        className,
      )}
      {...rest}
    >
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none relative flex items-center justify-center rounded-full shadow-xs ring-1 ring-border/60',
          'transition-[transform,background-color,box-shadow] duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
          'group-hover:scale-105 group-active:scale-90',
          'motion-reduce:transition-none motion-reduce:group-hover:scale-100 motion-reduce:group-active:scale-100',
          THUMB[size],
          checked ? THUMB_ON[size] : 'translate-x-0.5',
          checked ? 'bg-primary-foreground' : 'bg-background',
        )}
      >
        <Check
          strokeWidth={3.5}
          className={cn(
            'text-primary transition-[transform,opacity] duration-150 ease-out',
            ICON[size],
            checked ? 'scale-100 opacity-100' : 'scale-50 opacity-0',
          )}
        />
      </span>
    </button>
  )
}
