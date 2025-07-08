import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
export interface Song {
  _id: string
  hlsUrl: string
  originalUrl: string
  metadata: {
    title: string
    artist: {
      _id: string
      displayName: string
    }
    album: {
      _id: string
      title: string
      coverUrl: string
    }
    coverUrl: string
    genre: string
    trackNumber: number
  }
}
interface PlayerState {
  currentSong: null | Song
  queue: Song[]
  isPlaying: boolean
  playbackPosition: number
  isLoading: boolean
  isExpanded: boolean
  forceSeekToZero: boolean
  actions: {
    loadSong: (song: Song, playNow?: boolean) => void
    play: () => void
    pause: () => void
    seek: (time: number) => void
    nextSong: () => void
    setQueue: (songs: Song[]) => void
    updatePlaybackPosition: (time: number) => void
    setIsLoading: (loading: boolean) => void
    setIsExpanded: (expanded: boolean) => void
    clearForceSeekToZero: () => void
    previousSong: () => void
  }
}

// This is a conceptual store. The actual implementation will need to
// interact with the useAudioPlayer hook, likely within the main Player component.
export const usePlayerStore = create<PlayerState>()(
  devtools((set, get) => ({
    currentSong: null,
    queue: [],
    isPlaying: false,
    playbackPosition: 0,
    isLoading: true,
    isExpanded: false,
    forceSeekToZero: false,
    actions: {
      loadSong: (song, playNow = false) => {
        set({ currentSong: song, playbackPosition: 0, isPlaying: playNow })
      },
      play: () => set({ isPlaying: true }),
      pause: () => set({ isPlaying: false }),
      seek: (time) => set({ playbackPosition: time }),
      nextSong: () => {
        const { queue, currentSong } = get()
        const currentIndex = queue.findIndex((s) => s._id === currentSong?._id)
        if (currentIndex !== -1 && currentIndex < queue.length - 1) {
          set({ currentSong: queue[currentIndex + 1], playbackPosition: 0 })
        } else {
          set({ isPlaying: false }) // End of queue
        }
      },
      previousSong: () => {
        const { queue, currentSong, playbackPosition } = get()
        if (playbackPosition > 10) {
          set({ playbackPosition: 0, forceSeekToZero: true })
        } else {
          const currentIndex = queue.findIndex(
            (s) => s._id === currentSong?._id
          )
          if (currentIndex > 0) {
            set({
              currentSong: queue[currentIndex - 1],
              playbackPosition: 0,
              forceSeekToZero: true,
            })
          } else {
            // Optionally, loop to the end of the queue or stop playback
            set({ isPlaying: false }) // Beginning of queue
          }
        }
      },
      setQueue: (songs) => set({ queue: songs }),
      updatePlaybackPosition: (time) => set({ playbackPosition: time }),
      setIsLoading: (loading) => set({ isLoading: loading }),
      setIsExpanded: (expanded) => set({ isExpanded: expanded }),
      clearForceSeekToZero: () => set({ forceSeekToZero: false }),
    },
  }))
)
