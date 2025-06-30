import { useState } from 'react'
import React from 'react'
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
  const [activeItem, setActiveItem] = useState('home')

  const navigationItems = [
    { id: 'home', label: 'Home', icon: BiHome },
    { id: 'search', label: 'Search', icon: BiSearch },
    { id: 'library', label: 'Your Library', icon: BiLibrary },
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
      className={`w-64 h-full bg-white border-r border-gray-200 flex flex-col ${
        isVisible ? 'block' : 'hidden'
      } lg:block`}
    >
      {/* Header */}
      <div className="p-6 border-b border-gray-100">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
            <BiMusic className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Music</h1>
        </div>
      </div>

      {/* Navigation */}
      <div className="p-4">
        <nav className="space-y-1">
          {navigationItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveItem(item.id)}
              className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left transition-colors ${
                activeItem === item.id
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Library Section */}
      <div className="px-4 pb-4">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 px-3">
          Library
        </h3>
        <nav className="space-y-1">
          {libraryItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveItem(item.id)}
              className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left transition-colors ${
                activeItem === item.id
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <item.icon className="w-4 h-4" />
              <span className="text-sm">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Playlists */}
      <div className="flex-1 px-4 overflow-hidden">
        <div className="flex items-center justify-between mb-3 px-3">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Playlists
          </h3>
          <button className="w-6 h-6 p-0 text-gray-400 hover:text-gray-600">
            <BiPlus className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-1 overflow-y-auto scrollbar-hide">
          {playlists.map((playlist, i) => (
            <button
              key={i}
              className="w-full text-left px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
            >
              {playlist}
            </button>
          ))}
        </div>
      </div>

      {/* User Profile */}
      <div className="p-4 border-t border-gray-100">
        <div className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer">
          <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
            <BiUser className="w-4 h-4 text-gray-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900">John Doe</p>
            <p className="text-xs text-gray-500">Premium</p>
          </div>
        </div>
      </div>
    </div>
  )
}
