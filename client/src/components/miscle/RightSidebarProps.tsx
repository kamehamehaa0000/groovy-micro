import React from 'react'
import { BsX } from 'react-icons/bs'
import { FiExternalLink, FiHeart, FiMoreHorizontal } from 'react-icons/fi'

interface RightSidebarProps {
  onClose: () => void
}

export const RightSidebar: React.FC<RightSidebarProps> = ({ onClose }) => {
  const queue = [
    {
      title: 'Intentions ft. Quavo',
      artist: 'Justin Bieber',
      duration: '3:33',
    },
    { title: 'Happier', artist: 'Marshmello, Bastille', duration: '3:36' },
    {
      title: 'Takeaway',
      artist: 'The Chainsmokers, ILLENIUM',
      duration: '3:47',
    },
    { title: "It Ain't Me", artist: 'Kygo, Selena Gomez', duration: '3:40' },
  ]

  return (
    <div className="w-80 h-full bg-gray-900 border-l border-gray-800 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">Queue</h2>
        <button
          className="lg:hidden w-8 h-8 p-0 text-gray-400 hover:text-white"
          onClick={onClose}
        >
          <BsX className="w-4 h-4" />
        </button>
      </div>

      {/* Current Track */}
      <div className="mb-6">
        <h3 className="text-sm font-medium text-gray-400 mb-3">Now Playing</h3>
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center space-x-3 mb-3">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex-shrink-0"></div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">Medicine</p>
              <p className="text-sm text-gray-400 truncate">
                Bring Me The Horizon
              </p>
            </div>
            <button className="w-8 h-8 p-0 text-gray-400 hover:text-white">
              <FiExternalLink className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <button className="w-8 h-8 p-0 text-gray-400 hover:text-red-500">
              <FiHeart className="w-4 h-4" />
            </button>
            <button className="w-8 h-8 p-0 text-gray-400 hover:text-white">
              <FiMoreHorizontal className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Next Up */}
      <div>
        <h3 className="text-sm font-medium text-gray-400 mb-3">Next Up</h3>
        <div className="space-y-2">
          {queue.map((song, i) => (
            <div
              key={i}
              className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-800 cursor-pointer group"
            >
              <div className="w-10 h-10 bg-gray-700 rounded-lg flex-shrink-0"></div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate group-hover:text-white">
                  {song.title}
                </p>
                <p className="text-xs text-gray-400 truncate">{song.artist}</p>
              </div>
              <span className="text-xs text-gray-500">{song.duration}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
