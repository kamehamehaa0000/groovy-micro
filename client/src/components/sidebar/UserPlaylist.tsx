import {
  useCreatePlaylistModalStore,
  useSigninPromptModalStore,
} from '../../store/modal-store'
import { useAuthStore } from '../../store/auth-store'
import { ScrollArea } from '../ui/scroll-area'
import { PlaylistSkeleton } from '../skeletons/PlaylistsSkeleton'
import { useUserPlaylists } from '@/service/queries/playlistQuery'
import { Button } from '../ui/button'
import { Plus, RefreshCcw } from 'lucide-react'
import { Link } from 'react-router'

export const UserPlaylist = () => {
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
            <RefreshCcw />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleCreatePlaylist}
            className="h-7 w-7"
          >
            <Plus className="w-5 h-5" />
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
