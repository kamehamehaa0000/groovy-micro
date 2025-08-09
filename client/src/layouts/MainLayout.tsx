import { useEffect, useState } from 'react'
import { useJamActions } from '../store/jam-store'
import { FloatingPlayer } from '../components/player/FloatingPlayer'
import { LeftSidebar } from '../components/LeftSidebar'
import { usePlayerStore } from '../store/player-store'
import {
  TbLayoutSidebarLeftCollapse,
  TbLayoutSidebarRightCollapse,
} from 'react-icons/tb'
import { UserProfile } from '@/components/UserProfile'

export const MainLayout = ({ children }: { children: React.ReactNode }) => {
  const { connect, disconnect } = useJamActions()
  const { isExpanded: isPlayerExpanded } = usePlayerStore()
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(false)

  useEffect(() => {
    connect()
    return () => {
      disconnect()
    }
  }, [connect, disconnect])

  return (
    <div className="w-screen h-screen flex bg-white overflow-hidden">
      {/* Left Sidebar */}
      <LeftSidebar
        isVisible={isLeftSidebarOpen}
        onClose={() => setIsLeftSidebarOpen(false)}
      />

      {/* Middle Section - Main Content */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out ${
          isPlayerExpanded ? 'lg:mr-[380px]' : 'mr-0'
        }`}
      >
        {/* Top Bar */}
        <header className="w-full h-16 bg-white border-gray-200 flex items-center justify-between px-4 lg:px-6 flex-shrink-0">
          <div className="flex items-center gap-4 flex-1">
            <button
              className="lg:hidden text-gray-600 hover:text-gray-900 hover:bg-gray-100"
              onClick={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}
            >
              {isLeftSidebarOpen ? (
                <TbLayoutSidebarLeftCollapse className="w-6 h-6 " />
              ) : (
                <TbLayoutSidebarRightCollapse className="w-6 h-6 " />
              )}
            </button>
          </div>
          <UserProfile />
        </header>

        {/* Main Content */}
        <main className="flex-1 mx-auto max-w-[98%] border border-gray-200 w-full h-full overflow-auto rounded-xl bg-white mb-6 scrollbar-hide">
          {children}
        </main>
      </div>

      {/* Floating Player is always mounted, but its appearance is handled internally */}
      <FloatingPlayer />
    </div>
  )
}
