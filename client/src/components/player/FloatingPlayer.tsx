import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { PiArrowCircleUpRightThin } from 'react-icons/pi'
import { motion, AnimatePresence } from 'framer-motion'
import { BiPause, BiPlay, BiRepeat, BiShuffle } from 'react-icons/bi'
import { FiMinimize2, FiVolume1, FiVolume2, FiVolumeX } from 'react-icons/fi'
import { BsSkipBackward, BsSkipForward } from 'react-icons/bs'
import { IoClose } from 'react-icons/io5'
import { usePlayerStore } from '../../store/player-store'
import { useAudioPlayer } from '../../hooks/useAudioPlayer'
import useJamStore from '../../store/jam-store'
import { useAuthStore } from '../../store/auth-store'
import { HiOutlineQueueList } from 'react-icons/hi2'

export const FloatingPlayer: React.FC = () => {
  const [isQueueOpen, setIsQueueOpen] = useState(false)
  const {
    currentSong,
    isPlaying,
    playbackPosition,
    queue,
    isExpanded,
    forceSeekToZero,
    isShuffled, // Get new state
    repeatMode, // Get new state
    currentSongIndex,
    shuffledQueue,
    actions: {
      setIsExpanded,
      cycleRepeatMode,
      clearForceSeekToZero,
      ...playerActions
    },
  } = usePlayerStore()
  const {
    actions: { startJam },
  } = useJamStore()
  const { accessToken } = useAuthStore()

  const handleTimeUpdate = useCallback(
    (time: number) => {
      playerActions.updatePlaybackPosition(time)
    },
    [playerActions]
  )
  const handleError = useCallback((error: string) => {
    console.error('Audio Player Error:', error)
  }, [])

  const [songHasEnded, setSongHasEnded] = useState(0) // State to signal when a song has ended
  const handleEnded = useCallback(() => {
    setSongHasEnded((v) => v + 1) // Increment the state to trigger the songEnd/handleEnd effect below.
  }, [])
  const {
    audioRef,
    play,
    pause,
    seek,
    canPlay,
    volume,
    isMuted,
    duration,
    setVolume,
    toggleMute,
  } = useAudioPlayer({
    hlsUrl: currentSong?.hlsUrl ?? '',
    fallbackUrl: currentSong?.originalUrl ?? '',
    onTimeUpdate: handleTimeUpdate,
    onEnded: handleEnded,
    onError: handleError,
  })

  useEffect(() => {
    const currentRepeatMode = repeatMode
    if (currentRepeatMode === 'one') {
      seek(0) // Repeat the current song
      playerActions.play() // Ensure playback continues
      play()
    } else if (currentRepeatMode === 'all') {
      playerActions.nextSong() // Go to the next song
    } else {
      const activeQueue = isShuffled ? shuffledQueue : queue
      if (currentSongIndex < activeQueue.length - 1) {
        playerActions.nextSong()
      } else {
        playerActions.pause()
      }
    }
  }, [songHasEnded])

  // Core effect to sync global state with the audio element
  useEffect(() => {
    if (canPlay) {
      if (isPlaying) {
        play()
      } else {
        pause()
      }
    }
  }, [isPlaying, canPlay, play, pause])

  useEffect(() => {
    if (forceSeekToZero) {
      seek(0)
      clearForceSeekToZero()
    }
  }, [forceSeekToZero, seek, clearForceSeekToZero])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      const isTypingInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.contentEditable === 'true' ||
        target.isContentEditable

      if (event.code === 'Space' && !isTypingInput) {
        event.preventDefault()
        if (isPlaying) {
          playerActions.pause()
        } else {
          playerActions.play()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isPlaying, playerActions])

  const handlePlayPause = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isPlaying) {
      playerActions.pause()
    } else {
      playerActions.play()
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value)
    playerActions.seek(time)
    seek(time)
  }
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVolume(Number(e.target.value))
  }

  const getVolumeIcon = () => {
    if (isMuted || volume === 0)
      return <FiVolumeX className="w-4 h-4 text-gray-400" />
    if (volume < 0.5) return <FiVolume1 className="w-4 h-4 text-gray-400" />
    return <FiVolume2 className="w-4 h-4 text-gray-400" />
  }
  const handleStartJam = () => {
    if (currentSong && accessToken) {
      startJam(currentSong._id, accessToken)
    }
  }

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
      .toString()
      .padStart(2, '0')
    return `${minutes}:${seconds}`
  }

  const currentTrack = useMemo(
    () => ({
      title: currentSong?.metadata.title ?? 'No song selected',
      artist: currentSong?.metadata.artist?.displayName ?? 'Unknown Artist',
      album: currentSong?.metadata.album.title ?? 'Unknown Album',
      duration: formatTime(audioRef.current?.duration ?? 0),
      currentTime: formatTime(playbackPosition),
      cover:
        currentSong?.metadata.album.coverUrl ??
        'https://via.placeholder.com/150',
    }),
    [currentSong, playbackPosition, audioRef.current?.duration]
  )
  const [windowSize, setWindowSize] = useState({
    width: 0,
    height: 0,
  })
  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      })
    }

    // Set initial size
    handleResize()

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  if (!currentSong) {
    return null // Don't render the player if no song is loaded
  }

  return (
    <>
      <audio ref={audioRef} />
      {isExpanded ? (
        <div className="fixed top-0 right-0 w-full sm:w-[380px] h-full bg-white/95 backdrop-blur-md  border-gray-200/50 flex flex-col z-50 overflow-hidden">
          {/* Expanded Player Content */}
          <div className="flex flex-col h-full min-h-0 p-6 sm:p-8 sm:justify-start">
            {/* Header */}
            <div className="flex items-center justify-between mb-12 flex-shrink-0">
              <h2 className="text-sm font-medium text-gray-700 tracking-wide">
                NOW PLAYING
              </h2>
              <button
                className="w-8 h-8 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100/50 transition-all duration-200"
                onClick={() => setIsExpanded(false)}
              >
                <FiMinimize2 className="w-4 h-4" />
              </button>
            </div>

            {/* Album Art */}
            <div className=" my-auto flex flex-col items-center mb-12 flex-shrink-0">
              <motion.div
                className=" w-60 h-60 lg:w-48 lg:h-48  bg-gray-100 rounded-2xl mb-6 overflow-hidden shadow-sm"
                whileHover={{ scale: 1.02 }}
                transition={{ duration: 0.2 }}
              >
                <img
                  src={currentTrack.cover}
                  alt={currentTrack.title}
                  className="w-full h-full object-cover"
                />
              </motion.div>

              <div className="text-center max-w-full">
                <h3 className="text-lg font-semibold mb-1 text-gray-900 truncate">
                  {currentTrack.title}
                </h3>
                <p className="text-sm text-gray-500 mb-1 truncate">
                  {currentTrack.artist}
                </p>
                <p className="text-xs text-gray-400 truncate">
                  {currentTrack.album}
                </p>
              </div>
            </div>
            <div className="mt-auto">
              {/* Progress */}
              <div className="mb-8 flex-shrink-0">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                  <span className="font-mono">{currentTrack.currentTime}</span>
                  <span className="font-mono">{currentTrack.duration}</span>
                </div>
                <div className="relative">
                  <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gray-900 transition-all duration-100"
                      style={{
                        width: `${
                          (playbackPosition /
                            (audioRef.current?.duration ?? 1)) *
                          100
                        }%`,
                      }}
                    />
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={duration || 1}
                    value={playbackPosition}
                    onChange={handleSeek}
                    className="absolute inset-0 w-full h-1 opacity-0 cursor-pointer"
                  />
                </div>
              </div>

              {/* Controls */}
              <div className=" flex items-center justify-center space-x-6 mb-10 flex-shrink-0">
                <button
                  className={`w-8 h-8 flex items-center justify-center transition-colors ${
                    isShuffled
                      ? 'text-orange-600 hover:text-orange-700'
                      : 'text-gray-400 hover:text-gray-600'
                  }`}
                  onClick={playerActions.toggleShuffle}
                >
                  <BiShuffle className="w-4 h-4" />
                </button>
                <button
                  className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-gray-900 transition-colors"
                  onClick={playerActions.previousSong}
                >
                  <BsSkipBackward className="w-5 h-5" />
                </button>
                <motion.button
                  className="w-12 h-12 bg-gray-900 hover:bg-gray-800 text-white rounded-full flex items-center justify-center transition-colors"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handlePlayPause}
                >
                  {isPlaying ? (
                    <BiPause className="w-5 h-5" />
                  ) : (
                    <BiPlay className="w-5 h-5 ml-0.5" />
                  )}
                </motion.button>
                <button
                  className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-gray-900 transition-colors"
                  onClick={playerActions.nextSong}
                >
                  <BsSkipForward className="w-5 h-5" />
                </button>
                <button
                  className={`w-8 h-8 flex items-center justify-center transition-colors relative ${
                    repeatMode !== 'off'
                      ? 'text-orange-600 hover:text-orange-700'
                      : 'text-gray-400 hover:text-gray-600'
                  }`}
                  onClick={cycleRepeatMode}
                >
                  <BiRepeat className="w-4 h-4" />
                  {repeatMode === 'one' && (
                    <span className="absolute -top-1 -right-1 text-[9px] bg-orange-600 text-white rounded-full w-3 h-3 flex items-center justify-center font-bold">
                      1
                    </span>
                  )}
                </button>
              </div>
            </div>
            {/* Next Songs */}
            <div className="hidden sm:flex flex-1 min-h-0 mt-12 lg:mt-0 flex-col">
              {' '}
              <div className="flex items-center justify-between mb-4 ">
                <h3 className="text-sm font-medium text-gray-700 tracking-wide ">
                  Queue
                </h3>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="space-y-1 pb-4 hidden sm:block">
                  {!isShuffled &&
                    queue.map((song, i) => (
                      <div
                        key={
                          i +
                          song.metadata.artist.displayName +
                          song.metadata.title
                        }
                        className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors group"
                        onClick={() => playerActions.loadSong(song, true)}
                      >
                        <div className="w-10 h-10 bg-gray-100 rounded-lg flex-shrink-0 overflow-hidden">
                          <img
                            src={song.metadata.album.coverUrl}
                            alt={song.metadata.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate text-gray-900 group-hover:text-gray-700">
                            {song.metadata.title}
                          </p>
                          <p className="text-xs text-gray-500 truncate">
                            {song.metadata.artist.displayName}
                          </p>
                        </div>
                      </div>
                    ))}
                  {isShuffled &&
                    shuffledQueue.map((song, i) => (
                      <div
                        key={
                          i +
                          song.metadata.artist.displayName +
                          song.metadata.title
                        }
                        className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors group"
                        onClick={() => playerActions.loadSong(song, true)}
                      >
                        <div className="w-10 h-10 bg-gray-100 rounded-lg flex-shrink-0 overflow-hidden">
                          <img
                            src={song.metadata.album.coverUrl}
                            alt={song.metadata.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate text-gray-900 group-hover:text-gray-700">
                            {song.metadata.title}
                          </p>
                          <p className="text-xs text-gray-500 truncate">
                            {song.metadata.artist.displayName}
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>

            {/* Volume */}
            <div className="hidden lg:block mt-6 flex-shrink-0">
              <div className="flex items-center space-x-3">
                <button
                  onClick={toggleMute}
                  className="hover:text-gray-600 transition-colors"
                >
                  {getVolumeIcon()}
                </button>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden relative group">
                  <div
                    className="bg-gray-900 h-full rounded-full transition-all duration-100"
                    style={{ width: `${isMuted ? 0 : volume * 100}%` }}
                  />
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Queue Button */}
            <div className="flex items-center  w-full justify-end">
              <button
                className="px-3 py-1.5 flex items-center  gap-2 font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs rounded-lg transition-colors sm:hidden"
                onClick={() => setIsQueueOpen(true)}
              >
                <HiOutlineQueueList className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        // Floating Player
        <motion.div
          key={`${windowSize.width}x${windowSize.height}`}
          drag
          dragMomentum={false}
          dragConstraints={{
            top: 0,
            left: 0,
            right: windowSize.width - 240, // Use dynamic width
            bottom: windowSize.height - 56, // Use dynamic height
          }}
          initial={{
            x: (windowSize.width - 240) / 2,
            y: windowSize.height - 100,
          }}
          className="fixed z-50 cursor-grab active:cursor-grabbing"
          whileDrag={{ scale: 1.05 }}
        >
          <motion.div
            className="bg-white/95 backdrop-blur-md border border-gray-200/50 shadow-lg rounded-full px-4 py-3"
            animate={{ width: 240, height: 56 }}
          >
            <div className="flex items-center justify-between h-full">
              <div className="flex items-center space-x-3">
                <motion.button
                  className="w-10 h-10 bg-gray-900 hover:bg-gray-800 text-white rounded-full flex items-center justify-center transition-colors"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handlePlayPause}
                >
                  {isPlaying ? (
                    <BiPause className="w-4 h-4" />
                  ) : (
                    <BiPlay className="w-4 h-4 ml-0.5" />
                  )}
                </motion.button>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate text-gray-900">
                    {currentTrack.title}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {currentTrack.artist}
                  </p>
                </div>
              </div>
              <motion.button
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={(e) => {
                  e.stopPropagation()
                  setIsExpanded(true)
                }}
              >
                <PiArrowCircleUpRightThin className="w-6 h-6" />
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Queue Drawer for Mobile - Only visible when expanded and on small screens */}
      <AnimatePresence>
        {isQueueOpen && isExpanded && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[60] sm:hidden"
              onClick={() => setIsQueueOpen(false)}
            />

            {/* Drawer */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md rounded-t-2xl z-[70] sm:hidden max-h-[70vh] flex flex-col"
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between p-6 pb-4 border-b border-gray-100">
                <h3 className="text-sm font-medium text-gray-700 tracking-wide uppercase">
                  Queue
                </h3>
                <button
                  className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100/50 rounded-full transition-colors"
                  onClick={() => setIsQueueOpen(false)}
                >
                  <IoClose className="w-5 h-5" />
                </button>
              </div>

              {/* Queue List */}
              <div className="flex-1 overflow-y-auto px-6">
                <div className="space-y-1 pb-6">
                  {isShuffled &&
                    shuffledQueue.map((song, i) => (
                      <div
                        key={
                          i +
                          song.metadata.artist.displayName +
                          song.metadata.title
                        }
                        className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors group"
                        onClick={() => playerActions.loadSong(song, true)}
                      >
                        <div className="w-10 h-10 bg-gray-100 rounded-lg flex-shrink-0 overflow-hidden">
                          <img
                            src={song.metadata.album.coverUrl}
                            alt={song.metadata.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate text-gray-900 group-hover:text-gray-700">
                            {song.metadata.title}
                          </p>
                          <p className="text-sm text-gray-500 truncate">
                            {song.metadata.artist.displayName}
                          </p>
                        </div>
                      </div>
                    ))}
                  {!isShuffled &&
                    queue.map((song, i) => (
                      <div
                        key={
                          i +
                          song.metadata.artist.displayName +
                          song.metadata.title
                        }
                        className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors group"
                        onClick={() => playerActions.loadSong(song, true)}
                      >
                        <div className="w-10 h-10 bg-gray-100 rounded-lg flex-shrink-0 overflow-hidden">
                          <img
                            src={song.metadata.album.coverUrl}
                            alt={song.metadata.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate text-gray-900 group-hover:text-gray-700">
                            {song.metadata.title}
                          </p>
                          <p className="text-sm text-gray-500 truncate">
                            {song.metadata.artist.displayName}
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
