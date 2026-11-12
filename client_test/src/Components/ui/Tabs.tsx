import type { ReactNode } from 'react'
import { cn } from './cn'

export type TabsVariant = 'pill' | 'underline' | 'mono'

export interface TabItem {
  id: string
  label: ReactNode
  /** Optional trailing count, e.g. "12". */
  count?: number
}

export interface TabsProps {
  items: TabItem[]
  value: string
  onChange: (id: string) => void
  /**
   * - `pill` — rounded, filled when active (settings, profile)
   * - `underline` — a rule under the active tab (public pages)
   * - `mono` — dense, for tool surfaces (admin desks)
   */
  variant?: TabsVariant
  ariaLabel?: string
  className?: string
  itemClassName?: string
}

const LIST: Record<TabsVariant, string> = {
  pill: 'flex items-center gap-1 overflow-x-auto no-scrollbar',
  underline:
    'flex items-center gap-5 overflow-x-auto no-scrollbar border-b border-border',
  mono: 'flex items-center gap-1 overflow-x-auto no-scrollbar border-b border-border',
}

const ITEM: Record<TabsVariant, string> = {
  pill: 'px-3 py-1.5 rounded-full text-caption font-medium transition-colors shrink-0',
  underline:
    'py-2.5 text-eyebrow uppercase tracking-wider border-b-2 -mb-px transition-colors shrink-0',
  mono: 'px-3 py-2 font-mono text-caption border-b-2 -mb-px transition-colors shrink-0',
}

const ACTIVE: Record<TabsVariant, string> = {
  pill: 'bg-foreground text-background',
  underline: 'border-primary text-foreground',
  mono: 'border-primary text-foreground',
}

const INACTIVE: Record<TabsVariant, string> = {
  pill: 'text-muted-foreground hover:text-foreground hover:bg-secondary/40',
  underline:
    'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
  mono: 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
}

/**
 * One tab bar for the whole app.
 *
 * The codebase used to have seven of these — pill here, underline there, a
 * dense mono variant in the admin desks — which is why the same page family
 * never looked like it belonged together. Pages pick a variant; the shape,
 * the hit area and the active treatment stay identical.
 */
export function Tabs({
  items,
  value,
  onChange,
  variant = 'pill',
  ariaLabel = 'Sections',
  className,
  itemClassName,
}: TabsProps) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={cn(LIST[variant], className)}>
      {items.map((item) => {
        const isActive = item.id === value
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(item.id)}
            className={cn(
              ITEM[variant],
              isActive ? ACTIVE[variant] : INACTIVE[variant],
              itemClassName,
            )}
          >
            {item.label}
            {typeof item.count === 'number' ? (
              <span className={cn('ml-1.5 tabular-nums', isActive ? 'opacity-70' : 'opacity-60')}>
                {item.count}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
