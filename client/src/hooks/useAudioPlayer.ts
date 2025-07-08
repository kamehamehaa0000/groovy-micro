import Hls from 'hls.js'
import { useEffect, useRef, useState } from 'react'

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
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [canPlay, setCanPlay] = useState(false)
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const setupHls = () => {
      if (Hls.isSupported()) {
        const hls = new Hls()
        hlsRef.current = hls
        hls.loadSource(hlsUrl)
        hls.attachMedia(audio)
        console.log('HLS is supported, using Hls.js')
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setIsLoading(false)
          setCanPlay(true)
          //   setIsPlaying(true)
        })
        hls.on(Hls.Events.ERROR, (event, data) => {
          console.error('HLS error:', event, data)
          if (data.fatal) {
            onError?.('HLS error occurred: ' + JSON.stringify(data))
            hls.destroy()
            audio.src = fallbackUrl
          }
        })
      } else if (audio.canPlayType('application/vnd.apple.mpegurl')) {
        // For Safari and other browsers that support HLS natively
        console.log('HLS is natively supported, using direct URL')
        audio.src = hlsUrl
        audio.addEventListener('loadedmetadata', () => {
          console.log('Audio loadedmetadata (native HLS)')
          setIsLoading(false)
          setCanPlay(true)
          //   setIsPlaying(true)
        })
      } else {
        //no HLS support, fallback to direct URL
        console.warn('HLS not supported, falling back to direct URL')
        audio.src = fallbackUrl

        setCanPlay(true)
        setIsLoading(false)
        // setIsPlaying(true)
      }
    }
    setupHls()
    const handleTimeUpdate = () => {
      onTimeUpdate?.(audio.currentTime)
    }
    const handleEnded = () => {
      setIsPlaying(false)
      onEnded?.()
    }
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('canplay', () => setIsLoading(false))

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('canplay', () => setIsLoading(false))
      hlsRef.current?.destroy()
    }
  }, [hlsUrl, fallbackUrl, onEnded, onError, onTimeUpdate])

  const play = async () => {
    try {
      await audioRef.current?.play()
      setIsPlaying(true)
    } catch (error) {
      console.error('Error playing audio:', error)
    }
  }
  const pause = () => {
    audioRef.current?.pause()
    setIsPlaying(false)
  }
  const seek = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time
    }
  }

  return {
    audioRef,
    isPlaying,
    isLoading,
    canPlay,
    play,
    pause,
    seek,
  }
}
