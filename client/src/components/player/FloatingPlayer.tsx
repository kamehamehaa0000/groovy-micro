import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { PiArrowCircleUpRightThin } from 'react-icons/pi'
import { motion, AnimatePresence } from 'framer-motion'
import { BiPause, BiPlay, BiRepeat, BiShuffle } from 'react-icons/bi'
import { FiMinimize2, FiVolume2 } from 'react-icons/fi'
import { BsSkipBackward, BsSkipForward } from 'react-icons/bs'
import { IoClose } from 'react-icons/io5'
import { usePlayerStore } from '../../store/player-store'
import { useAudioPlayer } from '../../hooks/useAudioPlayer'
import useJamStore from '../../store/jam-store'
import { useAuthStore } from '../../store/auth-store'

export const FloatingPlayer: React.FC = () => {
  const [isQueueOpen, setIsQueueOpen] = useState(false)
  const {
    currentSong,
    isPlaying,
    playbackPosition,
    isLoading,
    queue,
    isExpanded,
    forceSeekToZero,

    actions: { setIsExpanded, clearForceSeekToZero, ...playerActions },
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

  const handleEnded = useCallback(() => {
    playerActions.nextSong()
  }, [playerActions])

  const handleError = useCallback((error: string) => {
    console.error(error)
  }, [])

  const { play, pause, seek, audioRef, canPlay } = useAudioPlayer({
    hlsUrl: currentSong?.hlsUrl ?? '',
    fallbackUrl: currentSong?.originalUrl ?? '',
    onTimeUpdate: handleTimeUpdate,
    onEnded: handleEnded,
    onError: handleError,
  })

  useEffect(() => {
    console.log(
      'FloatingPlayer useEffect: isPlaying=',
      isPlaying,
      'canPlay=',
      canPlay
    )
    if (isPlaying && canPlay) {
      play()
    } else {
      pause()
    }
  }, [isPlaying, canPlay, play, pause])

  useEffect(() => {
    if (forceSeekToZero) {
      seek(0)
      clearForceSeekToZero()
    }
  }, [forceSeekToZero, seek, clearForceSeekToZero])

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

  if (!currentSong) {
    return null // Don't render the player if no song is loaded
  }

  return (
    <>
      <audio ref={audioRef} />
      {isExpanded ? (
        <div className="fixed top-0 right-0 w-full sm:w-[350px] h-full bg-white flex flex-col z-50 overflow-hidden rounded-lg">
          {/* Expanded Player Content (Responsive) */}
          <div className="flex p-6 flex-col h-full min-h-0">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 pb-4 flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-900">
                Now Playing
              </h2>
              <button
                className="w-8 h-8 p-0 text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                onClick={() => setIsExpanded(false)}
              >
                <FiMinimize2 className="w-4 h-4" />
              </button>
            </div>

            {/* Album Art */}
            <div className="flex flex-col items-center mb-6 flex-shrink-0">
              <motion.div
                className="w-3/5 aspect-square bg-gradient-to-br rounded mb-4 overflow-hidden border border-black p-1"
                whileHover={{ scale: 1.02 }}
              >
                <img
                  src={currentTrack.cover}
                  alt={currentTrack.title}
                  className="w-full h-full object-cover"
                />
              </motion.div>

              <div className="text-center">
                <h3 className="text-xl font-bold mb-1 text-gray-900">
                  {currentTrack.title}
                </h3>
                <p className="text-sm text-gray-500">{currentTrack.album}</p>
                <p className="text-sm text-gray-600 mb-2">
                  {currentTrack.artist}
                </p>
              </div>
            </div>

            {/* Progress */}
            <div className="mb-4 flex-shrink-0">
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <span>{currentTrack.currentTime}</span>
                <input
                  type="range"
                  min="0"
                  max={audioRef.current?.duration ?? 0}
                  value={playbackPosition}
                  onChange={handleSeek}
                  className="flex-1"
                />
                <span>{currentTrack.duration}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center space-x-4 mb-4 p-2 flex-shrink-0">
              <button className="text-gray-500 hover:text-orange-600 hover:bg-orange-50">
                <BiShuffle className="w-5 h-5" />
              </button>
              <button
                className="text-gray-700 hover:text-orange-600 hover:bg-orange-50"
                onClick={playerActions.previousSong}
              >
                <BsSkipBackward className="w-6 h-6" />
              </button>
              <motion.button
                className="w-12 h-12 text-orange-700 hover:bg-orange-600 rounded-full flex items-center justify-center border border-orange-600"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={handlePlayPause}
              >
                {isPlaying ? (
                  <BiPause className="w-6 h-6" />
                ) : (
                  <BiPlay className="w-6 h-6 ml-1" />
                )}
              </motion.button>
              <button
                className="text-gray-700 hover:text-orange-600 hover:bg-orange-50"
                onClick={playerActions.nextSong}
              >
                <BsSkipForward className="w-6 h-6" />
              </button>
              <button className="text-gray-500 hover:text-orange-600 hover:bg-orange-50">
                <BiRepeat className="w-5 h-5" />
              </button>
            </div>

            {/* Next Songs */}
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold mb-4 text-gray-700 pb-2 border-b border-gray-100 flex-shrink-0">
                  Next Songs
                </h3>
                <button
                  className="px-2 py-1 mb-4 bg-purple-600 text-white rounded-full"
                  onClick={handleStartJam}
                >
                  Start Jam
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
                <div className="space-y-2 pb-4">
                  {queue.map((song, i) => (
                    <div
                      key={
                        i +
                        song.metadata.artist.displayName +
                        song.metadata.title
                      }
                      className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer border border-transparent hover:border-gray-200"
                      onClick={() => playerActions.loadSong(song, true)}
                    >
                      <div className="w-10 h-10 bg-gray-200 rounded-lg flex-shrink-0 overflow-hidden">
                        <img
                          src={song.metadata.album.coverUrl}
                          alt={song.metadata.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate text-gray-900">
                          {song.metadata.title}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {song.metadata.artist.displayName}
                        </p>
                      </div>
                      <span className="text-xs text-gray-400">
                        {/* {formatTime(song.duration)} */}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Volume */}
            <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-100 flex-shrink-0">
              <div className="flex items-center space-x-3">
                <FiVolume2 className="w-4 h-4 text-gray-500" />
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div className="bg-orange-500 rounded-full h-2 w-3/4"></div>
                </div>
              </div>
            </div>
          </div>

          <div></div>
        </div>
      ) : (
        <motion.div
          drag
          dragMomentum={false}
          dragConstraints={{
            top: 0,
            left: 0,
            right: typeof window !== 'undefined' ? window.innerWidth - 200 : 0,
            bottom: typeof window !== 'undefined' ? window.innerHeight - 60 : 0,
          }}
          initial={{
            x: 20,
            y: typeof window !== 'undefined' ? window.innerHeight - 100 : 500,
          }}
          className="fixed z-50 cursor-grab active:cursor-grabbing border border-orange-600 rounded-full"
          whileDrag={{ scale: 1.1 }}
        >
          <motion.div
            className="bg-white border border-gray-200 text-gray-900 shadow-lg rounded-full px-2 py-3"
            animate={{ width: 220, height: 50 }}
          >
            <div className="flex items-center justify-between h-full">
              <div className="flex items-center space-x-2">
                <motion.button
                  className="w-9 h-9 bg-orange-50 hover:bg-orange-100 rounded-full flex items-center justify-center border border-orange-200"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handlePlayPause}
                >
                  {isPlaying ? (
                    <BiPause className="h-10 w-10 text-orange-600" />
                  ) : (
                    <BiPlay className="h-10 w-10 ml-0.5 text-orange-600" />
                  )}
                </motion.button>
                <div className="min-w-0">
                  <p className="text-xs text-left font-medium truncate">
                    {currentTrack.title}
                  </p>
                </div>
              </div>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={(e) => {
                  e.stopPropagation()
                  setIsExpanded(true)
                }}
              >
                <PiArrowCircleUpRightThin className="text-4xl font-extralight text-orange-500" />
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
              className="fixed inset-0 bg-black/50 z-[60] sm:hidden"
              onClick={() => setIsQueueOpen(false)}
            />

            {/* Drawer */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl z-[70] sm:hidden max-h-[70vh] flex flex-col"
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between p-6 pb-4 border-b border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900">Queue</h3>
                <button
                  className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full"
                  onClick={() => setIsQueueOpen(false)}
                >
                  <IoClose className="w-5 h-5" />
                </button>
              </div>

              {/* Queue List */}
              <div className="flex-1 overflow-y-auto px-6">
                <div className="space-y-1 pb-6">
                  {queue.map((song, i) => (
                    <div
                      key={
                        i +
                        song.metadata.artist.displayName +
                        song.metadata.title
                      }
                      className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer"
                      onClick={() => playerActions.loadSong(song, true)}
                    >
                      <div className="w-10 h-10 bg-gray-200 rounded-lg flex-shrink-0 overflow-hidden">
                        <img
                          src={song.metadata.album.coverUrl}
                          alt={song.metadata.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate text-gray-900">
                          {song.metadata.title}
                        </p>
                        <p className="text-sm text-gray-500 truncate">
                          {song.metadata.artist.displayName}
                        </p>
                      </div>
                      <span className="text-sm text-gray-400">
                        {/* {formatTime(song.duration)} */}
                      </span>
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
