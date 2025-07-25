import Hls from 'hls.js'
import { useEffect, useRef, useState, useCallback } from 'react'

interface UseAudioPlayerProps {
  hlsUrl: string
  fallbackUrl: string
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

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    // Clean up previous instances
    hlsRef.current?.destroy()
    hlsRef.current = null
    audio.src = ''

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
        console.error('HLS error:', data)
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

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleTimeUpdate = () => onTimeUpdate?.(audio.currentTime)
    const handleEnded = () => onEnded?.()
    const handleCanPlay = () => onCanPlay?.()
    const handleErrorEvent = () =>
      onError?.(audio.error?.message || 'Unknown audio error')
    const handleLoadedMetadata = () => {
      if (isFinite(audio.duration)) {
        onDurationChange?.(audio.duration)
      }
    }
    const handleWaiting = () => onLoading?.(true)
    const handlePlaying = () => onLoading?.(false)

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
  }, [onTimeUpdate, onEnded, onCanPlay, onError, onDurationChange, onLoading])

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
