import React, { useState } from 'react'
import { useParams } from 'react-router'
import { SongCompactCardB } from '../components/cards/SongCompactCardB'
import CompactComments from '../components/comments/CompactComments'

const SongDetailPage = () => {
  const param = useParams<{ id: string }>()
  const songId = param.id
  const [isLiked, setIsLiked] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  return (
    <div className="flex-1 bg-white  md:h-full">
      <div className="flex flex-col lg:flex-row h-full">
        {/* Left Panel - Album Art & Controls */}
        <div className=" min-h-full lg:w-1/4 border-r border-gray-200 p-4 sm:p-6">
          <div className="sticky top-6">
            {/* Album Art */}
            <div className="w-full aspect-square rounded-lg mb-6 flex items-center justify-center">
              <div className="w-full h-full  bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
                <img
                  src={`https://picsum.photos/200/200?random=${songId}`}
                  alt="Album Art"
                  className="w-full h-full object-cover rounded-lg"
                />
              </div>
            </div>

            {/* Controls */}
            <div className="flex w-full  items-center justify-between mb-6">
              <div className="flex  w-full items-center space-x-2">
                <SongCompactCardB
                  song={{
                    _id: 'adsfasdf',
                    originalUrl: 'https://example.com/song.mp3',
                    hlsUrl: 'https://picsum.photos/200/200?random=song',
                    metadata: {
                      artist: {
                        _id: 'aayush-gupta',
                        displayName: 'Aayush Gupta',
                      },
                      title: 'Hello',
                      album: {
                        _id: 'singles-collection',
                        title: 'Singles Collection',
                        coverUrl: 'https://picsum.photos/200/200?random=album',
                      },
                      genre: 'Pop',
                      coverUrl: 'https://picsum.photos/200/200?random=song',
                      trackNumber: 1,
                    },
                  }}
                />
              </div>
            </div>

            {/* Quick Info
            <div className="text-sm text-gray-600">
              <p className="font-medium text-gray-900">Hello</p>
              <p>Aayush Gupta</p>
              <p className="text-xs text-gray-500 mt-1">Pop • 2024</p>
            </div> */}
          </div>
        </div>

        {/* Center Panel - Details */}
        <div className="flex-1 p-4 sm:p-6 lg:p-8 min-h-full ">
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

        {/* Right Panel - Album Art & Controls */}
        <div className=" h-full lg:w-1/3 border-l border-gray-200 overflow-y-scroll ">
          <CompactComments />
        </div>
      </div>
    </div>
  )
}

export default SongDetailPage
