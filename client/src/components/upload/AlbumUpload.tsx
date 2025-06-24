import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { WarningNote } from '../shared/Notes'
import { genres } from '../../pages/upload'
import axios from 'axios'

interface AlbumUploadForm {
  albumName: string
  genre: string
  tags: string
  visibility: 'public' | 'private'
  coverArt: FileList
  collaborators: string[]
  tracks: {
    audioFile: FileList | undefined
    trackName: string
    trackNumber: number
    tags: string
    genre: string
    collaborators: string[]
  }[]
}

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
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
    getValues,
  } = useForm<AlbumUploadForm>({
    defaultValues: {
      collaborators: [],
      tracks: [
        {
          audioFile: undefined,
          trackName: '',
          trackNumber: 1,
          collaborators: [],
        },
      ],
    },
  })

  const [trackCount, setTrackCount] = useState(1)
  const [collaboratorEmail, setCollaboratorEmail] = useState('')
  const [trackCollaboratorEmails, setTrackCollaboratorEmails] = useState<
    string[]
  >(Array(20).fill(''))

  const onSubmit = async (data: AlbumUploadForm) => {
    console.log(data)
    try {
      setIsAlbumBeingUploaded(true)
      setUploadProgress?.({
        song: 0,
        coverArt: 0,
        overall: 0,
        currentStep: 'Preparing album upload...',
        tracks: {},
      })

      const tracksData = data.tracks.map((track, index) => ({
        filename: track.audioFile?.[0]?.name,
        songName: track.trackName,
        trackNumber: index + 1,
        tags: track.tags.split(',').map((tag) => tag.trim()),
        genre: track.genre,
        collaborators: track.collaborators,
      }))

      const albumData = {
        albumName: data.albumName,
        coverFilename: data.coverArt?.[0]?.name,
        genre: data.genre,
        tags: data.tags.split(',').map((tag) => tag.trim()),
        visibility: data.visibility,
        collaborators: data.collaborators,
      }

      setUploadProgress?.({
        song: 0,
        coverArt: 0,
        overall: 10,
        currentStep: 'Getting presigned URLs...',
        tracks: {},
      })

      const { data: presignedUrlData } = await axios.post(
        'http://localhost:3000/api/v1/songs/upload/presigned/album',
        {
          coverFilename: albumData.coverFilename,
          visibility: albumData.visibility,
          tracks: tracksData,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0VXNlcklkIiwiaWF0IjoxNzUwNzkxMjM2LCJleHAiOjE3NTA3OTIxMzZ9.YHYapKgjtBtE9HpV_yripiFywbqzf1k3Px6M3jGdAhA`,
          },
        }
      )

      console.log('Presigned URL Data:', presignedUrlData)

      // Upload cover art
      setUploadProgress?.({
        song: 0,
        coverArt: 0,
        overall: 20,
        currentStep: 'Uploading cover art...',
        tracks: {},
      })

      await axios.put(presignedUrlData.presignedCoverUrl, data.coverArt?.[0], {
        headers: {
          'Content-Type': data.coverArt?.[0]?.type || 'image/jpeg',
        },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round(
            (progressEvent.loaded * 100) / (progressEvent.total || 1)
          )
          setUploadProgress?.({
            song: 0,
            coverArt: progress,
            overall: 20 + progress * 0.2, // Cover art contributes 20% to overall progress
            currentStep: 'Uploading cover art...',
            tracks: {},
          })
        },
      })

      console.log('Cover art uploaded successfully')

      // Upload tracks with progress tracking
      setUploadProgress?.({
        song: 0,
        coverArt: 100,
        overall: 40,
        currentStep: 'Uploading tracks...',
        tracks: {},
      })

      const trackUploadPromises = presignedUrlData.trackPresignedUrls.map(
        async (
          track: { presignedSongUrl: string; songId: string },
          index: number
        ) => {
          const trackFile = data.tracks[index]?.audioFile?.[0]
          if (!trackFile) {
            console.warn(`No file found for track ${index + 1}`)
            return Promise.resolve()
          }

          console.log(`Uploading track ${index + 1}:`, {
            filename: trackFile.name,
            size: trackFile.size,
            type: trackFile.type,
            url: track.presignedSongUrl,
          })

          try {
            await axios.put(track.presignedSongUrl, trackFile, {
              headers: {
                'Content-Type': 'audio/mpeg',
              },
              onUploadProgress: (progressEvent) => {
                const progress = Math.round(
                  (progressEvent.loaded * 100) / (progressEvent.total || 1)
                )

                setUploadProgress?.((prev) => ({
                  ...prev,
                  currentStep: `Uploading track ${index + 1}/${
                    data.tracks.length
                  }...`,
                  overall:
                    40 + ((index + progress / 100) / data.tracks.length) * 40, // Tracks contribute 40% to overall
                  tracks: {
                    ...prev.tracks,
                    [index]: progress,
                  },
                }))
              },
            })
            console.log(`Track ${index + 1} uploaded successfully`)
          } catch (error) {
            console.error(`Error uploading track ${index + 1}:`, error)
            throw error
          }
        }
      )

      await Promise.all(trackUploadPromises)
      console.log('All tracks uploaded successfully')

      setUploadProgress?.({
        song: 0,
        coverArt: 100,
        overall: 80,
        currentStep: 'Confirming upload...',
        tracks: {},
      })

      // Fix the confirm request data structure
      const confirmTrackData = presignedUrlData.trackPresignedUrls.map(
        (track: { songId: string; songUploadKey: string }) => ({
          songId: track.songId,
          songUploadKey: track.songUploadKey, // Use songUploadKey, not presignedSongUrl
        })
      )

      const confirmResponse = await axios.post(
        'http://localhost:3000/api/v1/songs/upload/confirm/album',
        {
          albumId: presignedUrlData.albumId,
          albumName: albumData.albumName,
          genre: albumData.genre,
          tags: albumData.tags,
          visibility: albumData.visibility,
          collaborators: albumData.collaborators,
          tracksData: confirmTrackData,
          coverUploadKey: presignedUrlData.coverUploadKey,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0VXNlcklkIiwiaWF0IjoxNzUwNzkxMjM2LCJleHAiOjE3NTA3OTIxMzZ9.YHYapKgjtBtE9HpV_yripiFywbqzf1k3Px6M3jGdAhA`,
          },
        }
      )

      console.log('Album upload confirmed successfully:', confirmResponse.data)

      setUploadProgress?.({
        song: 0,
        coverArt: 100,
        overall: 100,
        currentStep: 'Album upload complete!',
        tracks: {},
      })
    } catch (error) {
      console.error('Error uploading album:', error)
      setUploadProgress?.({
        song: 0,
        coverArt: 0,
        overall: 0,
        currentStep: 'Upload failed',
        tracks: {},
      })
    } finally {
      setTimeout(() => {
        setIsAlbumBeingUploaded(false)
        setUploadProgress?.({
          song: 0,
          coverArt: 0,
          overall: 0,
          currentStep: '',
          tracks: {},
        })
      }, 2000)
    }
  }

  const coverArtFile = watch('coverArt')
  const coverArtSize = coverArtFile?.[0]?.size || 0

  // Album-level collaborator functions
  const addCollaborator = () => {
    if (collaboratorEmail.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(collaboratorEmail.trim())) {
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
    const currentCollaborators = getValues('collaborators') || []
    setValue(
      'collaborators',
      currentCollaborators.filter((email) => email !== emailToRemove)
    )
  }

  // Track-level collaborator functions
  const addTrackCollaborator = (trackIndex: number) => {
    const email = trackCollaboratorEmails[trackIndex]
    if (email?.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email.trim())) {
        return
      }

      const currentTracks = getValues('tracks') || []
      const currentTrackCollaborators =
        currentTracks[trackIndex]?.collaborators || []

      if (
        !currentTrackCollaborators.includes(email.trim()) &&
        currentTrackCollaborators.length < 5
      ) {
        const updatedTracks = [...currentTracks]
        updatedTracks[trackIndex] = {
          ...updatedTracks[trackIndex],
          collaborators: [...currentTrackCollaborators, email.trim()],
        }
        setValue('tracks', updatedTracks)

        const updatedEmails = [...trackCollaboratorEmails]
        updatedEmails[trackIndex] = ''
        setTrackCollaboratorEmails(updatedEmails)
      }
    }
  }

  const removeTrackCollaborator = (
    trackIndex: number,
    emailToRemove: string
  ) => {
    const currentTracks = getValues('tracks') || []
    const updatedTracks = [...currentTracks]
    updatedTracks[trackIndex] = {
      ...updatedTracks[trackIndex],
      collaborators: updatedTracks[trackIndex].collaborators.filter(
        (email) => email !== emailToRemove
      ),
    }
    setValue('tracks', updatedTracks)
  }

  const addTrack = () => {
    if (trackCount < 20) {
      setTrackCount((prev) => prev + 1)
      const currentTracks = getValues('tracks') || []
      setValue('tracks', [
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
      const currentTracks = getValues('tracks') || []
      const updatedTracks = currentTracks.filter((_, i) => i !== index)
      setValue('tracks', updatedTracks)
    }
  }

  const collaborators = watch('collaborators') || []
  const tracks = watch('tracks') || []

  return (
    <div className="w-full px-2 ">
      <h2 className="text-lg font-semibold mb-4">Album Upload</h2>
      <WarningNote noteText="Artist name will be your Display Name" />
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Album Name */}
        <div>
          <label htmlFor="albumName" className="block text-sm font-medium mb-2">
            Album Name
          </label>
          <input
            id="albumName"
            type="text"
            {...register('albumName', {
              required: 'Album name is required',
              validate: (value) => {
                if (!value || !value.trim()) return 'Album name is required'
                const charCount = value.trim().length
                return (
                  charCount <= 60 || 'Album name must not exceed 60 characters'
                )
              },
            })}
            className="w-full p-2 border rounded"
            placeholder="Enter album name"
          />
          {(() => {
            const albumName = watch('albumName')
            if (!albumName || !albumName.trim()) return null
            const charCount = albumName.trim().length
            return (
              <p
                className={`text-sm mt-1 ${
                  charCount > 60 ? 'text-red-500' : 'text-green-500'
                }`}
              >
                Character count: {charCount}/60
              </p>
            )
          })()}
          {errors.albumName && (
            <p className="text-red-500 text-sm mt-1">
              {errors.albumName.message}
            </p>
          )}
        </div>

        {/* Cover Art Upload and Genre */}
        <div className="flex gap-4 flex-col sm:flex-row">
          {/* Cover Art */}
          <div className="sm:w-1/2">
            <label className="block text-sm font-medium mb-2">
              Album Cover Art (JPG/PNG, max 1MB)
            </label>
            <input
              type="file"
              accept=".jpg,.jpeg,.png,image/jpeg,image/png"
              {...register('coverArt', {
                required: 'Album cover art is required',
                validate: (files) => {
                  const file = files?.[0]
                  if (!file) return 'Album cover art is required'
                  if (!['image/jpeg', 'image/png'].includes(file.type)) {
                    return 'Only JPG and PNG files are allowed'
                  }
                  if (file.size > 1024 * 1024) {
                    return 'File size must be less than 1MB'
                  }
                  return true
                },
              })}
              className="w-full p-2 border rounded"
            />
            {coverArtSize > 0 && (
              <p
                className={`text-sm mt-1 ${
                  coverArtSize > 1024 * 1024 ? 'text-red-500' : 'text-green-500'
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
        </div>

        <div className="flex gap-4 flex-col sm:flex-row">
          {/* Tags */}
          <div className="sm:w-1/2">
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
          {/* Visibility */}
          <div className="sm:w-1/2">
            <label className="block text-sm font-medium mb-2">Visibility</label>
            <div className="flex space-x-4 ">
              <select
                {...register('visibility', {
                  required: 'Visibility setting is required',
                })}
                className="w-full p-2 border rounded"
              >
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
            </div>
          </div>
        </div>

        {/* Album Collaborators */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Album Collaborators ({collaborators.length}/5)
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
            <button
              type="button"
              onClick={addCollaborator}
              disabled={!collaboratorEmail.trim() || collaborators.length >= 5}
              className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              Add
            </button>
          </div>
          {collaborators.length > 0 && (
            <div className="space-y-1">
              {collaborators.map((email) => (
                <div
                  key={email}
                  className="flex items-center justify-between bg-gray-100 p-2 rounded"
                >
                  <span className="text-sm">{email}</span>
                  <button
                    type="button"
                    onClick={() => removeCollaborator(email)}
                    className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-500 mt-1">
            Add up to 5 collaborating artists for the entire album
          </p>
        </div>

        {/* Tracks Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium">
              Tracks ({trackCount}/20)
            </label>
            <div className="space-x-2">
              <button
                type="button"
                onClick={addTrack}
                disabled={trackCount >= 20}
                className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                Add Track
              </button>
            </div>
          </div>

          {Array.from({ length: trackCount }, (_, index) => (
            <div key={index} className="border rounded p-3 mb-3 bg-gray-50">
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

              <div className="flex flex-col sm:flex-row gap-4 ">
                {/* Track Name */}
                <div className="mb-2 sm:w-1/2">
                  <label className="block text-xs font-medium mb-1">
                    Track Name
                  </label>
                  <input
                    type="text"
                    {...register(`tracks.${index}.trackName` as const, {
                      required: 'Track name is required',
                      validate: (value) => {
                        if (!value || !value.trim())
                          return 'Track name is required'
                        const charCount = value.trim().length
                        return (
                          charCount <= 50 ||
                          'Track name must not exceed 50 characters'
                        )
                      },
                    })}
                    className="w-full px-2 py-1.5 border rounded text-sm"
                    placeholder={`Enter track ${index + 1} name`}
                  />
                  {(() => {
                    const trackName = watch(
                      `tracks.${index}.trackName` as const
                    )
                    if (!trackName || !trackName.trim()) return null
                    const charCount = trackName.trim().length
                    return (
                      <p
                        className={`text-xs mt-1 ${
                          charCount > 50 ? 'text-red-500' : 'text-green-500'
                        }`}
                      >
                        Character count: {charCount}/50
                      </p>
                    )
                  })()}
                  {errors.tracks?.[index]?.trackName && (
                    <p className="text-red-500 text-xs mt-1">
                      {errors.tracks[index]?.trackName?.message}
                    </p>
                  )}
                </div>
                {/* Track Audio File */}
                <div className="mb-2 sm:w-1/2">
                  <label className="block text-xs font-medium mb-1">
                    Audio File (MP3, max 15MB)
                  </label>
                  <input
                    type="file"
                    accept=".mp3,audio/mp3"
                    {...register(`tracks.${index}.audioFile` as const, {
                      required: 'Track audio file is required',
                      validate: (files) => {
                        const file = files?.[0]
                        if (!file) return 'Track audio file is required'
                        if (file.type !== 'audio/mpeg') {
                          return 'Only MP3 files are allowed'
                        }
                        if (file.size > 15 * 1024 * 1024) {
                          return 'File size must be less than 15MB'
                        }
                        return true
                      },
                    })}
                    className="w-full px-2 py-1.5 border rounded text-sm"
                  />
                  {(() => {
                    const trackFile = watch(
                      `tracks.${index}.audioFile` as const
                    )
                    const trackFileSize = trackFile?.[0]?.size || 0
                    if (trackFileSize > 0) {
                      return (
                        <p
                          className={`text-xs mt-1 ${
                            trackFileSize > 15 * 1024 * 1024
                              ? 'text-red-500'
                              : 'text-green-500'
                          }`}
                        >
                          File size:{' '}
                          {(trackFileSize / (1024 * 1024)).toFixed(1)}
                          MB
                        </p>
                      )
                    }
                    return null
                  })()}
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
                  <label className="block text-xs font-medium mb-1">
                    Genre
                  </label>
                  <select
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
                  <label className="block text-xs font-medium mb-1">Tags</label>
                  <input
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
                  Track Collaborators (
                  {tracks[index]?.collaborators?.length || 0}/5)
                </label>
                <div className="flex space-x-2 mb-2">
                  <input
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
                        addTrackCollaborator(index)
                      }
                    }}
                    className="w-full px-2 py-1.5 border rounded text-sm"
                    placeholder="Enter collaborator's email"
                    disabled={(tracks[index]?.collaborators?.length || 0) >= 5}
                  />
                  <button
                    type="button"
                    onClick={() => addTrackCollaborator(index)}
                    disabled={
                      !trackCollaboratorEmails[index]?.trim() ||
                      (tracks[index]?.collaborators?.length || 0) >= 5
                    }
                    className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    Add
                  </button>
                </div>
                {tracks[index]?.collaborators?.length > 0 && (
                  <div className="space-y-1">
                    {tracks[index].collaborators.map((email) => (
                      <div
                        key={email}
                        className="flex items-center justify-between bg-white p-1 rounded border"
                      >
                        <span className="text-xs">{email}</span>
                        <button
                          type="button"
                          onClick={() => removeTrackCollaborator(index, email)}
                          className="px-1 py-0.5 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                        >
                          Remove
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
          ))}
        </div>

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
