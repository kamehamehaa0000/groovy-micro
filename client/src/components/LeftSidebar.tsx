import { useEffect, useState } from 'react'
import {
  BiAlbum,
  BiHeart,
  BiHome,
  BiPlus,
  BiRefresh,
  BiSearch,
  BiSolidPlaylist,
  BiUpload,
} from 'react-icons/bi'
import { PiCassetteTapeLight } from 'react-icons/pi'
import {
  useCreatePlaylistModalStore,
  useSigninPromptModalStore,
} from '../store/modal-store'
import { TbLayoutSidebarLeftCollapse } from 'react-icons/tb'
import { Link, NavLink } from 'react-router'
import { useAuthStore } from '../store/auth-store'
import { Button, buttonVariants } from './ui/button'
import { ScrollArea } from './ui/scroll-area'
import { PlaylistSkeleton } from './skeletons/PlaylistsSkeleton'
import { useUserPlaylists } from '@/service/queries/playlistQuery'

interface LeftSidebarProps {
  isVisible: boolean
  onClose: () => void
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  isVisible,
  onClose,
}) => {
  const navigationItems = [
    { id: 'home', label: 'Home', icon: BiHome, linkTo: '/' },
    { id: 'search', label: 'Search', icon: BiSearch, linkTo: '/search' },
    { id: 'upload', label: 'Upload', icon: BiUpload, linkTo: '/upload' },
    {
      id: 'myUploads',
      label: 'My Uploads',
      icon: BiUpload,
      linkTo: '/my-uploads',
    },
    {
      id: 'likedSongs',
      label: 'Liked Songs',
      icon: BiHeart,
      linkTo: '/liked-songs',
    },
    {
      id: 'likedAlbums',
      label: 'Liked Albums',
      icon: BiAlbum,
      linkTo: '/liked-albums',
    },
    {
      id: 'likedPlaylists',
      label: 'Liked Playlists',
      icon: BiSolidPlaylist,
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

const UserPlaylist = () => {
  const dotColors = [
    'bg-amber-500',
    'bg-emerald-500',
    'bg-violet-500',
    'bg-indigo-500',
    'bg-yellow-500',
    'bg-pink-500',
  ]
  const { open: openCreatePlaylistModal } = useCreatePlaylistModalStore()
  const { isAuthenticated } = useAuthStore()
  const { open: openSigninPrompt } = useSigninPromptModalStore()

  const { data: playlistData, isLoading, isError, refetch } = useUserPlaylists()
  const playlists = playlistData?.playlists || []

  const handleCreatePlaylist = () => {
    if (!isAuthenticated) {
      openSigninPrompt()
      return
    }
    openCreatePlaylistModal()
  }

  return (
    <div className="flex-1 flex flex-col px-4 overflow-hidden ">
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Playlists
        </h3>

        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => refetch()}
            disabled={!isAuthenticated || isLoading}
            title="Refresh Playlists"
            className="h-7 w-7"
          >
            <BiRefresh className="w-4 h-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleCreatePlaylist}
            className="h-7 w-7"
          >
            <BiPlus className="w-5 h-5" />
          </Button>
        </div>
      </div>
      {/* Simple scrollable div instead of ScrollArea */}

      <ScrollArea className="flex-1 overflow-y-auto -mx-4 max-h-[50vh] h-full space-y-0.5 px-4">
        {isLoading && <PlaylistSkeleton />}
        {isError && (
          <p className="px-3 py-2 text-sm text-destructive">
            Failed to load playlists.
          </p>
        )}
        {!isLoading &&
          !isError &&
          isAuthenticated &&
          playlists.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              No playlists created.
            </p>
          )}
        {!isLoading &&
          !isError &&
          playlists.map((playlist: any, i: number) => (
            <Link
              to={`/playlists/playlist/${playlist._id}`}
              key={playlist._id}
              className="w-full flex items-center text-left px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-all duration-200 truncate"
            >
              <span
                className={`w-2.5 h-2.5 rounded-full mr-3 flex-shrink-0 ${
                  dotColors[i % dotColors.length]
                }`}
              />
              <span className="truncate">{playlist.title}</span>
            </Link>
          ))}
      </ScrollArea>
    </div>
  )
}
