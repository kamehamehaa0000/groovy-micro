import type { StudioTab } from './studio.types'
import { Button } from '../ui/Button'
import { cn } from '../ui/cn'

interface StudioTabsProps {
  activeTab: StudioTab
  onTabChange: (tab: StudioTab) => void
  releaseCount: number
  trashCount: number
}

const TABS: { id: StudioTab; label: string }[] = [
  { id: 'releases', label: 'Catalog & Releases' },
  { id: 'trash', label: '30-Day Trash' },
  { id: 'profile', label: 'Profile & Branding' },
  { id: 'verification', label: 'Verification Desk' },
]

export function StudioTabs({
  activeTab,
  onTabChange,
  releaseCount: _releaseCount,
  trashCount: _trashCount,
}: StudioTabsProps) {
  return (
    <nav
      aria-label="Studio sections"
      className="sticky top-14 z-30 -mx-4 mb-6 flex items-center gap-1.5 overflow-x-auto sm:border-b sm:border-border bg-background/95 px-4 py-2.5 backdrop-blur-md no-scrollbar scroll-smooth sm:mx-0 sm:mb-8 sm:gap-2 sm:px-0"
    >
      <div className="inline-flex items-center gap-1 rounded-full bg-muted/30 p-1 ">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <Button
              key={tab.id}
              variant="pixel"
              size="sm"
              onClick={() => onTabChange(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'shrink-0 whitespace-nowrap transition-all duration-150',
                isActive
                  ? 'bg-foreground text-background font-semibold shadow-raised hover:bg-foreground hover:text-background'
                  : 'bg-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              )}
            >
              <span>{tab.label}</span>
            </Button>
          )
        })}
      </div>
    </nav>
  )
}
