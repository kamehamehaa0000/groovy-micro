import { useJamActions, useIsJamming } from '../../store/jam-store'
import { usePlayerStore } from '../../store/player-store'
import { Link } from 'react-router'
import albumCoverArtPlaceholder from '../../assets/albumPlaceholder.svg'
import { useAuthStore } from '../../store/auth-store'
import { useSigninPromptModalStore } from '../../store/modal-store'
import { BiPlay } from 'react-icons/bi'

export const PlaylistCard = ({
  playlist,
}: {
  playlist: {
    _id: string
    title: string
    coverUrl?: string
    creator: { displayName: string }
    songs: any[]
  }
}) => {
  const { actions } = usePlayerStore()
  const { isAuthenticated } = useAuthStore()
  const { open: openSigninPrompt } = useSigninPromptModalStore()
  const isJamming = useIsJamming()
  const { changeSong: jamChangeSong, addToQueue: jamAddToQueue } =
    useJamActions()
  const handlePlayPlaylist = (playlist: any) => {
    if (!isAuthenticated) {
      openSigninPrompt()
      return
    }

    const songs = playlist?.songs?.map((song: { songId: object }) => {
      return song.songId
    })

    if (isJamming) {
      if (songs && songs.length > 0) {
        jamChangeSong(songs[0]._id)
        for (let i = 1; i < songs.length; i++) {
          jamAddToQueue(songs[i]._id)
        }
      }
    } else {
      actions.setQueue([])
      actions.loadQueue(songs, 0)
      actions.play()
    }
  }
  if (!playlist) return null
  return (
    <div
      key={playlist._id}
      className="group cursor-pointer hover:shadow-md transition-shadow bg-white dark:bg-zinc-900 rounded-lg shadow-sm p-3 min-w-[140px] max-w-[140px] lg:min-w-[150px] lg:max-w-[150px] text-clip "
    >
      <div className="relative mb-2">
        <img
          src={playlist.coverUrl ? playlist.coverUrl : albumCoverArtPlaceholder}
          alt="Album cover"
          className="w-full aspect-square object-cover rounded-md"
        />
        <button
          onClick={() => handlePlayPlaylist(playlist)}
          className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-black/80 hover:bg-black opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
        >
          <BiPlay className="w-3 h-3 text-white ml-0.5" />
        </button>
      </div>
      <div className="space-y-1">
        <Link
          to={`/playlists/playlist/${playlist._id}`}
          className="font-medium text-sm dark:text-gray-300 text-gray-900 truncate block"
        >
          {playlist.title}
        </Link>
        <p className="text-xs text-gray-400 truncate">
          {playlist.creator?.displayName || 'N/A'}
        </p>
      </div>
    </div>
  )
}
