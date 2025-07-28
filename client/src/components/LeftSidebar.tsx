import { useEffect, useState } from 'react'
import { BiHeart, BiHome, BiPlus, BiSearch, BiUpload } from 'react-icons/bi'
import { PiCassetteTapeLight } from 'react-icons/pi'
import {
  useCreatePlaylistModalStore,
  useSigninPromptModalStore,
} from '../store/modal-store'
import { getUserPlaylist } from '../service/playlistService'
import { TbLayoutSidebarLeftCollapse } from 'react-icons/tb'
import { Link } from 'react-router'
import { useAuthStore } from '../store/auth-store'

interface LeftSidebarProps {
  isVisible: boolean
  onClose: () => void
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  isVisible,
  onClose,
}) => {
  const [playlists, setPlaylists] = useState<string[]>([])
  const { open } = useCreatePlaylistModalStore()
  const { isAuthenticated } = useAuthStore()
  const { open: openSigninPrompt } = useSigninPromptModalStore()

  const navigationItems = [
    { id: 'home', label: 'Home', icon: BiHome, linkTo: '/' },
    { id: 'search', label: 'Search', icon: BiSearch, linkTo: '/search' },
    { id: 'upload', label: 'Upload', icon: BiUpload, linkTo: '/upload' },
    {
      id: 'likedSongs',
      label: 'Liked Songs',
      icon: BiHeart,
      linkTo: '/liked-songs',
    },
    {
      id: 'likedAlbums',
      label: 'Liked Albums',
      icon: BiHeart,
      linkTo: '/liked-albums',
    },
    {
      id: 'likedPlaylists',
      label: 'Liked Playlists',
      icon: BiHeart,
      linkTo: '/liked-playlists',
    },
  ]

  const dotColors = [
    'bg-amber-500',
    'bg-emerald-500',
    'bg-violet-500',
    'bg-indigo-500',
    'bg-yellow-500',
    'bg-pink-500',
  ]

  useEffect(() => {
    const fetchPlaylists = async () => {
      const { playlists } = await getUserPlaylist()
      setPlaylists(playlists)
    }
    fetchPlaylists()
  }, [])
  return (
    <div
      className={`w-screen lg:w-56 h-full bg-background flex flex-col ${
        isVisible ? ' block' : ' hidden'
      } lg:block `}
    >
      {/* Header */}
      <div className="p-6 pb-8">
        <div className="flex items-center justify-between ">
          <div className="flex items-center space-x-2">
            <PiCassetteTapeLight className="w-8 h-8 " />
            <Link to={'/'} className="text-lg font-medium text-foreground">
              Groovy-Gaana
            </Link>
          </div>
          <button
            onClick={onClose}
            className="md:hidden w-8 h-8 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100/50 transition-all duration-200"
          >
            <TbLayoutSidebarLeftCollapse className="w-6 h-6 text-black" />
          </button>
        </div>
      </div>

      {/* Navigation */}
      <div className="px-4 mb-8">
        <nav className="space-y-2">
          {navigationItems.map((item) => (
            <Link
              to={item.linkTo}
              key={item.id}
              className={
                'w-full flex items-center space-x-3 hover:text-orange-600 px-3 py-2 rounded-md text-left transition-all duration-200 text-sm group'
              }
            >
              <item.icon className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>
      {/* Playlists */}
      <div className="flex-1 max-h-96 px-4 overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Playlists
          </h3>
          <button
            onClick={() => {
              if (!isAuthenticated) {
                openSigninPrompt()
                return
              }
              open()
            }}
            className="w-6 h-6 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-accent/50 flex items-center justify-center group"
          >
            <BiPlus className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />
          </button>
        </div>
        <div className="space-y-0.5 overflow-y-auto">
          {playlists.map((playlist: any, i) => (
            <Link
              to={`/playlists/playlist/${playlist._id}`}
              key={playlist._id}
              className="w-full flex items-center text-left px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-md transition-all duration-200 truncate"
            >
              <span
                className={`w-3 h-3 rounded-full mr-3 ${
                  dotColors[i % dotColors.length]
                }`}
              />
              {playlist.title}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
