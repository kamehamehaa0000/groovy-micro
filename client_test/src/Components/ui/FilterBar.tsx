import { useRef, type ReactNode } from 'react'
import { Check, Search, X } from 'lucide-react'
import { cn } from './cn'

export interface FilterBarOption<T extends string = string> {
  value: T
  label: string
  count?: number
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
 * Modern directory controls bar matching the Groovy design specification.
 * Combines search input, filter pills, and sort controls into a cohesive,
 * responsive toolbar with horizontal mobile flow and clean active states.
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
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div
      role="search"
      className={cn(
        'relative flex flex-wrap items-center gap-2.5 sm:gap-3 py-1.5',
        className,
      )}
    >
      {/* Search Input */}
      {search ? (
        <div
          className={cn(
            'relative sm:max-w-[440px] max-sm:order-1',
            sort
              ? 'flex-1 min-w-0'
              : 'max-sm:basis-full max-sm:w-full flex-1 sm:min-w-[240px]',
          )}
        >
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            inputMode="search"
            enterKeyHint="search"
            value={search.value}
            onChange={(event) => search.onChange(event.target.value)}
            placeholder={search.placeholder ?? 'Search'}
            aria-label={search.ariaLabel ?? 'Search'}
            autoComplete="off"
            className="h-12 w-full rounded-full border-none bg-secondary pl-11 pr-11 text-body text-foreground placeholder:text-muted-foreground transition-all duration-150 focus:bg-muted focus:outline-none focus:ring-2 focus:ring-foreground max-sm:h-11 max-sm:text-caption [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
          />
          {search.value ? (
            <button
              type="button"
              onClick={() => {
                search.onClear?.()
                inputRef.current?.focus()
              }}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground active:scale-95 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Filter Pills / Chips - Always forced to dedicated line on mobile via basis-full */}
      {(options && options.length > 0) || children ? (
        <div
          role="group"
          aria-label="Filter options"
          className="flex items-center gap-2 overflow-x-auto scrollbar-none py-1 sm:flex-1 sm:min-w-0 max-sm:order-3 max-sm:basis-full max-sm:w-full max-sm:flex-none"
        >
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
                  'inline-flex h-10 items-center justify-center gap-1.5 rounded-surface px-4 text-caption font-semibold whitespace-nowrap transition-all duration-150 active:scale-[0.98] cursor-pointer max-sm:h-9 max-sm:px-3.5',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground',
                  isActive
                    ? 'bg-accent text-foreground shadow-xs'
                    : 'bg-secondary text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {isActive && (
                  <Check className="h-4 w-4 shrink-0 text-foreground" />
                )}
                <span>{option.label}</span>
                {option.count !== undefined && (
                  <span className="font-normal text-muted-foreground ml-0.5 text-eyebrow tabular-nums">
                    {option.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      ) : null}

      {/* Sort Menu on Right */}
      {sort ? (
        <div className="ml-auto shrink-0 max-sm:order-2 max-sm:ml-0">
          {sort}
        </div>
      ) : null}
    </div>
  )
}
