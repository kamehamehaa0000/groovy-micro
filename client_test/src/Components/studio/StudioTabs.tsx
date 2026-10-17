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
    <div className="flex items-center gap-1.5 sm:gap-2 border-b border-border pb-2.5 mb-6 sm:mb-8 font-eyebrow text-caption uppercase tracking-wider overflow-x-auto no-scrollbar scroll-smooth">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onTabChange(tab.id)}
          className={`py-2 px-3 sm:px-4 rounded-control cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
            activeTab === tab.id
              ? 'bg-foreground text-background font-semibold'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          {tab.label}
          {counts[tab.id] !== undefined ? ` (${counts[tab.id]})` : ''}
        </button>
      ))}
    </div>
  )
}
