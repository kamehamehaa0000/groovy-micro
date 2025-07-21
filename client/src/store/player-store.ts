import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
export interface Song {
  isLikedByCurrentUser?: boolean
  coverArtUrl?: string
  likedBy?: number
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
    genre: string
    trackNumber: number
    likedBy: string[]
  }
}
export type RepeatMode = 'off' | 'all' | 'one'
interface PlayerState {
  currentSong: null | Song
  queue: Song[]
  shuffledQueue: Song[]
  isPlaying: boolean
  playbackPosition: number
  isLoading: boolean
  isExpanded: boolean
  forceSeekToZero: boolean
  isShuffled: boolean
  repeatMode: RepeatMode
  currentSongIndex: number
  actions: {
    loadSong: (song: Song, playNow?: boolean) => void
    loadQueue: (songs: Song[], startPlayingFromIndex?: number) => void
    setQueue: (songs: Song[]) => void
    play: () => void
    pause: () => void
    seek: (time: number) => void
    nextSong: () => void
    previousSong: () => void
    updatePlaybackPosition: (time: number) => void
    setIsLoading: (loading: boolean) => void
    setIsExpanded: (expanded: boolean) => void
    clearForceSeekToZero: () => void
    toggleShuffle: () => void
    cycleRepeatMode: () => void
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
    currentSongIndex: -1,
    isExpanded: false,
    forceSeekToZero: false,
    isShuffled: false,
    repeatMode: 'off',
    shuffledQueue: [],
    actions: {
      loadSong: (song, playNow = false) => {
        set({ currentSong: song, playbackPosition: 0, isPlaying: playNow })
      },
      play: () => set({ isPlaying: true }),
      pause: () => set({ isPlaying: false }),
      seek: (time) => set({ playbackPosition: time }),
      nextSong: () => {
        const { queue, currentSongIndex, shuffledQueue, isShuffled } = get()

        const activeQueue = isShuffled ? shuffledQueue : queue
        if (activeQueue.length === 0) return
        const nextIndex = (currentSongIndex + 1) % activeQueue.length

        set({
          currentSong: activeQueue[nextIndex],
          currentSongIndex: nextIndex,
          forceSeekToZero: true,
          isPlaying: true,
        })
      },
      previousSong: () => {
        const {
          queue,
          playbackPosition,
          isShuffled,
          shuffledQueue,
          currentSongIndex,
        } = get()
        if (playbackPosition > 10) {
          set({ playbackPosition: 0, forceSeekToZero: true })
        } else {
          const activeQueue = isShuffled ? shuffledQueue : queue
          if (activeQueue.length === 0) return
          const prevIndex =
            (currentSongIndex - 1 + activeQueue.length) % activeQueue.length
          set({
            currentSong: activeQueue[prevIndex],
            currentSongIndex: prevIndex,
            forceSeekToZero: true,
            isPlaying: true,
          })
        }
      },
      setQueue: (songs) => set({ queue: songs }),
      updatePlaybackPosition: (time) => set({ playbackPosition: time }),
      setIsLoading: (loading) => set({ isLoading: loading }),
      setIsExpanded: (expanded) => set({ isExpanded: expanded }),
      clearForceSeekToZero: () => set({ forceSeekToZero: false }),
      loadQueue: (songs, startPlayingFromIndex = 0) => {
        const { isShuffled } = get()
        const newQueue = [...songs]
        const currentSong = newQueue[startPlayingFromIndex]

        set({
          queue: newQueue,
          currentSong,
          currentSongIndex: startPlayingFromIndex,
          isPlaying: true,
          forceSeekToZero: true,
        })

        if (isShuffled) {
          const remainingSongs = newQueue.filter(
            (s) => s._id !== currentSong._id
          )
          const shuffledRemaining = remainingSongs.sort(
            () => Math.random() - 0.5
          )
          set({ shuffledQueue: [currentSong, ...shuffledRemaining] })
        }
      },
      toggleShuffle: () => {
        const { isShuffled, queue, currentSong } = get()
        const newIsShuffled = !isShuffled

        if (newIsShuffled && currentSong) {
          const remainingSongs = queue.filter((s) => s._id !== currentSong._id)
          const shuffledRemaining = remainingSongs.sort(
            () => Math.random() - 0.5
          )
          const newShuffledQueue = [currentSong, ...shuffledRemaining]
          set({
            isShuffled: true,
            shuffledQueue: newShuffledQueue,
            currentSongIndex: 0,
          })
        } else {
          const originalIndex = queue.findIndex(
            (s) => s._id === currentSong?._id
          )
          set({
            isShuffled: false,
            shuffledQueue: [],
            currentSongIndex: originalIndex,
          })
        }
      },
      cycleRepeatMode: () => {
        const { repeatMode } = get()
        const modes: RepeatMode[] = ['off', 'all', 'one']
        const currentIndex = modes.indexOf(repeatMode)
        const nextMode = modes[(currentIndex + 1) % modes.length]
        set({ repeatMode: nextMode })
      },
    },
  }))
)
