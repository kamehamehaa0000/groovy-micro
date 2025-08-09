import { useCreatePlaylistModalStore } from '../../store/modal-store'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { withModal } from './withModal'
import { Input } from '../ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import { Button } from '../ui/button'
import { BiLoader, BiPlus, BiXCircle } from 'react-icons/bi'
import { useCreatePlaylist } from '@/service/queries/playlistQuery'
function CreatePlaylistModalContent() {
  const { close } = useCreatePlaylistModalStore()
  const [title, setTitle] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')

  const { mutate: createPlaylist, isPending } = useCreatePlaylist({
    onSuccess: () => {
      close()
      toast.success('Playlist created successfully')
      setTitle('')
      setVisibility('public')
    },
  })

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!title) return
    createPlaylist({ title, visibility })
  }

  return (
    <form onSubmit={handleSubmit} className="p-4 space-y-4">
      <div className="space-y-3 ">
        <Input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Playlist title *"
          disabled={isPending}
        />
        <Select
          value={visibility}
          onValueChange={(value) =>
            setVisibility(value as 'public' | 'private')
          }
          disabled={isPending}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select visibility" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="public">🌍 Public</SelectItem>
            <SelectItem value="private">🔒 Private</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex space-x-2 pt-1">
        {' '}
        <Button
          variant="default"
          type="submit"
          disabled={!title || isPending}
          onClick={() => handleSubmit}
          className="w-2/3  border border-orange-600 bg-white text-orange-600 hover:bg-orange-50"
        >
          {isPending ? (
            <>
              <BiLoader />
              Creating...
            </>
          ) : (
            <>
              <BiPlus /> Create Playlist
            </>
          )}
        </Button>
        <Button
          variant="outline"
          onClick={close}
          disabled={isPending}
          className="w-fit "
          title="Cancel creating playlist"
        >
          <BiXCircle /> Cancel
        </Button>
      </div>
    </form>
  )
}

export const CreatePlaylistModal = withModal(CreatePlaylistModalContent)
