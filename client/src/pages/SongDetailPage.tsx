import React, { useState } from 'react'
import { useParams } from 'react-router'

const SongDetailPage = () => {
  const param = useParams<{ id: string }>()
  const songId = param.id
  const [isLiked, setIsLiked] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  return (
    <div className="flex-1 bg-white min-h-screen">
      {/* Header */}
      <div className=" border-gray-200 px-4 sm:px-6 py-4"></div>

      <div className="flex flex-col lg:flex-row">
        {/* Left Panel - Album Art & Controls */}
        <div className="lg:w-96 border-r border-gray-200 p-4 sm:p-6">
          <div className="sticky top-6">
            {/* Album Art */}
            <div className="w-full aspect-square bg-gradient-to-br from-orange-400 to-red-500 rounded-lg mb-6 flex items-center justify-center">
              <div className="w-16 h-16 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-white"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                </svg>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="bg-gray-900 text-white p-3 rounded-full hover:bg-gray-800 transition-colors"
              >
                {isPlaying ? (
                  <svg
                    className="w-6 h-6"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                  </svg>
                ) : (
                  <svg
                    className="w-6 h-6"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setIsLiked(!isLiked)}
                  className={`p-3 rounded-full transition-colors ${
                    isLiked
                      ? 'text-red-500 bg-red-50'
                      : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  <svg
                    className="w-5 h-5"
                    fill={isLiked ? 'currentColor' : 'none'}
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                    />
                  </svg>
                </button>
                <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z"
                    />
                  </svg>
                </button>
                <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-2">
              <div className="w-full bg-gray-200 rounded-full h-1">
                <div className="bg-gray-900 h-1 rounded-full w-1/3"></div>
              </div>
            </div>
            <div className="flex justify-between text-xs text-gray-500 mb-6">
              <span>1:23</span>
              <span>3:42</span>
            </div>

            {/* Quick Info */}
            <div className="text-sm text-gray-600">
              <p className="font-medium text-gray-900">Hello</p>
              <p>Aayush Gupta</p>
              <p className="text-xs text-gray-500 mt-1">Pop • 2024</p>
            </div>
          </div>
        </div>

        {/* Right Panel - Details */}
        <div className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="max-w-3xl">
            {/* Song Title */}
            <div className="mb-8">
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">
                Hello
              </h1>
              <p className="text-xl text-gray-600 mb-1">Aayush Gupta</p>
              <p className="text-sm text-gray-500 uppercase tracking-wide">
                Pop • 2024
              </p>
            </div>

            {/* Track Information */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Track Information
              </h2>
              <div className="bg-gray-50 rounded-lg p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
                  <div>
                    <dt className="text-gray-500 mb-1">Duration</dt>
                    <dd className="text-gray-900 font-medium">3:42</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500 mb-1">Release Date</dt>
                    <dd className="text-gray-900 font-medium">
                      March 15, 2024
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500 mb-1">Album</dt>
                    <dd className="text-gray-900 font-medium">
                      Singles Collection
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500 mb-1">Label</dt>
                    <dd className="text-gray-900 font-medium">Independent</dd>
                  </div>
                </div>
              </div>
            </section>

            {/* Credits */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Credits
              </h2>
              <div className="bg-gray-50 rounded-lg p-6">
                <div className="space-y-4 text-sm">
                  <div className="flex flex-col sm:flex-row sm:justify-between">
                    <dt className="text-gray-500 mb-1 sm:mb-0">Artist</dt>
                    <dd className="text-gray-900 font-medium">Aayush Gupta</dd>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between">
                    <dt className="text-gray-500 mb-1 sm:mb-0">Producer</dt>
                    <dd className="text-gray-900 font-medium">Aayush Gupta</dd>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between">
                    <dt className="text-gray-500 mb-1 sm:mb-0">Songwriter</dt>
                    <dd className="text-gray-900 font-medium">Aayush Gupta</dd>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SongDetailPage
