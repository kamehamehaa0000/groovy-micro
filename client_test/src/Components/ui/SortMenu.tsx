import { useEffect, useRef, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import { SortIconSVG } from '../Icons'
import { cn } from './cn'

export interface SortOption<T extends string = string> {
  value: T
  label: string
  /** Default direction to switch to when this option is chosen. */
  defaultDirection?: 'asc' | 'desc'
  /** If false, hides the direction toggle when this option is active (e.g. "recommended"). */
  supportsDirection?: boolean
}

export interface SortMenuProps<T extends string = string> {
  options: SortOption<T>[]
  value: T
  onChange: (value: T) => void
  direction?: 'asc' | 'desc'
  onDirectionChange?: (dir: 'asc' | 'desc') => void
  label?: string
  className?: string
  triggerClassName?: string
}

export function SortMenu<T extends string = string>({
  options,
  value,
  onChange,
  direction = 'desc',
  onDirectionChange,
  label = 'Sort by',
  className,
  triggerClassName,
}: SortMenuProps<T>) {
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const currentOption = options.find((opt) => opt.value === value) || options[0]

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
        triggerRef.current?.focus()
      }
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen])

  const handleSelect = (opt: SortOption<T>) => {
    onChange(opt.value)
    if (onDirectionChange && opt.defaultDirection && opt.defaultDirection !== direction) {
      onDirectionChange(opt.defaultDirection)
    }
    setIsOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <div className={cn('inline-flex items-center gap-1 select-none', className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className={cn(
          'group flex items-center gap-1.5 font-medium text-caption text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-control px-1 py-1 cursor-pointer',
          triggerClassName,
        )}
      >
        <SortIconSVG className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
        <span className="truncate">{currentOption?.label ?? value}</span>
      </button>

      {onDirectionChange && currentOption?.supportsDirection !== false && (
        <button
          type="button"
          onClick={() => onDirectionChange(direction === 'asc' ? 'desc' : 'asc')}
          title={direction === 'asc' ? 'Sort descending' : 'Sort ascending'}
          aria-label={direction === 'asc' ? 'Sort descending' : 'Sort ascending'}
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 cursor-pointer"
        >
          <ArrowUp
            className={cn(
              'h-3.5 w-3.5 transition-transform duration-200 ease-out',
              direction === 'desc' ? 'rotate-180' : 'rotate-0',
            )}
            aria-hidden="true"
          />
        </button>
      )}

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={label}
          className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-scrim/60 backdrop-blur-xs transition-opacity duration-200 animate-in fade-in"
            onClick={() => {
              setIsOpen(false)
              triggerRef.current?.focus()
            }}
          />

          {/* Modal surface */}
          <div
            ref={panelRef}
            className="relative z-10 w-full max-h-[80vh] overflow-y-auto rounded-t-2xl border-t border-border bg-card p-4 pb-safe shadow-floating transition-transform select-none sm:max-w-xs sm:rounded-2xl sm:border sm:p-5 animate-in slide-in-from-bottom-2 sm:zoom-in-95 duration-200"
          >
            {/* Mobile handle */}
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border sm:hidden" />

            <div className="mb-3 px-1 font-eyebrow text-eyebrow font-medium uppercase tracking-wider text-muted-foreground">
              {label}
            </div>

            <div className="flex flex-col gap-1">
              {options.map((opt) => {
                const isSelected = opt.value === value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelect(opt)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-inset px-3 py-2.5 text-left text-body transition-colors cursor-pointer',
                      isSelected
                        ? 'bg-background font-semibold text-foreground shadow-raised'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <span>{opt.label}</span>
                    {isSelected && (
                      <svg
                        className="h-4 w-4 shrink-0 text-success"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
