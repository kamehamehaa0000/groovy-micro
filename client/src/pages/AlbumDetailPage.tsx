import React, { useState } from 'react'
import { useParams } from 'react-router'
import { SongCompactCardB } from '../components/cards/SongCompactCardB'
import type { Song } from '../store/player-store'

const AlbumDetailPage = () => {
  const param = useParams<{ id: string }>()
  const albumId = param.id
  const [isLiked, setIsLiked] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  return (
    <div className="flex-1 bg-zinc-50 h-full">
      <div className="flex flex-col lg:flex-row h-full  px-4 sm:px-6 py-4">
        {/* Left Panel - Album Art & Controls */}
        <div className="lg:w-96 md:border-r  border-gray-200 p-4 sm:p-6">
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

            {/* Quick Info */}
            <div className="text-md text-gray-600 border-t border-gray-300 pt-4">
              <p className="text-xl lg:text-2xl font-medium text-gray-900">
                Yours Truly
              </p>
              <p>kr$na</p>
              <p className="text-sm text-gray-500 mt-1">Pop • 2024</p>
            </div>
          </div>
        </div>

        {/*Center panel - Tracks */}
        <div className="flex-1 py-4 sm:p-6 lg:p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Tracks</h2>
          <div className="max-w-3xl">
            {demoSongs
              .sort((a, b) => a.metadata.trackNumber - b.metadata.trackNumber)
              .map((song: any, index) => (
                <SongCompactCardB song={song} key={index} />
              ))}
            {demoSongs
              .sort((a, b) => a.metadata.trackNumber - b.metadata.trackNumber)
              .map((song: any, index) => (
                <SongCompactCardB song={song} key={index} />
              ))}
            {demoSongs
              .sort((a, b) => a.metadata.trackNumber - b.metadata.trackNumber)
              .map((song: any, index) => (
                <SongCompactCardB song={song} key={index} />
              ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default AlbumDetailPage

const demoSongs = [
  {
    metadata: {
      title: 'Hello',
      artist: {
        _id: '686bf307348f6c0caa88475a',
        displayName: 'Aayush Gupta',
      },
      album: {
        _id: 'e13b1b25-b10f-444b-8555-a4e558c6fe4f',
        title: 'Yours Truly',
        coverUrl:
          'https://pub-29299532478b4f1a9ac588241a50952a.r2.dev/albums/e13b1b25-b10f-444b-8555-a4e558c6fe4f/cassette-tape.png',
      },
      genre: 'Pop',
      collaborators: [],
      tags: ['hajimashite', 'jpop'],
      trackNumber: 2,
    },
    _id: '725d4970-2bf2-4ce0-b030-0af9cd73d85e',
    originalUrl:
      'https://pub-29299532478b4f1a9ac588241a50952a.r2.dev/songs/725d4970-2bf2-4ce0-b030-0af9cd73d85e/ball.mp3',
    coverArtUrl:
      'https://pub-29299532478b4f1a9ac588241a50952a.r2.dev/albums/e13b1b25-b10f-444b-8555-a4e558c6fe4f/cassette-tape.png',
    status: 'completed',
    visibility: 'public',
    createdAt: '2025-06-30T15:23:28.342Z',
    updatedAt: '2025-06-30T15:23:35.280Z',
    __v: 0,
    hlsUrl:
      'https://pub-29299532478b4f1a9ac588241a50952a.r2.dev/songs/725d4970-2bf2-4ce0-b030-0af9cd73d85e/hls/playlist.m3u8',
  },
  {
    metadata: {
      title: 'KKBN',
      artist: {
        _id: '686bf307348f6c0caa88475a',
        displayName: 'Aayush Gupta',
      },
      album: {
        _id: 'e13b1b25-b10f-444b-8555-a4e558c6fe4f',
        title: 'Yours Truly',
        coverUrl:
          'https://pub-29299532478b4f1a9ac588241a50952a.r2.dev/albums/e13b1b25-b10f-444b-8555-a4e558c6fe4f/cassette-tape.png',
      },
      genre: 'Pop',
      collaborators: [],
      tags: ['ENERGY PACK', 'JIM'],
      trackNumber: 1,
    },
    _id: '5fb93105-3328-48d1-a09d-e2ad5a5ede39',
    originalUrl:
      'https://pub-29299532478b4f1a9ac588241a50952a.r2.dev/songs/5fb93105-3328-48d1-a09d-e2ad5a5ede39/ball.mp3',
    coverArtUrl:
      'https://pub-29299532478b4f1a9ac588241a50952a.r2.dev/albums/e13b1b25-b10f-444b-8555-a4e558c6fe4f/cassette-tape.png',
    status: 'completed',
    visibility: 'public',
    createdAt: '2025-06-30T15:23:28.342Z',
    updatedAt: '2025-06-30T15:23:55.931Z',
    __v: 0,
    hlsUrl:
      'https://pub-29299532478b4f1a9ac588241a50952a.r2.dev/songs/5fb93105-3328-48d1-a09d-e2ad5a5ede39/hls/playlist.m3u8',
  },
]
