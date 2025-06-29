import { useState } from 'react'

import { SingleUpload } from '../components/upload/SingleUpload'
import { AlbumUpload } from '../components/upload/AlbumUpload'
import { Link } from 'react-router'

const Upload = () => {
  const [type, setType] = useState<'single' | 'album'>('single')
  const [isSingleBeingUploaded, setIsSingleBeingUploaded] = useState(false)
  const [isAlbumBeingUploaded, setIsAlbumBeingUploaded] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({
    song: 10,
    coverArt: 10,
    overall: 20,
    currentStep: '',
    tracks: {} as { [key: number]: number },
  })
  const UploadComponent =
    type === 'single' ? (
      <SingleUpload
        setIsSingleBeingUploaded={setIsSingleBeingUploaded}
        setUploadProgress={setUploadProgress}
      />
    ) : (
      <AlbumUpload
        setIsAlbumBeingUploaded={setIsAlbumBeingUploaded}
        setUploadProgress={setUploadProgress}
      />
    )
  return (
    <div className="relative w-screen min-h-screen flex flex-col items-center justify-center have-bg">
      <div className="mt-6 text-center">
        <Link to="/" className="text-sm text-orange-700 hover:text-orange-500">
          ← Back to home
        </Link>
      </div>
      <div className=" flex flex-col items-center justify-center  rounded-lg p-4 w-full max-w-2xl">
        <h1 className="text-2xl font-semibold my-8">Upload Music to Groovy</h1>
        {/* Toggle between single and album upload */}
        <UploadTypeToggle
          type={type}
          setType={setType}
          isSingleBeingUploaded={isSingleBeingUploaded}
          isAlbumBeingUploaded={isAlbumBeingUploaded}
        />
        {/* Render content based on the selected type */}
        <div className="w-full ">
          {isAlbumBeingUploaded || isSingleBeingUploaded ? (
            <UploadInProcessLoading uploadProgress={uploadProgress} />
          ) : (
            UploadComponent
          )}
        </div>
      </div>
    </div>
  )
}

export default Upload

const UploadTypeToggle = ({
  type,
  setType,
  isSingleBeingUploaded,
  isAlbumBeingUploaded,
}: {
  type: 'single' | 'album'
  setType: (type: 'single' | 'album') => void
  isSingleBeingUploaded: boolean
  isAlbumBeingUploaded: boolean
}) => {
  return (
    <div className="w-full bg-zinc-100 relative flex my-4  rounded-md px-1 py-1 border">
      <div
        className={`absolute border border-gray-500 top-1 bottom-1 bg-white  rounded-md transition-all duration-300 ease-in-out ${
          type === 'single'
            ? 'left-1 right-1/2 mr-0.5'
            : 'left-1/2 right-1 ml-0.5'
        }`}
      />
      <button
        onClick={() => setType('single')}
        disabled={isSingleBeingUploaded || isAlbumBeingUploaded}
        className={`disabled:cursor-not-allowed relative z-10 flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors duration-200 ${
          type === 'single'
            ? 'text-red-600'
            : 'text-gray-600 hover:text-gray-900'
        }`}
      >
        Single
      </button>
      <button
        onClick={() => setType('album')}
        disabled={isSingleBeingUploaded || isAlbumBeingUploaded}
        className={`disabled:cursor-not-allowed relative z-10 flex-1 px-4 py-2 text-sm font-medium rounded-2xl transition-colors duration-200 ${
          type === 'album'
            ? 'text-red-600'
            : 'text-gray-600 hover:text-gray-900'
        }`}
      >
        Album
      </button>
    </div>
  )
}

const UploadInProcessLoading = ({
  uploadProgress,
}: {
  uploadProgress?: {
    song: number
    coverArt: number
    overall: number
    currentStep: string
    tracks?: { [key: number]: number }
  }
}) => {
  return (
    <div className="w-full space-y-4 p-6 bg-white rounded-lg border">
      {/* Loading indicator and message */}
      <div className="flex flex-col items-center justify-center space-y-4 py-8">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-b-2 border-r-1 border-red-600"></div>

        <div className="text-center space-y-2 w-full max-w-md">
          <h3 className="text-lg font-semibold text-gray-700">
            Upload in Progress
          </h3>

          {uploadProgress && (
            <>
              <p className="text-sm text-gray-600 font-medium">
                {uploadProgress.currentStep}
              </p>

              {/* Overall Progress Bar */}
              <div className="w-full bg-gray-200 rounded-full h-3 mt-4">
                <div
                  className="bg-red-600 h-3 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${uploadProgress.overall}%` }}
                ></div>
              </div>
              <p className="text-xs text-gray-500">
                Overall Progress: {Math.round(uploadProgress.overall)}%
              </p>

              {/* Single song progress */}
              {uploadProgress.song > 0 && (
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-gray-600 mb-1">
                    <span>Song Upload</span>
                    <span>{uploadProgress.song}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress.song}%` }}
                    ></div>
                  </div>
                </div>
              )}

              {/* Cover art progress */}
              {uploadProgress.coverArt > 0 && (
                <div className="mt-2">
                  <div className="flex justify-between text-xs text-gray-600 mb-1">
                    <span>Cover Art Upload</span>
                    <span>{uploadProgress.coverArt}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress.coverArt}%` }}
                    ></div>
                  </div>
                </div>
              )}

              {/* Individual track progress for albums */}
              {uploadProgress.tracks &&
                Object.keys(uploadProgress.tracks).length > 0 && (
                  <div className="mt-3 space-y-2">
                    {Object.entries(uploadProgress.tracks).map(
                      ([trackIndex, progress]) => (
                        <div key={trackIndex}>
                          <div className="flex justify-between text-xs text-gray-600 mb-1">
                            <span>Track {parseInt(trackIndex) + 1} Upload</span>
                            <span>{progress}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${progress}%` }}
                            ></div>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}
            </>
          )}

          <p className="text-sm text-gray-600">
            Please do not close or refresh the window
          </p>
          <p className="text-xs text-gray-500">
            This may take a few minutes depending on file size
          </p>
        </div>
      </div>
    </div>
  )
}
export const genres: string[] = [
  'Pop',
  'Rock',
  'Hip Hop / Rap',
  'Electronic / EDM',
  'R&B / Soul',
  'Jazz',
  'Classical',
  'Country',
  'Metal',
  'Reggae',
  'Folk / Acoustic',
  'Blues',
  'Ambient / Chill',
  'Experimental',
  'Soundtrack / Score',
  'World Music',
]
