import { PiCassetteTapeLight } from 'react-icons/pi'

import { TbLayoutSidebarLeftCollapse } from 'react-icons/tb'
import { Link, NavLink } from 'react-router'

import { Button, buttonVariants } from '../ui/button'

import {
  Disc3,
  FolderUp,
  Heart,
  Home,
  ListMusic,
  Search,
  Upload,
} from 'lucide-react'
import { UserPlaylist } from './UserPlaylist'

interface LeftSidebarProps {
  isVisible: boolean
  onClose: () => void
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  isVisible,
  onClose,
}) => {
  const navigationItems = [
    { id: 'home', label: 'Home', icon: Home, linkTo: '/' },
    { id: 'search', label: 'Search', icon: Search, linkTo: '/search' },
    { id: 'upload', label: 'Upload', icon: Upload, linkTo: '/upload' },
    {
      id: 'myUploads',
      label: 'My Uploads',
      icon: FolderUp,
      linkTo: '/my-uploads',
    },
    {
      id: 'likedSongs',
      label: 'Liked Songs',
      icon: Heart,
      linkTo: '/liked-songs',
    },
    {
      id: 'likedAlbums',
      label: 'Liked Albums',
      icon: Disc3,
      linkTo: '/liked-albums',
    },
    {
      id: 'likedPlaylists',
      label: 'Liked Playlists',
      icon: ListMusic,
      linkTo: '/liked-playlists',
    },
  ]

  return (
    <div
      className={`w-screen h-full lg:w-56 bg-background flex flex-col ${
        isVisible ? ' block' : ' hidden'
      } lg:block `}
    >
      {/* Header */}
      <div className="p-4 pb-6 mt-2 ml-2">
        <div className="flex items-center justify-between">
          <Link to={'/'} className="flex items-center space-x-2 group">
            <PiCassetteTapeLight className="w-8 h-8 group-hover:text-orange-700 group-hover:rotate-12 transition-transform" />
            <span className="text-lg font-semibold text-foreground">
              Groovy
            </span>
          </Link>
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="lg:hidden"
            >
              <TbLayoutSidebarLeftCollapse className="w-6 h-6" />
            </Button>
          )}
        </div>
      </div>

      {/* Navigation */}

      <div className="px-4 py-0.5 mb-8">
        <nav className="space-y-1">
          {navigationItems.map((item) => (
            <NavLink
              key={item.id}
              to={item.linkTo}
              className={({ isActive }) =>
                `${buttonVariants({
                  variant: isActive ? 'secondary' : 'ghost',
                })} w-full justify-start px-2  text-sm font-normal`
              }
            >
              <item.icon className="w-4 h-4 mr-3" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
      <UserPlaylist />
    </div>
  )
}
