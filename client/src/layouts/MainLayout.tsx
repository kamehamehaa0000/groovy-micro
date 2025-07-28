import { useEffect, useState } from 'react'
import { useJamActions } from '../store/jam-store'

import { BiUser } from 'react-icons/bi'
import { FloatingPlayer } from '../components/player/FloatingPlayer'
import { LeftSidebar } from '../components/LeftSidebar'
import { usePlayerStore } from '../store/player-store'
import { useAuthStore } from '../store/auth-store'
import { Link } from 'react-router'
import {
  TbLayoutSidebarLeftCollapse,
  TbLayoutSidebarRightCollapse,
} from 'react-icons/tb'

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
      {/* This div will now shrink to make space for the expanded player */}
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
            {/* <div className="w-full mx-auto lg:m-0 max-w-4xl">
              <SearchBar />
            </div> */}
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

const UserProfile = () => {
  const { user, isAuthenticated, logout } = useAuthStore()
  if (!user) return null
  if (!isAuthenticated) {
    return (
      <div className="flex items-center">
        <Link
          to="/login"
          className="flex items-center gap-2  px-4 py-1 border border-gray-300 rounded-full text-sm font-semibold"
        >
          <BiUser className="w-4 h-4" />
          <span>Sign In</span>
        </Link>
      </div>
    )
  }
  return (
    <div className=" flex items-center lg:space-x-3 lg:p-3 p-1.5 rounded-lg cursor-pointer transition-colors">
      <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center ">
        <BiUser className="w-4 h-4  text-gray-500" />
      </div>
      <div className="flex-1 hidden lg:block">
        <p className=" text-sm font-medium text-gray-900">
          {user.displayName || user.email}
        </p>
        <button
          onClick={logout}
          className="text-xs font-semibold text-gray-600 hover:text-red-700 "
        >
          Sign Out
        </button>
      </div>
    </div>
  )
}
