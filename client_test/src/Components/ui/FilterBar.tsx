import type { ReactNode } from 'react'
import { cn } from '../ui/cn'
import { Input } from './Field'
import { IconButton } from './IconButton'
import { SearchIconSVG } from '../Icons'
import { X } from 'lucide-react'

export interface FilterBarOption<T extends string = string> {
  value: T
  label: string
}

export interface FilterBarProps<T extends string = string> {
  /** The search field. Omit it for pages that only filter by kind. */
  search?: {
    value: string
    onChange: (value: string) => void
    onClear?: () => void
    placeholder?: string
    ariaLabel?: string
  }
  /** Pill filters — scope, type, visibility. */
  options?: FilterBarOption<T>[]
  value?: T
  onOptionChange?: (value: T) => void
  /** The sort control (a `SortMenu`). */
  sort?: ReactNode
  /** Anything else that belongs on the left (e.g. a play-all button). */
  children?: ReactNode
  className?: string
}

/**
 * The toolbar every directory page uses: search, filters, sort.
 *
 * Four directories each built their own, with three different pill styles,
 * two search field sizes and two different sort placements.
 */
export function FilterBar<T extends string = string>({
  search,
  options,
  value,
  onOptionChange,
  sort,
  children,
  className,
}: FilterBarProps<T>) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {search ? (
        <div className="relative w-full sm:max-w-sm">
          <SearchIconSVG className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            inputMode="search"
            value={search.value}
            onChange={(event) => search.onChange(event.target.value)}
            placeholder={search.placeholder ?? 'Search'}
            aria-label={search.ariaLabel ?? 'Search'}
            className="pl-9 pr-10"
          />
          {search.value ? (
            <IconButton
              size="sm"
              aria-label="Clear search"
              onClick={search.onClear}
              className="absolute right-1 top-1/2 -translate-y-1/2"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </IconButton>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {children}
          {options?.map((option) => {
            const isActive = option.value === value
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={isActive}
                onClick={() => onOptionChange?.(option.value)}
                className={cn(
                  'inline-flex min-h-9 items-center justify-center rounded-full border px-3 py-1.5 font-eyebrow text-eyebrow font-medium uppercase tracking-wider transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                  isActive
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground',
                )}
              >
                {option.label}
              </button>
            )
          })}
        </div>

        {sort ? <div className="ml-auto shrink-0">{sort}</div> : null}
      </div>
    </div>
  )
}
