import { useForm } from 'react-hook-form'
import { WarningNote } from '../shared/Notes'
import axios from 'axios'
import { useState } from 'react'
import { genres } from '../../pages/Upload'
import axiosInstance from '../../utils/axios-interceptor'
import toast from 'react-hot-toast'
import { Button } from '../ui/button'
import { BiXCircle } from 'react-icons/bi'
const API_BASE_URL = `${import.meta.env.VITE_API_GATEWAY_URL}`

interface SingleUploadForm {
  audioFile: FileList | undefined
  coverArt: FileList | undefined
  songName: string
  genre: string
  tags: string
  visibility: 'public' | 'private'
  collaborators: string[]
}
export const SingleUpload = ({
  setIsSingleBeingUploaded,
  setUploadProgress,
}: {
  setIsSingleBeingUploaded: (isUploading: boolean) => void
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
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
    watch,
    setValue,
    getValues,
  } = useForm<SingleUploadForm>({
    defaultValues: {
      collaborators: [],
    },
  })

  const [collaboratorEmail, setCollaboratorEmail] = useState('')

  const onSubmit = async (data: SingleUploadForm) => {
    const SongFilename = data.audioFile?.[0]?.name
    const coverArtFilename = data.coverArt?.[0]?.name
    if (!SongFilename || !coverArtFilename) {
      toast.error('Please upload both audio file and cover art.')
      return
    }
    const tags = data.tags.split(',').map((tag) => tag.trim())

    const body = {
      songName: data.songName,
      filename: SongFilename,
      coverArtFileName: coverArtFilename,
      genre: data.genre,
      visibility: data.visibility,
      tags,
      collaborators: data.collaborators,
    }
    try {
      setIsSingleBeingUploaded(true)
      setUploadProgress({
        song: 0,
        coverArt: 0,
        overall: 0,
        currentStep: 'Preparing upload...',
        tracks: {},
      })
      const res = await axiosInstance.post(
        `${API_BASE_URL}/songs/songs/upload/presign`,
        body
      )

      const {
        songId,
        songUploadKey,
        coverUploadKey,
        presignedSongUrl,
        presignedCoverUrl,
      } = res.data

      setUploadProgress((prev) => ({
        ...prev,
        currentStep: 'Uploading song...',
        overall: 10,
      }))

      await axios.put(presignedSongUrl, data.audioFile?.[0], {
        headers: {
          'Content-Type': 'audio/mpeg',
        },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round(
            (progressEvent.loaded * 100) / (progressEvent.total ?? 1)
          )
          setUploadProgress((prev) => ({
            ...prev,
            song: progress,
            overall: 10 + progress * 0.4, // 40% of overall progress for song upload
          }))
        },
      })

      await axios.put(presignedCoverUrl, data.coverArt?.[0], {
        headers: {
          'Content-Type': data.coverArt?.[0].type ?? 'image/jpeg',
        },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round(
            (progressEvent.loaded * 100) / (progressEvent.total ?? 1)
          )
          setUploadProgress((prev) => ({
            ...prev,
            coverArt: progress,
            overall: 50 + progress * 0.3, // 30% of overall progress for cover art
          }))
        },
      })

      setUploadProgress((prev) => ({
        ...prev,
        currentStep: 'Confirming upload...',
        overall: 80,
      }))

      await axiosInstance.post(
        `${API_BASE_URL}/songs/songs/upload/confirm`,
        {
          songId,
          songUploadKey,
          coverUploadKey,
          songName: data.songName,
          genre: data.genre,
          visibility: data.visibility,
          tags,
          collaborators: data.collaborators,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0VXNlcklkIiwiaWF0IjoxNzUwNzc2OTY5LCJleHAiOjE3NTA3Nzc4Njl9.U6QNa4wmmfw8CkSvnQExtAkd1zgiX_-svkQ7jK9ZuA8`,
          },
        }
      )

      setUploadProgress((prev) => ({
        ...prev,
        currentStep: 'Upload complete!',
        overall: 100,
      }))
      toast.success('Song uploaded successfully!')

      reset()
    } catch (error) {
      toast.error('Error uploading song. Please try again.')
      console.error('Error uploading song:', error)
    } finally {
      setIsSingleBeingUploaded(false)
    }

    // Handle form submission here
  }

  const coverArtFile = watch('coverArt')
  const coverArtSize = coverArtFile?.[0]?.size ?? 0

  const addCollaborator = async () => {
    if (collaboratorEmail.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(collaboratorEmail.trim())) {
        return
      }
      //check if user with this email exists or not
      try {
        await axiosInstance.post(
          'http://localhost:4000/api/v1/auth/artist-email-check',
          {
            email: collaboratorEmail.trim(),
          }
        )
      } catch (error: any) {
        toast.error(
          error.response.data.errors[0].reason ??
            'Error checking collaborator email'
        )
        return
      }
      const currentCollaborators = getValues('collaborators') || []
      if (
        !currentCollaborators.includes(collaboratorEmail.trim()) &&
        currentCollaborators.length < 5
      ) {
        setValue('collaborators', [
          ...currentCollaborators,
          collaboratorEmail.trim(),
        ])
        setCollaboratorEmail('')
      }
    }
  }

  const removeCollaborator = (emailToRemove: string) => {
    const currentCollaborators = getValues('collaborators') ?? []
    setValue(
      'collaborators',
      currentCollaborators.filter((email) => email !== emailToRemove)
    )
  }

  const collaborators = watch('collaborators') ?? []

  return (
    <div className="w-full px-2">
      <h2 className="text-lg font-semibold mb-4">Single Upload</h2>
      <WarningNote noteText="Artist name will be your Display Name" />
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 w-full">
        {/* Song Name */}
        <div>
          <label htmlFor="songName" className="block text-sm font-medium mb-2">
            Song Name
          </label>
          <input
            id="songName"
            type="text"
            {...register('songName', {
              required: 'Song name is required',
              validate: (value) => {
                if (!value || !value.trim()) return 'Song name is required'
                const charCount = value.trim().length
                return (
                  charCount <= 40 || 'Song name must not exceed 40 characters'
                )
              },
            })}
            className="w-full p-2 border rounded"
            placeholder="Enter song name"
          />
          {(() => {
            const songName = watch('songName')
            if (!songName || !songName.trim()) return null
            const charCount = songName.trim().length
            return (
              <p
                className={`text-sm mt-1 ${
                  charCount > 40 ? 'text-red-500' : 'text-green-500'
                }`}
              >
                Character count: {charCount}/40
              </p>
            )
          })()}
          {errors.songName && (
            <p className="text-red-500 text-sm mt-1">
              {errors.songName.message}
            </p>
          )}
        </div>

        {/* Audio and Cover Art Upload*/}
        <div className="flex gap-4 flex-col sm:flex-row">
          <div className="sm:w-1/2">
            <label className="block text-sm font-medium mb-2">
              Audio File (MP3, max 15MB)
            </label>
            <input
              type="file"
              accept=".mp3,audio/mp3"
              {...register('audioFile', {
                required: 'Audio file is required',
                validate: (files) => {
                  const file = files?.[0]
                  if (!file) return 'Audio file is required'
                  if (file.type !== 'audio/mpeg') {
                    return 'Only MP3 files are allowed'
                  }
                  if (file.size > 15 * 1024 * 1024) {
                    return 'File size must be less than 15MB'
                  }
                  return true
                },
              })}
              className="w-full p-2 border rounded"
            />
            {(() => {
              const audioFile = watch('audioFile')
              const audioFileSize = audioFile?.[0]?.size ?? 0
              if (audioFileSize > 0) {
                return (
                  <p
                    className={`text-sm mt-1 ${
                      audioFileSize > 15 * 1024 * 1024
                        ? 'text-red-500'
                        : 'text-green-500'
                    }`}
                  >
                    File size: {(audioFileSize / (1024 * 1024)).toFixed(1)}MB
                  </p>
                )
              }
              return null
            })()}
            {errors.audioFile && (
              <p className="text-red-500 text-sm mt-1">
                {errors.audioFile.message}
              </p>
            )}
          </div>

          {/* Cover Art */}
          <div className="sm:w-1/2">
            {' '}
            <label className="block text-sm font-medium mb-2">
              Cover Art (JPG/PNG, max 500KB)
            </label>
            <input
              type="file"
              accept=".jpg,.jpeg,.png,image/jpeg,image/png"
              {...register('coverArt', {
                required: 'Cover art is required',
                validate: (files) => {
                  const file = files?.[0]
                  if (!file) return 'Cover art is required'
                  if (!['image/jpeg', 'image/png'].includes(file.type)) {
                    return 'Only JPG and PNG files are allowed'
                  }
                  if (file.size > 500 * 1024) {
                    return 'File size must be less than 500KB'
                  }
                  return true
                },
              })}
              className="w-full p-2 border rounded"
            />
            {coverArtSize > 0 && (
              <p
                className={`text-sm mt-1 ${
                  coverArtSize > 500 * 1024 ? 'text-red-500' : 'text-green-500'
                }`}
              >
                File size: {(coverArtSize / 1024).toFixed(1)}KB
              </p>
            )}
            {errors.coverArt && (
              <p className="text-red-500 text-sm mt-1">
                {errors.coverArt.message}
              </p>
            )}
          </div>
        </div>
        {/* Genre and Visibility */}
        <div className="flex gap-4 flex-col sm:flex-row">
          {/* Genre */}
          <div className="sm:w-1/2">
            <label className="block text-sm font-medium mb-2">Genre</label>
            <select
              {...register('genre', { required: 'Genre is required' })}
              className="w-full p-2 border rounded"
            >
              <option value="">Select a genre</option>
              {genres.map((genre) => (
                <option key={genre} value={genre}>
                  {genre}
                </option>
              ))}
            </select>
            {errors.genre && (
              <p className="text-red-500 text-sm mt-1">
                {errors.genre.message}
              </p>
            )}
          </div>
          {/* Visibility */}
          <div className="sm:w-1/2">
            <label className="block text-sm font-medium mb-2">Visibility</label>
            <select
              {...register('visibility', {
                required: 'Visibility is required',
              })}
              className="w-full p-2 border rounded"
            >
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>
            {errors.visibility && (
              <p className="text-red-500 text-sm mt-1">
                {errors.visibility.message}
              </p>
            )}
          </div>
        </div>

        {/* Tags */}
        <div>
          <label className="block text-sm font-medium mb-2">Tags</label>
          <input
            type="text"
            {...register('tags', { required: 'Tags are required' })}
            className="w-full p-2 border rounded"
            placeholder="Enter tags separated by commas"
          />
          {errors.tags && (
            <p className="text-red-500 text-sm mt-1">{errors.tags.message}</p>
          )}
        </div>

        {/* Collaborators */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Collaborators ({collaborators.length}/5)
          </label>
          <div className="flex space-x-2 mb-2">
            <input
              type="email"
              value={collaboratorEmail}
              onChange={(e) => setCollaboratorEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addCollaborator()
                }
              }}
              className="flex-1 p-2 border rounded"
              placeholder="Enter collaborator's email"
              disabled={collaborators.length >= 5}
            />
            <Button
              type="button"
              onClick={addCollaborator}
              disabled={!collaboratorEmail.trim() || collaborators.length >= 5}
              variant="outline"
              className="border-orange-600 text-orange-600"
            >
              Add
            </Button>
          </div>
          {collaborators.length > 0 && (
            <div className="space-y-1 flex items-center flex-wrap gap-2">
              {collaborators.map((email) => (
                <div
                  key={email}
                  className="flex items-center bg-gray-100 px-4 py-1 rounded-full gap-1"
                >
                  <span className="text-xs">{email}</span>
                  <button
                    type="button"
                    title="Remove collaborator"
                    onClick={() => removeCollaborator(email)}
                    className="px-2 py-1 text-gray-500 rounded-full "
                  >
                    <BiXCircle />
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-500 mt-1">
            Add up to 5 collaborating artists by their email addresses
          </p>
        </div>

        <Button
          variant={'outline'}
          type="submit"
          className="w-full text-orange-600 border border-orange-600 py-2 px-4 rounded-lg hover:bg-orange-600 hover:text-white transition-colors"
        >
          Upload Song
        </Button>
      </form>
    </div>
  )
}
