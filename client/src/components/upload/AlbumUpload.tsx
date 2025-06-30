import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { WarningNote } from '../shared/Notes'
import { AlbumBasicInfo } from './album/AlbumBasicInfo'
import { AlbumCollaborators } from './album/AlbumCollaborators'
import { AlbumTracks } from './album/AlbumTracks'
import { useAlbumUpload } from './album/useAlbumUpload'
import type { AlbumUploadForm } from '../../types/UploadComponentTypes'

export const AlbumUpload = ({
  setIsAlbumBeingUploaded,
  setUploadProgress,
}: {
  setIsAlbumBeingUploaded: (isUploading: boolean) => void
  setUploadProgress: React.Dispatch<
    React.SetStateAction<{
      song: number
      coverArt: number
      overall: number
      currentStep: string
      tracks: { [key: number]: number }
    }>
  >
}) => {
  const form = useForm<AlbumUploadForm>({
    defaultValues: {
      collaborators: [],
      tracks: [
        {
          audioFile: undefined,
          trackName: '',
          trackNumber: 1,
          collaborators: [],
          tags: '',
          genre: '',
        },
      ],
    },
  })

  const [trackCount, setTrackCount] = useState(1)
  const [collaboratorEmail, setCollaboratorEmail] = useState('')
  const [trackCollaboratorEmails, setTrackCollaboratorEmails] = useState<
    string[]
  >(Array(20).fill(''))

  const { handleAlbumUpload } = useAlbumUpload(
    setIsAlbumBeingUploaded,
    setUploadProgress
  )

  const addTrack = () => {
    if (trackCount < 20) {
      setTrackCount((prev) => prev + 1)
      const currentTracks = form.getValues('tracks') || []
      form.setValue('tracks', [
        ...currentTracks,
        {
          audioFile: undefined,
          trackName: '',
          trackNumber: trackCount + 1,
          collaborators: [],
          tags: '',
          genre: '',
        },
      ])
    }
  }

  const removeTrack = (index: number) => {
    if (trackCount > 1) {
      setTrackCount((prev) => prev - 1)
      const currentTracks = form.getValues('tracks') || []
      const updatedTracks = currentTracks.filter((_, i) => i !== index)
      form.setValue('tracks', updatedTracks)
    }
  }

  return (
    <div className="w-full px-2">
      <h2 className="text-lg font-semibold mb-4">Album Upload</h2>
      <WarningNote noteText="Artist name will be your Display Name" />

      <form
        onSubmit={form.handleSubmit(handleAlbumUpload)}
        className="space-y-4"
      >
        <AlbumBasicInfo form={form} />

        <AlbumCollaborators
          form={form}
          collaboratorEmail={collaboratorEmail}
          setCollaboratorEmail={setCollaboratorEmail}
        />

        <AlbumTracks
          form={form}
          trackCount={trackCount}
          trackCollaboratorEmails={trackCollaboratorEmails}
          setTrackCollaboratorEmails={setTrackCollaboratorEmails}
          addTrack={addTrack}
          removeTrack={removeTrack}
        />

        <button
          type="submit"
          className="w-full bg-red-600 text-white py-2 px-4 rounded-md hover:bg-orange-600 transition-colors"
        >
          Upload Album
        </button>
      </form>
    </div>
  )
}
