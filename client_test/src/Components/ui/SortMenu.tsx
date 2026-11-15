import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUp, Check } from 'lucide-react'
import { GridIconSVG, ListIconSVG, SortIconSVG } from '../Icons'
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
  /** Optional view mode switcher inside the menu (e.g. for library) */
  viewMode?: 'grid' | 'list'
  onViewModeChange?: (mode: 'grid' | 'list') => void
}

/**
 * Modern floating sort menu matching the Groovy design specification.
 * Features an animated direction toggle button on desktop, collapsible
 * icon-only trigger on mobile, and a clean popover menu with checkmark indicators.
 */
export function SortMenu<T extends string = string>({
  options,
  value,
  onChange,
  direction = 'desc',
  onDirectionChange,
  label = 'Sort by',
  className,
  triggerClassName,
  viewMode,
  onViewModeChange,
}: SortMenuProps<T>) {
  const [isOpen, setIsOpen] = useState(false)
  const [dropdownPos, setDropdownPos] = useState<{
    top: number
    left: number
    openUp: boolean
  } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const currentOption = options.find((opt) => opt.value === value) || options[0]

  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        panelRef.current &&
        !panelRef.current.contains(target)
      ) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  useLayoutEffect(() => {
    if (!isOpen) return

    const updatePosition = () => {
      if (!triggerRef.current) return
      const rect = triggerRef.current.getBoundingClientRect()
      const menuWidth = panelRef.current?.offsetWidth || 210
      const menuHeight = panelRef.current?.offsetHeight || 250
      const margin = 8

      const spaceBelow = window.innerHeight - rect.bottom
      const openUp = spaceBelow < menuHeight + 10 && rect.top > menuHeight + 10

      let left = rect.right - menuWidth
      if (left < margin) {
        left = rect.left
      }
      left = Math.max(margin, Math.min(left, window.innerWidth - menuWidth - margin))
      const top = openUp ? Math.max(margin, rect.top - menuHeight - 6) : rect.bottom + 6

      setDropdownPos({ top, left, openUp })
    }

    updatePosition()

    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [isOpen])

  const toggleOpen = () => {
    if (!isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const menuWidth = 210
      let left = rect.right - menuWidth
      if (left < 8) left = rect.left
      left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8))
      const spaceBelow = window.innerHeight - rect.bottom
      const openUp = spaceBelow < 260 && rect.top > 260
      const top = openUp ? Math.max(8, rect.top - 260 - 6) : rect.bottom + 6
      setDropdownPos({ top, left, openUp })
    }
    setIsOpen((prev) => !prev)
  }

  const handleSelect = (opt: SortOption<T>) => {
    onChange(opt.value)
    if (
      onDirectionChange &&
      opt.defaultDirection &&
      opt.defaultDirection !== direction
    ) {
      onDirectionChange(opt.defaultDirection)
    }
    setIsOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <div
      ref={containerRef}
      className={cn('relative inline-flex items-center gap-1 select-none', className)}
    >
      {/* Main Sort Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleOpen}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Sort by ${currentOption?.label ?? label}`}
        className={cn(
          'group inline-flex h-10 items-center gap-1.5 rounded-full bg-secondary px-3.5 text-caption font-semibold text-foreground transition-all duration-150 hover:bg-muted active:scale-[0.98] cursor-pointer max-sm:h-11 max-sm:w-11 max-sm:p-0 max-sm:justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground',
          isOpen && 'bg-muted ring-1 ring-border',
          triggerClassName,
        )}
      >
        <SortIconSVG className="h-5 w-5 shrink-0 text-foreground" />
        <span className="truncate max-sm:hidden">{currentOption?.label ?? value}</span>
      </button>

      {/* Direction Toggle Button (Desktop) */}
      {onDirectionChange && currentOption?.supportsDirection !== false ? (
        <button
          type="button"
          onClick={() => onDirectionChange(direction === 'asc' ? 'desc' : 'asc')}
          title={direction === 'asc' ? 'Sort descending' : 'Sort ascending'}
          aria-label={direction === 'asc' ? 'Sort descending' : 'Sort ascending'}
          className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-all duration-150 hover:bg-secondary hover:text-foreground active:scale-90 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground max-sm:hidden"
        >
          <ArrowUp
            className={cn(
              'h-4 w-4 transition-transform duration-200 ease-out',
              direction === 'desc' ? 'rotate-180' : 'rotate-0',
            )}
            aria-hidden="true"
          />
        </button>
      ) : null}

      {/* Popover Dropdown Menu (Portaled to prevent clipping in scroll/overflow containers) */}
      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={panelRef}
            role="listbox"
            aria-label={label}
            style={{
              position: 'fixed',
              top: dropdownPos ? `${dropdownPos.top}px` : 0,
              left: dropdownPos ? `${dropdownPos.left}px` : 0,
            }}
            className={cn(
              'z-[100] min-w-[210px] max-w-[calc(100vw-16px)] rounded-surface border border-border/80 bg-popover p-2 shadow-floating select-none animate-in fade-in zoom-in-95 duration-150',
              dropdownPos?.openUp ? 'origin-bottom' : 'origin-top',
            )}
          >
            <div className="flex flex-col gap-0.5">
              {options.map((opt) => {
                const isSelected = opt.value === value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(opt)}
                    className={cn(
                      'flex h-11 w-full items-center gap-2.5 rounded-inset px-3 text-left font-medium text-caption transition-colors cursor-pointer',
                      isSelected
                        ? 'bg-accent font-semibold text-foreground'
                        : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground',
                    )}
                  >
                    <Check
                      className={cn(
                        'h-4 w-4 shrink-0 text-foreground transition-opacity',
                        isSelected ? 'opacity-100' : 'opacity-0',
                      )}
                      aria-hidden="true"
                    />
                    <span className="truncate">{opt.label}</span>
                  </button>
                )
              })}

              {/* Mobile Direction Options */}
              {onDirectionChange && currentOption?.supportsDirection !== false ? (
                <>
                  <div
                    className="my-1.5 h-px bg-border sm:hidden"
                    role="separator"
                  />
                  <button
                    type="button"
                    role="option"
                    aria-selected={direction === 'asc'}
                    onClick={() => {
                      onDirectionChange('asc')
                      setIsOpen(false)
                      triggerRef.current?.focus()
                    }}
                    className={cn(
                      'flex h-11 w-full items-center gap-2.5 rounded-inset px-3 text-left font-medium text-caption transition-colors cursor-pointer sm:hidden',
                      direction === 'asc'
                        ? 'bg-accent font-semibold text-foreground'
                        : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground',
                    )}
                  >
                    <Check
                      className={cn(
                        'h-4 w-4 shrink-0 text-foreground transition-opacity',
                        direction === 'asc' ? 'opacity-100' : 'opacity-0',
                      )}
                      aria-hidden="true"
                    />
                    <span>Ascending</span>
                  </button>
                  <button
                    type="button"
                    role="option"
                    aria-selected={direction === 'desc'}
                    onClick={() => {
                      onDirectionChange('desc')
                      setIsOpen(false)
                      triggerRef.current?.focus()
                    }}
                    className={cn(
                      'flex h-11 w-full items-center gap-2.5 rounded-inset px-3 text-left font-medium text-caption transition-colors cursor-pointer sm:hidden',
                      direction === 'desc'
                        ? 'bg-accent font-semibold text-foreground'
                        : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground',
                    )}
                  >
                    <Check
                      className={cn(
                        'h-4 w-4 shrink-0 text-foreground transition-opacity',
                        direction === 'desc' ? 'opacity-100' : 'opacity-0',
                      )}
                      aria-hidden="true"
                    />
                    <span>Descending</span>
                  </button>
                </>
              ) : null}

              {/* View Mode Options */}
              {viewMode && onViewModeChange ? (
                <>
                  <div
                    className="my-1.5 h-px bg-border"
                    role="separator"
                  />
                  <div className="px-3 py-1 font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground">
                    View as
                  </div>
                  <button
                    type="button"
                    role="option"
                    aria-selected={viewMode === 'list'}
                    onClick={() => {
                      onViewModeChange('list')
                      setIsOpen(false)
                      triggerRef.current?.focus()
                    }}
                    className={cn(
                      'flex h-11 w-full items-center gap-2.5 rounded-inset px-3 text-left font-medium text-caption transition-colors cursor-pointer',
                      viewMode === 'list'
                        ? 'bg-accent font-semibold text-foreground'
                        : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground',
                    )}
                  >
                    <Check
                      className={cn(
                        'h-4 w-4 shrink-0 text-foreground transition-opacity',
                        viewMode === 'list' ? 'opacity-100' : 'opacity-0',
                      )}
                      aria-hidden="true"
                    />
                    <ListIconSVG className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">List</span>
                  </button>
                  <button
                    type="button"
                    role="option"
                    aria-selected={viewMode === 'grid'}
                    onClick={() => {
                      onViewModeChange('grid')
                      setIsOpen(false)
                      triggerRef.current?.focus()
                    }}
                    className={cn(
                      'flex h-11 w-full items-center gap-2.5 rounded-inset px-3 text-left font-medium text-caption transition-colors cursor-pointer',
                      viewMode === 'grid'
                        ? 'bg-accent font-semibold text-foreground'
                        : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground',
                    )}
                  >
                    <Check
                      className={cn(
                        'h-4 w-4 shrink-0 text-foreground transition-opacity',
                        viewMode === 'grid' ? 'opacity-100' : 'opacity-0',
                      )}
                      aria-hidden="true"
                    />
                    <GridIconSVG className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">Grid</span>
                  </button>
                </>
              ) : null}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
