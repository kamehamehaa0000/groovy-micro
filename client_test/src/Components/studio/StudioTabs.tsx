import type { StudioTab } from './studio.types'

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
  releaseCount,
  trashCount,
}: StudioTabsProps) {
  const counts: Partial<Record<StudioTab, number>> = {
    releases: releaseCount,
    trash: trashCount,
  }

  return (
    <div className="sticky top-14 z-30 -mx-4 mb-6 flex items-center gap-1.5 overflow-x-auto border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur-md no-scrollbar scroll-smooth sm:mx-0 sm:mb-8 sm:gap-2 sm:px-0 font-eyebrow text-caption uppercase tracking-wider">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onTabChange(tab.id)}
          aria-current={activeTab === tab.id ? 'page' : undefined}
          className={`shrink-0 cursor-pointer whitespace-nowrap rounded-control px-3 py-2 transition-colors sm:px-4 ${
            activeTab === tab.id
              ? 'bg-foreground text-background font-semibold'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          {tab.label}
          {counts[tab.id] !== undefined ? ` (${counts[tab.id]})` : ''}
        </button>
      ))}
    </div>
  )
}
