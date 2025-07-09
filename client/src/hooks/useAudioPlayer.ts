import Hls from 'hls.js'
import { useEffect, useRef, useState, useCallback } from 'react'

interface UseAudioPlayerProps {
  hlsUrl: string
  fallbackUrl: string
  onTimeUpdate?: (currentTime: number) => void
  onEnded?: () => void
  onError?: (error: string) => void
}

export const useAudioPlayer = ({
  hlsUrl,
  fallbackUrl,
  onEnded,
  onError,
  onTimeUpdate,
}: UseAudioPlayerProps) => {
  const audioRef = useRef<HTMLAudioElement>(null)
  const hlsRef = useRef<Hls | null>(null)

  const [isLoading, setIsLoading] = useState(true)
  const [canPlay, setCanPlay] = useState(false)
  const [duration, setDuration] = useState(0) // Add state for duration
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !hlsUrl) return

    setIsLoading(true)
    setCanPlay(false)
    setDuration(0) // Reset duration on new song

    const setupHls = () => {
      if (Hls.isSupported()) {
        const hls = new Hls({
          // Add configuration to improve stability
          maxBufferLength: 30,
          maxMaxBufferLength: 600,
          startLevel: -1,
        })
        hlsRef.current = hls
        hls.loadSource(hlsUrl)
        hls.attachMedia(audio)
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setIsLoading(false)
          setCanPlay(true)
        })
        hls.on(Hls.Events.ERROR, (event, data) => {
          console.error('HLS error:', data)
          // Only treat fatal errors as show-stoppers
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
    }

    setupHls()

    const handleTimeUpdate = () => onTimeUpdate?.(audio.currentTime)
    const handleEnded = () => onEnded?.()
    const handleCanPlay = () => {
      setIsLoading(false)
      setCanPlay(true)
    }
    const handleErrorEvent = () =>
      onError?.(audio.error?.message || 'Unknown audio error')
    const handleLoadedMetadata = () => {
      // Set duration once metadata is loaded
      if (isFinite(audio.duration)) {
        setDuration(audio.duration)
      }
    }

    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('canplay', handleCanPlay)
    audio.addEventListener('error', handleErrorEvent)
    audio.addEventListener('loadedmetadata', handleLoadedMetadata) // Listen for metadata

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('canplay', handleCanPlay)
      audio.removeEventListener('error', handleErrorEvent)
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata) // Cleanup
      hlsRef.current?.destroy()
      hlsRef.current = null
    }
  }, [hlsUrl, fallbackUrl, onEnded, onError, onTimeUpdate])

  // ... (volume effect and control functions remain the same)

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
    }
  }, [])

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev)
  }, [])

  return {
    audioRef,
    isLoading,
    canPlay,
    duration,
    play,
    pause,
    seek,
    volume,
    isMuted,
    setVolume,
    toggleMute,
  }
}
