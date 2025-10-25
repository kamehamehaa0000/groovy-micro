import type { UseFormReturn } from 'react-hook-form'
import type { AlbumUploadForm } from '../../../types/UploadComponentTypes'
import { genres } from '../../../pages/Upload'
import axiosInstance from '../../../utils/axios-interceptor'
import toast from 'react-hot-toast'
import { BiXCircle } from 'react-icons/bi'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface TrackItemProps {
  index: number
  form: UseFormReturn<AlbumUploadForm>
  trackCount: number
  trackCollaboratorEmails: string[]
  setTrackCollaboratorEmails: (emails: string[]) => void
  removeTrack: (index: number) => void
}

export const TrackItem = ({
  index,
  form,
  trackCount,
  trackCollaboratorEmails,
  setTrackCollaboratorEmails,
  removeTrack,
}: TrackItemProps) => {
  const {
    register,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = form
  const tracks = watch('tracks') || []
  const trackName = watch(`tracks.${index}.trackName` as const)
  const trackFile = watch(`tracks.${index}.audioFile` as const)
  const trackFileSize = trackFile?.[0]?.size ?? 0

  const addTrackCollaborator = async () => {
    const email = trackCollaboratorEmails[index]
    if (email?.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email.trim())) return
      // Check if the email exists in the database
      try {
        await axiosInstance.post(
          'http://localhost:4000/api/v1/auth/artist-email-check',
          {
            email: email.trim(),
          }
        )
      } catch (error: any) {
        toast.error(
          error.response.data.errors[0].reason ??
            'Error checking collaborator email'
        )
        return
      }

      const currentTracks = getValues('tracks') || []
      const currentTrackCollaborators =
        currentTracks[index]?.collaborators || []

      if (
        !currentTrackCollaborators.includes(email.trim()) &&
        currentTrackCollaborators.length < 5
      ) {
        const updatedTracks = [...currentTracks]
        updatedTracks[index] = {
          ...updatedTracks[index],
          collaborators: [...currentTrackCollaborators, email.trim()],
        }
        setValue('tracks', updatedTracks)

        const updatedEmails = [...trackCollaboratorEmails]
        updatedEmails[index] = ''
        setTrackCollaboratorEmails(updatedEmails)
      }
    }
  }

  const removeTrackCollaborator = (emailToRemove: string) => {
    const currentTracks = getValues('tracks') || []
    const updatedTracks = [...currentTracks]
    updatedTracks[index] = {
      ...updatedTracks[index],
      collaborators: updatedTracks[index].collaborators.filter(
        (email) => email !== emailToRemove
      ),
    }
    setValue('tracks', updatedTracks)
  }

  return (
    <div className="border rounded-lg bg-accent p-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium">Track {index + 1}</h4>
        {trackCount > 1 && (
          <button
            type="button"
            onClick={() => removeTrack(index)}
            className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
          >
            Remove
          </button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        {/* Track Name */}
        <div className="mb-2 sm:w-1/2">
          <label className="block text-xs font-medium mb-1">Track Name</label>
          <Input
            type="text"
            {...register(`tracks.${index}.trackName` as const, {
              required: 'Track name is required',
              validate: (value) => {
                if (!value || !value.trim()) return 'Track name is required'
                const charCount = value.trim().length
                return (
                  charCount <= 50 || 'Track name must not exceed 50 characters'
                )
              },
            })}
            className="w-full px-2 py-1.5 border rounded text-sm"
            placeholder={`Enter track ${index + 1} name`}
          />
          {trackName && trackName.trim() && (
            <p
              className={`text-xs mt-1 ${
                trackName.trim().length > 50 ? 'text-red-500' : 'text-green-500'
              }`}
            >
              Character count: {trackName.trim().length}/50
            </p>
          )}
          {errors.tracks?.[index]?.trackName && (
            <p className="text-red-500 text-xs mt-1">
              {errors.tracks[index]?.trackName?.message}
            </p>
          )}
        </div>

        {/* Track Audio File */}
        <div className="mb-2 sm:w-1/2">
          <label
            htmlFor={`track-${index}-audio`}
            className="block text-xs font-medium mb-1"
          >
            Audio File (MP3, max 15MB)
          </label>
          <Input
            id={`track-${index}-audio`}
            type="file"
            accept=".mp3,audio/mp3"
            {...register(`tracks.${index}.audioFile` as const, {
              required: 'Track audio file is required',
              validate: (files) => {
                const file = files?.[0]
                if (!file) return 'Track audio file is required'
                if (file.type !== 'audio/mpeg')
                  return 'Only MP3 files are allowed'
                if (file.size > 15 * 1024 * 1024)
                  return 'File size must be less than 15MB'
                return true
              },
            })}
            className="w-full px-2 py-1.5 border rounded text-sm"
          />
          {trackFileSize > 0 && (
            <p
              className={`text-xs mt-1 ${
                trackFileSize > 15 * 1024 * 1024
                  ? 'text-red-500'
                  : 'text-green-500'
              }`}
            >
              File size: {(trackFileSize / (1024 * 1024)).toFixed(1)}MB
            </p>
          )}
          {errors.tracks?.[index]?.audioFile && (
            <p className="text-red-500 text-xs mt-1">
              {errors.tracks[index]?.audioFile?.message}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-2">
        {/* Track Genre */}
        <div className="sm:w-1/2">
          <label
            htmlFor={`track-${index}-genre`}
            className="block text-xs font-medium mb-1"
          >
            Genre
          </label>
          <select
            id={`track-${index}-genre`}
            {...register(`tracks.${index}.genre` as const, {
              required: 'Track genre is required',
            })}
            className="w-full px-2 py-1.5 border rounded text-sm"
          >
            <option value="">Select a genre</option>
            {genres.map((genre) => (
              <option key={genre} value={genre}>
                {genre}
              </option>
            ))}
          </select>
          {errors.tracks?.[index]?.genre && (
            <p className="text-red-500 text-xs mt-1">
              {errors.tracks[index]?.genre?.message}
            </p>
          )}
        </div>

        {/* Track Tags */}
        <div className="sm:w-1/2">
          <label
            htmlFor={`track-${index}-tags`}
            className="block text-xs font-medium mb-1"
          >
            Tags
          </label>
          <Input
            id={`track-${index}-tags`}
            type="text"
            {...register(`tracks.${index}.tags` as const, {
              required: 'Track tags are required',
            })}
            className="w-full px-2 py-1.5 border rounded text-sm"
            placeholder="Enter tags separated by commas"
          />
          {errors.tracks?.[index]?.tags && (
            <p className="text-red-500 text-xs mt-1">
              {errors.tracks[index]?.tags?.message}
            </p>
          )}
        </div>
      </div>

      {/* Track Collaborators */}
      <div>
        <label className="block text-xs font-medium mb-1">
          Track Collaborators ({tracks[index]?.collaborators?.length || 0}/5)
        </label>
        <div className="flex space-x-2 mb-2">
          <Input
            type="email"
            value={trackCollaboratorEmails[index] || ''}
            onChange={(e) => {
              const updatedEmails = [...trackCollaboratorEmails]
              updatedEmails[index] = e.target.value
              setTrackCollaboratorEmails(updatedEmails)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addTrackCollaborator()
              }
            }}
            className="w-full px-2 py-1.5 border rounded text-sm"
            placeholder="Enter collaborator's email"
            disabled={(tracks[index]?.collaborators?.length || 0) >= 5}
          />
          <Button
            variant="outline"
            type="button"
            onClick={addTrackCollaborator}
            disabled={
              !trackCollaboratorEmails[index]?.trim() ||
              (tracks[index]?.collaborators?.length || 0) >= 5
            }
            className="border-orange-600 text-orange-600"
          >
            Add
          </Button>
        </div>
        {tracks[index]?.collaborators?.length > 0 && (
          <div className="space-y-1 flex items-center flex-wrap gap-2">
            {tracks[index].collaborators.map((email) => (
              <div
                key={email}
                className="flex items-center bg-gray-100 px-4 py-1 rounded-full gap-1"
              >
                <span className="text-xs">{email}</span>
                <button
                  type="button"
                  onClick={() => removeTrackCollaborator(email)}
                  className="px-2 py-1 text-gray-500 rounded-full "
                >
                  <BiXCircle />
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-gray-500 mt-1">
          Add collaborators specific to this track
        </p>
      </div>
    </div>
  )
}
