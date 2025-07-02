import React, { useState } from 'react'
import { PiArrowCircleUpRightThin } from 'react-icons/pi'

import { motion, AnimatePresence } from 'framer-motion'
import { BiPause, BiPlay, BiRepeat, BiShuffle } from 'react-icons/bi'
import { FiMinimize2, FiVolume2 } from 'react-icons/fi'
import { BsSkipBackward, BsSkipForward } from 'react-icons/bs'
import { HiOutlineQueueList } from 'react-icons/hi2'
import { IoClose } from 'react-icons/io5'

interface FloatingPlayerProps {
  isExpanded: boolean
  setIsExpanded: (expanded: boolean) => void
}

export const FloatingPlayer: React.FC<FloatingPlayerProps> = ({
  isExpanded,
  setIsExpanded,
}) => {
  const [isPlaying, setIsPlaying] = useState(true)
  const [isQueueOpen, setIsQueueOpen] = useState(false)

  const currentTrack = {
    title: 'Medicine',
    artist: 'Bring Me The Horizon',
    album: 'POST HUMAN: SURVIVAL HORROR',
    duration: '3:17',
    currentTime: '1:45',
    cover:
      'https://images.unsplash.com/photo-1740487018848-8f2b3e96342e?q=80&w=735&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
  }

  const nextSongs = [
    {
      title: 'Intentions ft. Quavo',
      artist: 'Justin Bieber',
      duration: '3:33',
      cover: 'https://via.placeholder.com/60x60',
    },
    {
      title: 'Happier',
      artist: 'Marshmello, Bastille',
      duration: '3:36',
      cover: 'https://via.placeholder.com/60x60',
    },
    {
      title: 'Takeaway',
      artist: 'The Chainsmokers, ILLENIUM',
      duration: '3:47',
      cover: 'https://via.placeholder.com/60x60',
    },
    {
      title: "It Ain't Me",
      artist: 'Kygo, Selena Gomez',
      duration: '3:40',
      cover: 'https://via.placeholder.com/60x60',
    },
    {
      title: 'Intentions ft. Quavo',
      artist: 'Justin Bieber',
      duration: '3:33',
      cover: 'https://via.placeholder.com/60x60',
    },
    {
      title: 'Happier',
      artist: 'Marshmello, Bastille',
      duration: '3:36',
      cover: 'https://via.placeholder.com/60x60',
    },
    {
      title: 'Takeaway',
      artist: 'The Chainsmokers, ILLENIUM',
      duration: '3:47',
      cover: 'https://via.placeholder.com/60x60',
    },
    {
      title: "It Ain't Me",
      artist: 'Kygo, Selena Gomez',
      duration: '3:40',
      cover: 'https://via.placeholder.com/60x60',
    },
  ]

  if (isExpanded) {
    return (
      <>
        <motion.div
          initial={{ opacity: 0, x: 300 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 300, transition: { duration: 0.08 } }}
          className="w-full sm:w-[350px] h-full bg-white flex flex-col z-50 overflow-hidden rounded-lg"
        >
          {/* Mobile: Full screen player */}
          <div className="flex flex-col h-full sm:hidden p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-8 flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-900">
                Now Playing
              </h2>
              <div className="flex items-center space-x-2">
                <button
                  className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full"
                  onClick={() => setIsExpanded(false)}
                >
                  <FiMinimize2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Album Art - Centered and larger */}
            <div className="flex-1 flex flex-col items-center justify-center px-8">
              <motion.div
                className="w-4/5 max-w-80 aspect-square bg-gradient-to-br rounded-2xl mb-8 overflow-hidden border border-black p-1 shadow-lg"
                whileHover={{ scale: 1.02 }}
              >
                <img
                  src={currentTrack.cover}
                  alt={currentTrack.title}
                  className="w-full h-full object-cover rounded-xl"
                />
              </motion.div>

              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold mb-2 text-gray-900">
                  {currentTrack.title}
                </h3>
                <p className="text-lg text-gray-600 mb-1">
                  {currentTrack.artist}
                </p>
                <p className="text-sm text-gray-500">{currentTrack.album}</p>
              </div>
            </div>

            {/* Progress */}
            <div className="mb-6 flex-shrink-0">
              <div className="flex items-center space-x-3 text-sm text-gray-600 mb-2">
                <span>{currentTrack.currentTime}</span>
                <div className="flex-1 bg-gray-200 rounded-full h-1">
                  <motion.div
                    className="bg-orange-500 rounded-full h-1"
                    initial={{ width: '0%' }}
                    animate={{ width: '55%' }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
                <span>{currentTrack.duration}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center space-x-4 mb-4 flex-shrink-0">
              <button className="text-gray-500 hover:text-orange-600 p-2">
                <BiShuffle className="w-6 h-6" />
              </button>
              <button className="text-gray-700 hover:text-orange-600 p-2">
                <BsSkipBackward className="w-7 h-7" />
              </button>
              <motion.button
                className=" w-14 h-14 sm:w-16 sm:h-16 text-white bg-orange-600 hover:bg-orange-700 rounded-full flex items-center justify-center shadow-lg"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsPlaying(!isPlaying)}
              >
                {isPlaying ? (
                  <BiPause className="w-8 h-8" />
                ) : (
                  <BiPlay className="w-8 h-8 ml-1" />
                )}
              </motion.button>
              <button className="text-gray-700 hover:text-orange-600 p-2">
                <BsSkipForward className="w-7 h-7" />
              </button>
              <button className="text-gray-500 hover:text-orange-600 p-2">
                <BiRepeat className="w-6 h-6" />
              </button>
            </div>

            <div className="flex items-center justify-end mb-4">
              <button
                className="w-10 h-10 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-full"
                onClick={() => setIsQueueOpen(true)}
              >
                <HiOutlineQueueList className="w-5 h-5" />
              </button>
            </div>

            {/* Volume */}
            <div className="hidden sm:block p-4 bg-gray-50 rounded-xl border border-gray-100 flex-shrink-0">
              <div className="flex items-center space-x-3">
                <FiVolume2 className="w-5 h-5 text-gray-500" />
                <div className="flex-1 bg-gray-200 rounded-full h-1">
                  <div className="bg-orange-500 rounded-full h-1 w-3/4"></div>
                </div>
              </div>
            </div>
          </div>

          {/* Desktop/Tablet: Original layout */}
          <div className="hidden sm:flex p-6 flex-col h-full min-h-0">
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
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <motion.div
                    className="bg-orange-500 rounded-full h-2"
                    initial={{ width: '0%' }}
                    animate={{ width: '55%' }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
                <span>{currentTrack.duration}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center space-x-4 mb-4 p-2 flex-shrink-0">
              <button className="text-gray-500 hover:text-orange-600 hover:bg-orange-50">
                <BiShuffle className="w-5 h-5" />
              </button>
              <button className="text-gray-700 hover:text-orange-600 hover:bg-orange-50">
                <BsSkipBackward className="w-6 h-6" />
              </button>
              <motion.button
                className="w-12 h-12 text-orange-700 hover:bg-orange-600 rounded-full flex items-center justify-center border border-orange-600"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsPlaying(!isPlaying)}
              >
                {isPlaying ? (
                  <BiPause className="w-6 h-6" />
                ) : (
                  <BiPlay className="w-6 h-6 ml-1" />
                )}
              </motion.button>
              <button className="text-gray-700 hover:text-orange-600 hover:bg-orange-50">
                <BsSkipForward className="w-6 h-6" />
              </button>
              <button className="text-gray-500 hover:text-orange-600 hover:bg-orange-50">
                <BiRepeat className="w-5 h-5" />
              </button>
            </div>

            {/* Next Songs */}
            <div className="flex-1 min-h-0 flex flex-col">
              <h3 className="text-sm font-semibold mb-4 text-gray-700 pb-2 border-b border-gray-100 flex-shrink-0">
                Next Songs
              </h3>
              <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
                <div className="space-y-2 pb-4">
                  {nextSongs.map((song, i) => (
                    <div
                      key={i + song.artist + song.title}
                      className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer border border-transparent hover:border-gray-200"
                    >
                      <div className="w-10 h-10 bg-gray-200 rounded-lg flex-shrink-0 overflow-hidden">
                        <img
                          src={song.cover}
                          alt={song.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate text-gray-900">
                          {song.title}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {song.artist}
                        </p>
                      </div>
                      <span className="text-xs text-gray-400">
                        {song.duration}
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
        </motion.div>

        {/* Queue Drawer for Mobile */}
        <AnimatePresence>
          {isQueueOpen && (
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
                    {nextSongs.map((song, i) => (
                      <div
                        key={i + song.artist + song.title}
                        className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer"
                      >
                        <div className="w-12 h-12 bg-gray-200 rounded-lg flex-shrink-0 overflow-hidden">
                          <img
                            src={song.cover}
                            alt={song.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate text-gray-900">
                            {song.title}
                          </p>
                          <p className="text-sm text-gray-500 truncate">
                            {song.artist}
                          </p>
                        </div>
                        <span className="text-sm text-gray-400">
                          {song.duration}
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

  // Collapsed state remains the same
  return (
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
              onClick={(e) => {
                e.stopPropagation()
                setIsPlaying(!isPlaying)
              }}
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
          <div className="flex items-center">
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
        </div>
      </motion.div>
    </motion.div>
  )
}
