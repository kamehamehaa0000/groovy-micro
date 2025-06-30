import type { UseFormReturn } from 'react-hook-form'
import type { AlbumUploadForm } from '../../../types/UploadComponentTypes'
import { TrackItem } from './TrackItem'

interface AlbumTracksProps {
  form: UseFormReturn<AlbumUploadForm>
  trackCount: number
  trackCollaboratorEmails: string[]
  setTrackCollaboratorEmails: (emails: string[]) => void
  addTrack: () => void
  removeTrack: (index: number) => void
}

export const AlbumTracks = ({
  form,
  trackCount,
  trackCollaboratorEmails,
  setTrackCollaboratorEmails,
  addTrack,
  removeTrack,
}: AlbumTracksProps) => {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <label className="block text-sm font-medium">
          Tracks ({trackCount}/20)
        </label>
        <button
          type="button"
          onClick={addTrack}
          disabled={trackCount >= 20}
          className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          Add Track
        </button>
      </div>

      {Array.from({ length: trackCount }, (_, index) => (
        <TrackItem
          key={index}
          index={index}
          form={form}
          trackCount={trackCount}
          trackCollaboratorEmails={trackCollaboratorEmails}
          setTrackCollaboratorEmails={setTrackCollaboratorEmails}
          removeTrack={removeTrack}
        />
      ))}
    </div>
  )
}
