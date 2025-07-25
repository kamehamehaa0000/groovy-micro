import {
  useJamActions,
  useIsJamming,
  useJamSession,
} from '../../store/jam-store'
import { usePlayerStore } from '../../store/player-store'
import albumCoverArtPlaceholder from '../../assets/albumPlaceholder.svg'
import { useAuthStore } from '../../store/auth-store'
import { useSigninPromptModalStore } from '../../store/modal-store'
import { BiPlay } from 'react-icons/bi'
import { Link } from 'react-router'

export const AlbumCard = ({
  album,
}: {
  album: {
    _id: string
    title: string
    coverUrl: string
    artist?: {
      displayName: string
    }
    songs: any[]
  }
}) => {
  const { actions } = usePlayerStore()
  const { isAuthenticated } = useAuthStore()
  const { open: openSigninPrompt } = useSigninPromptModalStore()
  const isJamming = useIsJamming()
  const { changeSong: jamChangeSong, addToQueue: jamAddToQueue } =
    useJamActions()
  const handlePlayAlbum = (album: any) => {
    if (!isAuthenticated) {
      openSigninPrompt()
      return
    }
    if (isJamming) {
      if (album.songs && album.songs.length > 0) {
        jamChangeSong(album.songs[0]._id)
        for (let i = 1; i < album.songs.length; i++) {
          jamAddToQueue(album.songs[i]._id)
        }
      }
    } else {
      actions.setQueue([])
      actions.loadQueue(album.songs, 0)
    }
  }
  if (!album) return null
  return (
    <div
      key={album._id}
      className="group cursor-pointer hover:shadow-md transition-shadow bg-white rounded-lg shadow-sm p-3 min-w-[135px] max-w-[135px] lg:min-w-[150px] lg:max-w-[150px] text-clip "
    >
      <div className="relative mb-2">
        <img
          src={album.coverUrl ? album.coverUrl : albumCoverArtPlaceholder}
          alt="Album cover"
          className="w-full aspect-square object-cover rounded-md"
        />
        <button
          onClick={() => handlePlayAlbum(album)}
          className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-black/80 hover:bg-black opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
        >
          <BiPlay className="w-3 h-3 text-white ml-0.5" />
        </button>
      </div>
      <div className="space-y-1">
        <Link
          to={`/albums/album/${album._id}`}
          className="font-medium text-sm text-gray-900 truncate block"
          title={album.title}
        >
          {album.title}
        </Link>
        <p
          className="text-xs text-gray-600 truncate"
          title={album.artist?.displayName || 'N/A'}
        >
          {album.artist?.displayName || 'N/A'}
        </p>
      </div>
    </div>
  )
}
