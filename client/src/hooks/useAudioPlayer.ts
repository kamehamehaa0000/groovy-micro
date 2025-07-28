import Hls from 'hls.js'
import { useEffect, useRef, useState, useCallback } from 'react'
import useJamStore from '../store/jam-store'

interface UseAudioPlayerProps {
  hlsUrl: string
  fallbackUrl: string
  songId: string // Add songId here
  onTimeUpdate?: (currentTime: number) => void
  onEnded?: () => void
  onError?: (error: string) => void
  onCanPlay?: () => void
  onLoading?: (loading: boolean) => void
  onDurationChange?: (duration: number) => void
}

export const useAudioPlayer = ({
  hlsUrl,
  fallbackUrl,
  songId,
  onEnded,
  onError,
  onTimeUpdate,
  onCanPlay,
  onLoading,
  onDurationChange,
}: UseAudioPlayerProps) => {
  const audioRef = useRef<HTMLAudioElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const hasStreamed = useRef(false) //  track if stream is counted
  const playTimeRef = useRef(0) // tracks cumulative play time in seconds
  const lastTimeUpdateRef = useRef(0) // Ref to track the last time for delta calculation
  const { socket: jamSocket } = useJamStore() // Get socket from jam store

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    // Clean up previous instances
    hlsRef.current?.destroy()
    hlsRef.current = null
    audio.src = ''
    // Reset stream count tracking
    hasStreamed.current = false
    playTimeRef.current = 0
    lastTimeUpdateRef.current = 0

    if (!hlsUrl) {
      onLoading?.(false)
      return
    }

    onLoading?.(true)

    if (Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: 30,
        maxMaxBufferLength: 600,
        startLevel: -1,
      })
      hlsRef.current = hls
      hls.loadSource(hlsUrl)
      hls.attachMedia(audio)

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        onCanPlay?.()
      })

      hls.on(Hls.Events.ERROR, (event, data) => {
        console.error('HLS error:', data, event)
        if (data.fatal) {
          onError?.(`HLS error: ${data.details}`)
          hls.destroy()
          if (fallbackUrl) audio.src = fallbackUrl
        }
      })
    } else if (audio.canPlayType('application/vnd.apple.mpegurl')) {
      audio.src = hlsUrl
    } else {
      audio.src = fallbackUrl
    }

    return () => {
      hlsRef.current?.destroy()
      hlsRef.current = null
    }
  }, [hlsUrl, fallbackUrl, onError, onCanPlay, onLoading])

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    onTimeUpdate?.(audio.currentTime) // for ui updates

    if (audio.paused || hasStreamed.current) return
    const currentTime = audio.currentTime
    const timeDelta = currentTime - lastTimeUpdateRef.current

    // Only add to playTime if the delta is small and positive (i.e. not a seek)
    if (timeDelta > 0 && timeDelta < 1) {
      playTimeRef.current += timeDelta
    }

    lastTimeUpdateRef.current = currentTime
    if (playTimeRef.current >= 30 && !hasStreamed.current) {
      console.log(`Cumulative play time reached 30s for song ${songId}.`)
      jamSocket?.emit('songStreamed', { songId })
      hasStreamed.current = true
    }
  }, [jamSocket, songId, onTimeUpdate])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const handleEnded = () => {
      onEnded?.()
      hasStreamed.current = false // Reset for next play
      hasStreamed.current = false // Reset for next play
      playTimeRef.current = 0
    }
    const handleCanPlay = () => onCanPlay?.()
    const handleErrorEvent = () => {
      onError?.(audio.error?.message || 'Unknown audio error')
      hasStreamed.current = false // Reset on error
      playTimeRef.current = 0
    }
    const handleLoadedMetadata = () => {
      if (isFinite(audio.duration)) {
        onDurationChange?.(audio.duration)
      }
    }
    const handleWaiting = () => onLoading?.(true)
    const handlePlaying = () => {
      onLoading?.(false)
      lastTimeUpdateRef.current = audio.currentTime // Reset last time update on playing
    }

    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('canplay', handleCanPlay)
    audio.addEventListener('error', handleErrorEvent)
    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('waiting', handleWaiting)
    audio.addEventListener('playing', handlePlaying)

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('canplay', handleCanPlay)
      audio.removeEventListener('error', handleErrorEvent)
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('waiting', handleWaiting)
      audio.removeEventListener('playing', handlePlaying)
    }
  }, [
    onTimeUpdate,
    onEnded,
    onCanPlay,
    onError,
    onDurationChange,
    onLoading,
    handleTimeUpdate,
  ])

  const play = useCallback(() => {
    audioRef.current
      ?.play()
      .catch((error) => console.error('Error playing audio:', error))
  }, [])

  const pause = useCallback(() => {
    audioRef.current?.pause()
  }, [])

  const seek = useCallback((time: number) => {
    if (audioRef.current && isFinite(time)) {
      audioRef.current.currentTime = time
      // Update lastTimeUpdateRef on seek to prevent large delta calculation
      lastTimeUpdateRef.current = time
    }
  }, [])

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      if (audioRef.current) audioRef.current.muted = !prev
      return !prev
    })
  }, [])

  const setVolumeCb = useCallback((newVolume: number) => {
    setVolume(newVolume)
    if (audioRef.current) {
      audioRef.current.volume = newVolume
    }
  }, [])

  return {
    audioRef,
    play,
    pause,
    seek,
    volume,
    isMuted,
    setVolume: setVolumeCb,
    toggleMute,
  }
}
