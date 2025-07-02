import { useState } from 'react'
import {
  BiHeart,
  BiHome,
  BiLibrary,
  BiMusic,
  BiPlus,
  BiRadio,
  BiSearch,
  BiUser,
} from 'react-icons/bi'

interface LeftSidebarProps {
  isVisible: boolean
  onClose: () => void
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  isVisible,
  onClose,
}) => {
  const [activeItem, setActiveItem] = useState<string>('home')

  const navigationItems = [
    { id: 'home', label: 'Home', icon: BiHome },
    { id: 'search', label: 'Search', icon: BiSearch },
    { id: 'library', label: 'Library', icon: BiLibrary },
  ]

  const libraryItems = [
    { id: 'liked', label: 'Liked Songs', icon: BiHeart },
    { id: 'recently', label: 'Recently Played', icon: BiLibrary },
    { id: 'radio', label: 'Radio', icon: BiRadio },
  ]

  const playlists = [
    'My Playlist #1',
    'Chill Vibes',
    'Workout Mix',
    'Road Trip',
    'Focus Music',
  ]

  return (
    <div
      className={`w-60 h-full bg-white flex flex-col ${
        isVisible ? 'block' : 'hidden'
      } lg:block`}
    >
      {/* Header */}
      <div className="p-6">
        <div className="flex items-center space-x-3">
          <div className="w-7 h-7 bg-black rounded-md flex items-center justify-center">
            <BiMusic className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-lg font-semibold text-gray-900">Music</h1>
        </div>
      </div>

      {/* Navigation */}
      <div className="px-6 mb-8">
        <nav className="space-y-2">
          {navigationItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveItem(item.id)}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-md text-left transition-all duration-200 ${
                activeItem === item.id
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Library Section */}
      <div className="px-6 mb-8">
        <nav className="space-y-1">
          {libraryItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveItem(item.id)}
              className={`w-full flex items-center space-x-3 px-3 py-2 rounded-md text-left transition-all duration-200 ${
                activeItem === item.id
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <item.icon className="w-4 h-4" />
              <span className="text-sm font-medium">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Playlists */}
      <div className="flex-1 px-6 overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-gray-400">Playlists</h3>
          <button className="w-5 h-5 text-gray-400 hover:text-gray-600 transition-colors">
            <BiPlus className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-1 overflow-y-auto">
          {playlists.map((playlist, i) => (
            <button
              key={i}
              className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-md transition-all duration-200"
            >
              {playlist}
            </button>
          ))}
        </div>
      </div>

      {/* User Profile */}
      <div className="p-6 mt-auto">
        <div className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
          <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
            <BiUser className="w-4 h-4 text-gray-500" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">John Doe</p>
            <p className="text-xs text-gray-400">Premium</p>
          </div>
        </div>
      </div>
    </div>
  )
}
