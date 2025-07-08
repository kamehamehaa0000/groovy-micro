import { create } from 'zustand'
import { io, Socket } from 'socket.io-client'
import { usePlayerStore } from './player-store'

// Assuming IJamSession is defined in a shared types folder
// For now, we'll define a basic version here.
export interface IJamSession {
  _id: string
  creator: string // Populate with user type later
  participants: string[] // Populate with user type later
  queue: string[] // Populate with song type later
  currentSong: {
    songId: string // Populate with song type later
    startedAt: string
    playbackPosition: number
  }
  playbackState: 'playing' | 'paused'
  joinCode: string
}

interface JamState {
  socket: Socket | null
  session: IJamSession | null
  isActive: boolean
  actions: {
    startJam: (songId: string, token: string) => void
    joinJam: (joinCode: string, token: string) => void
    controlPlayback: (action: 'playing' | 'paused') => void
    addToQueue: (songId: string) => void
    changeSong: (songId: string) => void
    leaveJam: () => void
  }
}

const useJamStore = create<JamState>((set, get) => ({
  socket: null,
  session: null,
  isActive: false,
  actions: {
    startJam: (songId, token) => {
      const socket = io(
        import.meta.env.VITE_PREFERENCES_SERVICE_URL ?? 'http://localhost:4004',
        {
          auth: { token },
        }
      )

      socket.on('connect', () => {
        console.log('[socket] Connected!')
        socket.emit('start-jam', { songId })
      })

      socket.on('session-updated', (session: IJamSession) => {
        console.log('[socket] Session Updated:', session)
        set({ session, isActive: true })

        // Sync with player store
        const { queue, actions: playerActions } = usePlayerStore.getState()
        const songToPlay = queue.find(s => s._id === session.currentSong.songId)

        if (songToPlay) {
            playerActions.loadSong(songToPlay, session.playbackState === 'playing')
            playerActions.seek(session.currentSong.playbackPosition)
        }
        if (session.playbackState === 'playing') {
            playerActions.play()
        } else {
            playerActions.pause()
        }
      })

      socket.on('session-ended', ({ message }) => {
        console.log('[socket] Session Ended:', message)
        get().actions.leaveJam()
        // Optionally: show a notification to the user
      })

      socket.on('error', (error) => {
        console.error('[socket] Error:', error.message)
        // Optionally: show an error notification to the user
      })

      set({ socket })
    },

    joinJam: (joinCode, token) => {
      const socket = io(
        import.meta.env.VITE_PREFERENCES_SERVICE_URL ?? 'http://localhost:4004',
        {
          auth: { token },
        }
      )

      socket.on('connect', () => {
        console.log('[socket] Connected!')
        socket.emit('join-jam', { joinCode })
      })

      socket.on('session-updated', (session: IJamSession) => {
        console.log('[socket] Session Updated:', session)
        set({ session, isActive: true })

        // Sync with player store
        const { queue, actions: playerActions } = usePlayerStore.getState()
        const songToPlay = queue.find(s => s._id === session.currentSong.songId)

        if (songToPlay) {
            playerActions.loadSong(songToPlay, session.playbackState === 'playing')
            playerActions.seek(session.currentSong.playbackPosition)
        }
         if (session.playbackState === 'playing') {
            playerActions.play()
        } else {
            playerActions.pause()
        }
      })

      socket.on('session-ended', ({ message }) => {
        console.log('[socket] Session Ended:', message)
        get().actions.leaveJam()
      })

      socket.on('error', (error) => {
        console.error('[socket] Error:', error.message)
      })

      set({ socket })
    },

    controlPlayback: (action) => {
      const { socket, session } = get()
      if (socket && session) {
        // Optimistically update UI
        if(action === 'playing') usePlayerStore.getState().actions.play();
        else usePlayerStore.getState().actions.pause();

        socket.emit('control-playback', { sessionId: session._id, action })
      }
    },

    addToQueue: (songId) => {
      const { socket, session } = get()
      if (socket && session) {
        socket.emit('add-to-queue', { sessionId: session._id, songId })
      }
    },

    changeSong: (songId) => {
      const { socket, session } = get()
      if (socket && session) {
        socket.emit('change-song', { sessionId: session._id, songId })
      }
    },

    leaveJam: () => {
      const { socket } = get()
      if (socket) {
        socket.disconnect()
      }
      set({ socket: null, session: null, isActive: false })
    },
  },
}))

export default useJamStore