import { useState } from 'react'
import { BiBell, BiMenu, BiSearch, BiUser } from 'react-icons/bi'
import { FcSettings } from 'react-icons/fc'
import { AnimatePresence } from 'framer-motion'
import { FloatingPlayer } from '../components/miscle/FloatingPlayer'
import { LeftSidebar } from '../components/miscle/LeftSidebar'

export const MainLayout = ({ children }: { children: React.ReactNode }) => {
  const [isPlayerExpanded, setIsPlayerExpanded] = useState(false)
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(false)

  return (
    <div className="w-screen h-screen flex bg-gray-50 overflow-hidden">
      {/* Left Sidebar */}
      <LeftSidebar
        isVisible={isLeftSidebarOpen}
        onClose={() => setIsLeftSidebarOpen(false)}
      />

      {/* Middle Section - Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-16  border-gray-200 flex items-center justify-between px-6">
          <div className="flex items-center space-x-6">
            <button
              className="lg:hidden text-gray-600 hover:text-gray-900 hover:bg-gray-100"
              onClick={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}
            >
              <BiMenu className="w-5 h-5" />
            </button>

            <nav className="hidden md:flex items-center space-x-6">
              <button className="text-blue-600 hover:text-blue-700 font-medium border-b-2 border-blue-600 pb-1">
                Trends
              </button>
              <button className="text-gray-600 hover:text-gray-900 font-medium">
                Charts
              </button>
              <button className="text-gray-600 hover:text-gray-900 font-medium">
                News
              </button>
              <button className="text-gray-600 hover:text-gray-900 font-medium">
                Discover
              </button>
            </nav>
          </div>

          <div className="flex items-center space-x-4">
            <div className="relative">
              <BiSearch className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search music..."
                className="pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <button className="text-gray-600 hover:text-gray-900 hover:bg-gray-100">
              <BiBell className="w-5 h-5" />
            </button>
            <button className="text-gray-600 hover:text-gray-900 hover:bg-gray-100">
              <FcSettings className="w-5 h-5" />
            </button>
            <button className="text-gray-600 hover:text-gray-900 hover:bg-gray-100">
              <BiUser className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Main Content */}
        <main className="w-full overflow-auto scrollbar-hide">{children}</main>
      </div>

      {/* Right Section - Player (Only shows when expanded) */}
      <AnimatePresence>
        {isPlayerExpanded && (
          <FloatingPlayer
            isExpanded={isPlayerExpanded}
            setIsExpanded={setIsPlayerExpanded}
          />
        )}
      </AnimatePresence>

      {/* Floating Player - Only shows when not expanded */}
      {!isPlayerExpanded && (
        <FloatingPlayer
          isExpanded={isPlayerExpanded}
          setIsExpanded={setIsPlayerExpanded}
        />
      )}
    </div>
  )
}
