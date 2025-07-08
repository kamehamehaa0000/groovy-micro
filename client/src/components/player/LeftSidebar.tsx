import { useState } from 'react'
import {
  BiHeart,
  BiHome,
  BiLibrary,
  BiMusic,
  BiPlus,
  BiRadio,
  BiSearch,
} from 'react-icons/bi'
import { FaUsers } from 'react-icons/fa'
import { PiCassetteTapeLight } from 'react-icons/pi'
import {
  useCreatePlaylistModalStore,
  useJamModalStore,
} from '../../store/modal-store'

interface LeftSidebarProps {
  isVisible: boolean
  onClose: () => void
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({ isVisible }) => {
  const [activeItem, setActiveItem] = useState<string>('home')
  const { open } = useCreatePlaylistModalStore()
  const { open: openJamModal } = useJamModalStore()
  const navigationItems = [
    { id: 'home', label: 'Home', icon: BiHome },
    { id: 'search', label: 'Search', icon: BiSearch },
    { id: 'library', label: 'Library', icon: BiLibrary },
  ]

  const libraryItems = [
    { id: 'likedSongs', label: 'Liked Songs', icon: BiHeart },
    { id: 'likedAlbums', label: 'Liked Albums', icon: BiHeart },
    { id: 'likedPlaylists', label: 'Liked Playlists', icon: BiHeart },
    { id: 'recently', label: 'Recently Played', icon: BiRadio },
  ]
  const dotColors = [
    'bg-red-600',
    'bg-blue-600',
    'bg-green-600',
    'bg-yellow-600',
    'bg-purple-600',
    'bg-pink-600',
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
      className={`w-56 h-full bg-background flex flex-col ${
        isVisible ? ' block' : ' hidden'
      } lg:block `}
    >
      {/* Header */}
      <div className="p-6 pb-8">
        <div className="flex items-center space-x-2">
          <PiCassetteTapeLight className="w-8 h-8 " />
          <h1 className="text-lg font-medium text-foreground">Groovy-Gaana</h1>
        </div>
      </div>

      {/* Navigation */}
      <div className="px-4 mb-8">
        <nav className="space-y-2">
          <button
            onClick={openJamModal}
            className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-md text-left transition-all duration-200 text-sm group text-muted-foreground hover:text-foreground hover:bg-accent/50"
          >
            <FaUsers className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />
            <span className="font-medium">Start Jam</span>
          </button>
          {navigationItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveItem(item.id)}
              className={
                'w-full flex items-center space-x-3 px-3 py-2.5 rounded-md text-left transition-all duration-200 text-sm group' +
                (activeItem === item.id
                  ? ' bg-accent text-foreground'
                  : ' text-muted-foreground hover:text-foreground hover:bg-accent/50')
              }
            >
              <item.icon className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Library Section */}
      <div className="px-4 mb-6">
        <nav className="space-y-1">
          {libraryItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveItem(item.id)}
              className={
                'w-full flex items-center space-x-3 px-3 py-2 rounded-md text-left transition-all duration-200 text-sm group' +
                (activeItem === item.id
                  ? ' bg-accent text-foreground'
                  : ' text-muted-foreground hover:text-foreground hover:bg-accent/50')
              }
            >
              <item.icon className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Playlists */}
      <div className="flex-1 px-4 overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Playlists
          </h3>
          <button
            onClick={open}
            className="w-6 h-6 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-accent/50 flex items-center justify-center group"
          >
            <BiPlus className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />
          </button>
        </div>
        <div className="space-y-0.5 overflow-y-auto">
          {playlists.map((playlist, i) => (
            <button
              key={i + playlist}
              className="w-full flex items-center text-left px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-md transition-all duration-200 truncate"
            >
              <span
                className={`w-3 h-3 rounded-full mr-3 ${
                  dotColors[i % dotColors.length]
                }`}
              />
              {playlist}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
