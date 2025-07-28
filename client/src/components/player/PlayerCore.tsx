import { useCallback, useEffect } from 'react'
import { useAudioPlayer } from '../../hooks/useAudioPlayer'
import { usePlayerStore } from '../../store/player-store'

const PlayerCore = () => {
  const {
    currentSong,
    isPlaying,
    playbackPosition,
    volume,
    isMuted,
    forceSeekToZero,
    repeatMode,
    isShuffled,
    queue,
    shuffledQueue,
    currentSongIndex,
    actions: {
      updatePlaybackPosition,
      setIsLoading,
      setDuration,
      nextSong,
      pause: pauseAction,
      play: playAction,
      clearForceSeekToZero,
      seek: seekAction,
    },
  } = usePlayerStore()

  const handleLoading = useCallback(
    (loading: boolean) => {
      setIsLoading(loading)
    },
    [setIsLoading]
  )

  const handleDurationChange = useCallback(
    (duration: number) => {
      setDuration(duration)
    },
    [setDuration]
  )

  const handleTimeUpdate = useCallback(
    (time: number) => {
      updatePlaybackPosition(time)
    },
    [updatePlaybackPosition]
  )

  const handleEnded = useCallback(() => {
    if (repeatMode === 'one') {
      seekAction(0)
      playAction()
    } else if (repeatMode === 'all') {
      nextSong()
    } else {
      const activeQueue = isShuffled ? shuffledQueue : queue
      if (currentSongIndex < activeQueue.length - 1) {
        nextSong()
      } else {
        pauseAction()
        seekAction(0)
      }
    }
  }, [
    repeatMode,
    isShuffled,
    shuffledQueue,
    queue,
    currentSongIndex,
    nextSong,
    pauseAction,
    playAction,
    seekAction,
  ])

  // --- FIX STARTS HERE ---

  // Wrap onError in useCallback
  const handleError = useCallback((error: string) => {
    console.error('Audio Player Error:', error)
  }, [])

  // Wrap onCanPlay in useCallback
  const handleCanPlay = useCallback(() => {
    handleLoading(false)
  }, [handleLoading])

  const { audioRef, play, pause, seek } = useAudioPlayer({
    hlsUrl: currentSong?.hlsUrl ?? '',
    fallbackUrl: currentSong?.originalUrl ?? '',
    songId: currentSong?._id ?? '', // Pass songId here
    onTimeUpdate: handleTimeUpdate,
    onEnded: handleEnded,
    onError: handleError, // Use the memoized callback
    onCanPlay: handleCanPlay, // Use the memoized callback
    onLoading: handleLoading,
    onDurationChange: handleDurationChange,
  })

  // --- FIX ENDS HERE ---

  useEffect(() => {
    if (isPlaying) {
      play()
    } else {
      pause()
    }
  }, [isPlaying, play, pause, currentSong?._id])

  useEffect(() => {
    if (forceSeekToZero) {
      seek(0)
      clearForceSeekToZero()
    }
  }, [forceSeekToZero, seek, clearForceSeekToZero])

  // This new effect fixes seeking
  useEffect(() => {
    if (audioRef.current) {
      // Check if the store's position and the audio's actual time have drifted
      // apart significantly. This is to avoid a loop where timeupdate -> store update -> seek.
      // A drift of more than 1.5 seconds usually means the user has manually seeked.
      const drift = Math.abs(audioRef.current.currentTime - playbackPosition)
      if (drift > 1.5) {
        seek(playbackPosition)
      }
    }
  }, [playbackPosition, seek, audioRef])

  // Sync volume and mute from store to the audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume
      audioRef.current.muted = isMuted
    }
  }, [volume, isMuted, audioRef])

  return <audio ref={audioRef} />
}

export default PlayerCore
