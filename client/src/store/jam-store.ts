import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { io, Socket } from 'socket.io-client'
import { usePlayerStore } from './player-store'
import { useAuthStore } from './auth-store'
import { type Song, type RepeatMode } from '../types'
import toast from 'react-hot-toast'

const socketUrl = import.meta.env.VITE_API_SOCKET_GATEWAY_URL
// Define the shape of the session and participant data based on the backend
interface JamParticipant {
  _id: string
  displayName: string
}

interface JamSession {
  _id: string
  joinCode: string
  creator: string
  participants: JamParticipant[]
  queue: Song[]
  currentSong: {
    songId: Song
    startedAt: string
    playbackPosition: number
  }
  playbackState: 'playing' | 'paused'
  repeat: RepeatMode
  shuffle: boolean
  hasControlPermissions: string[]
  createdAt: string
  updatedAt: string
}

interface JamState {
  socket: Socket | null
  session: JamSession | null
  isJamming: boolean
  actions: {
    connect: () => void
    disconnect: () => void
    startJam: (songId: string) => void
    joinJam: (joinCode: string) => void
    leaveJam: () => void
    controlPlayback: (
      action: 'playing' | 'paused',
      playbackPosition?: number
    ) => void
    addToQueue: (songId: string) => void
    changeSong: (songId: string) => void
    seek: (position: number) => void
    controlRepeatMode: (mode: RepeatMode) => void
    controlShuffle: (shuffle: boolean) => void
    giveControlPermission: (userId: string) => void
    revokeControlPermission: (userId: string) => void
    clearQueue: () => void
  }
}

const useJamStore = create<JamState>()(
  devtools(
    (set, get) => ({
      socket: null,
      session: null,
      isJamming: false,
      actions: {
        connect: () => {
          const { socket } = get()
          if (socket) return // Already connected

          const authToken = useAuthStore.getState().accessToken
          if (!authToken) {
            console.error('Jam Store: No auth token found. Cannot connect.')
            return
          }

          const newSocket = io(socketUrl, {
            auth: { token: authToken },
          })

          newSocket.on('connect', () => {
            console.log('Jam socket connected:', newSocket.id)
            set({ socket: newSocket })

            const storedSessionId = localStorage.getItem('jamSessionId')
            const storedJoinCode = localStorage.getItem('jamJoinCode')

            if (storedSessionId && storedJoinCode) {
              console.log(
                'Attempting to rejoin session from local storage:',
                storedJoinCode
              )
              newSocket.emit('join-jam', { joinCode: storedJoinCode })
            }
          })

          newSocket.on('disconnect', () => {
            console.log('Jam socket disconnected.')
            set({ socket: null, session: null, isJamming: false })
          })

          newSocket.on('session-updated', (session: JamSession) => {
            console.log('Received session-updated:', session)
            set({ session, isJamming: true })
            localStorage.setItem('jamSessionId', session._id)
            localStorage.setItem('jamJoinCode', session.joinCode)

            // Sync the main player store with the jam session state
            const playerActions = usePlayerStore.getState().actions
            const currentSongId = usePlayerStore.getState().currentSong?._id

            if (
              session.currentSong.songId &&
              session.currentSong.songId._id !== currentSongId
            ) {
              playerActions.loadSong(session.currentSong.songId, true)
            }

            if (session.playbackState === 'playing') {
              playerActions.play()
              // Calculate current playback position based on startedAt timestamp
              const startedAt = new Date(
                session.currentSong.startedAt
              ).getTime()
              const elapsedTime = (Date.now() - startedAt) / 1000
              const calculatedPosition =
                session.currentSong.playbackPosition + elapsedTime
              playerActions.seek(calculatedPosition)
            } else {
              playerActions.pause()
              playerActions.seek(session.currentSong.playbackPosition)
            }

            // Sync queue
            playerActions.setQueue(session.queue)
            playerActions.setRepeatMode(session.repeat)
            playerActions.setShuffle(session.shuffle)
          })

          newSocket.on('session-ended', ({ message }) => {
            console.log('Session ended:', message)
            set({ session: null, isJamming: false })
            // Optionally, show a notification to the user
          })

          newSocket.on('error', (error) => {
            console.error('Jam socket error:', error.message)
            toast.error(`${error.message}`)
          })
        },

        disconnect: () => {
          get().socket?.disconnect()
        },

        startJam: (songId: string) => {
          get().socket?.emit('start-jam', { songId })
        },

        joinJam: (joinCode: string) => {
          get().socket?.emit('join-jam', { joinCode })
        },

        leaveJam: () => {
          // Clear local state immediately
          set({ session: null, isJamming: false });
          localStorage.removeItem('jamSessionId');
          localStorage.removeItem('jamJoinCode');
          // Then disconnect the socket
          get().socket?.disconnect();
        },

        controlPlayback: (action, playbackPosition) => {
          const { session } = get()
          if (session) {
            get().socket?.emit('control-playback', {
              sessionId: session._id,
              action,
              playbackPosition,
            })
          }
        },

        addToQueue: (songId: string) => {
          const { session } = get()
          if (session) {
            get().socket?.emit('add-to-queue', {
              sessionId: session._id,
              songId,
            })
          }
        },

        changeSong: (songId: string) => {
          const { session } = get()
          if (session) {
            get().socket?.emit('change-song', {
              sessionId: session._id,
              songId,
            })
          }
        },

        seek: (position: number) => {
          const { session } = get()
          if (session) {
            get().socket?.emit('seek', { sessionId: session._id, position })
          }
        },

        controlRepeatMode: (mode: RepeatMode) => {
          const { session } = get()
          if (session) {
            get().socket?.emit('control-repeat-mode', {
              sessionId: session._id,
              mode,
            })
          }
        },

        controlShuffle: (shuffle: boolean) => {
          const { session } = get()
          if (session) {
            get().socket?.emit('control-shuffle', {
              sessionId: session._id,
              shuffle,
            })
          }
        },

        giveControlPermission: (userId: string) => {
          const { session } = get()
          if (session) {
            get().socket?.emit('give-control-permission', {
              sessionId: session._id,
              userId,
            })
          }
        },

        revokeControlPermission: (userId: string) => {
          const { session } = get()
          if (session) {
            get().socket?.emit('revoke-control-permission', {
              sessionId: session._id,
              userId,
            })
          }
        },
        getLatestSession: () => {
          const { session } = get()
          if (session) {
            return session
          } else {
            get().socket?.emit('get-session', (session: JamSession) => {})
          }
        },
        clearQueue: () => {
          const { session } = get()
          if (session) {
            get().socket?.emit('clear-queue', { sessionId: session._id })
          }
        },
      },
    }),
    {
      name: 'JamStore',
    }
  )
)

export const useJamActions = () => useJamStore((state) => state.actions)
export const useIsJamming = () => useJamStore((state) => state.isJamming)
export const useJamSession = () => useJamStore((state) => state.session)
