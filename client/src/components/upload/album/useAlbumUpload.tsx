import { useCallback } from 'react'
import axios from 'axios'
import type {
  AlbumUploadForm,
  UploadProgress,
} from '../../../types/UploadComponentTypes'
import axiosInstance from '../../../utils/axios-interceptor'
import toast from 'react-hot-toast'

export const useAlbumUpload = (
  setIsAlbumBeingUploaded: (isUploading: boolean) => void,
  setUploadProgress: React.Dispatch<React.SetStateAction<UploadProgress>>
) => {
  const handleAlbumUpload = useCallback(
    async (data: AlbumUploadForm) => {
      try {
        setIsAlbumBeingUploaded(true)
        setUploadProgress({
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

        setUploadProgress({
          song: 0,
          coverArt: 0,
          overall: 10,
          currentStep: 'Getting presigned URLs...',
          tracks: {},
        })

        // Updated endpoint to match backend
        const { data: presignedUrlData } = await axiosInstance.post(
          'http://localhost:3000/api/v1/albums/upload/presign',
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

        // Upload cover art
        setUploadProgress({
          song: 0,
          coverArt: 0,
          overall: 20,
          currentStep: 'Uploading cover art...',
          tracks: {},
        })

        await axios.put(
          presignedUrlData.presignedCoverUrl,
          data.coverArt?.[0],
          {
            headers: {
              'Content-Type': data.coverArt?.[0]?.type || 'image/jpeg',
            },
            onUploadProgress: (progressEvent) => {
              const progress = Math.round(
                (progressEvent.loaded * 100) / (progressEvent.total ?? 1)
              )
              setUploadProgress({
                song: 0,
                coverArt: progress,
                overall: 20 + progress * 0.2,
                currentStep: 'Uploading cover art...',
                tracks: {},
              })
            },
          }
        )

        // Upload tracks with progress tracking
        setUploadProgress({
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
                    (progressEvent.loaded * 100) / (progressEvent.total ?? 1)
                  )

                  setUploadProgress((prev) => ({
                    ...prev,
                    currentStep: `Uploading track ${index + 1}/${
                      data.tracks.length
                    }...`,
                    overall:
                      40 + ((index + progress / 100) / data.tracks.length) * 40,
                    tracks: {
                      ...prev.tracks,
                      [index]: progress,
                    },
                  }))
                },
              })
            } catch (error) {
              throw error
            }
          }
        )

        await Promise.all(trackUploadPromises)

        setUploadProgress({
          song: 0,
          coverArt: 100,
          overall: 80,
          currentStep: 'Confirming upload...',
          tracks: {},
        })

        // Prepare track data for confirmation
        const confirmTrackData = presignedUrlData.trackPresignedUrls.map(
          (
            track: { songId: string; songUploadKey: string; songName: string },
            index: number
          ) => ({
            songId: track.songId,
            songUploadKey: track.songUploadKey,
            songName: track.songName,
            collaborators: data.tracks[index]?.collaborators || [],
            tags:
              data.tracks[index]?.tags?.split(',').map((tag) => tag.trim()) ||
              [],
            genre: data.tracks[index]?.genre || '',
          })
        )

        // Updated endpoint to match backend
        await axiosInstance.post(
          'http://localhost:3000/api/v1/albums/upload/confirm',
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

        setUploadProgress({
          song: 0,
          coverArt: 100,
          overall: 100,
          currentStep: 'Album upload complete!',
          tracks: {},
        })
      } catch (error) {
        toast.error(
          `Album upload failed : ${
            error instanceof Error ? error.message : 'Unknown error occurred'
          }`
        )

        setUploadProgress({
          song: 0,
          coverArt: 0,
          overall: 0,
          currentStep: 'Upload failed',
          tracks: {},
        })
      } finally {
        setTimeout(() => {
          setIsAlbumBeingUploaded(false)
          setUploadProgress({
            song: 0,
            coverArt: 0,
            overall: 0,
            currentStep: '',
            tracks: {},
          })
        }, 2000)
      }
    },
    [setIsAlbumBeingUploaded, setUploadProgress]
  )

  return { handleAlbumUpload }
}
