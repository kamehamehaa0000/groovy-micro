import { useState } from 'react'
import { SingleUpload } from '../components/upload/SingleUpload'
import { AlbumUpload } from '../components/upload/AlbumUpload'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

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

  const isUploading = isSingleBeingUploaded || isAlbumBeingUploaded

  return (
    <div className="relative flex flex-col items-center justify-center w-full ">
      <div className="flex flex-col items-center justify-center rounded-lg p-4 w-full max-w-2xl">
        <h1 className="text-2xl font-semibold my-8">Upload Music to Groovy</h1>
        {/* Show upload progress if uploading, otherwise show tabs */}
        {isUploading ? (
          <UploadInProcessLoading uploadProgress={uploadProgress} />
        ) : (
          <Tabs
            value={type}
            onValueChange={(value) => setType(value as 'single' | 'album')}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="single">Single</TabsTrigger>
              <TabsTrigger value="album">Album</TabsTrigger>
            </TabsList>

            <TabsContent value="single" className="w-full ">
              <SingleUpload
                setIsSingleBeingUploaded={setIsSingleBeingUploaded}
                setUploadProgress={setUploadProgress}
              />
            </TabsContent>

            <TabsContent value="album" className="w-full ">
              <AlbumUpload
                setIsAlbumBeingUploaded={setIsAlbumBeingUploaded}
                setUploadProgress={setUploadProgress}
              />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  )
}

export default Upload

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
          <h3 className="text-lg font-semibold text-stone-700">
            Upload in Progress
          </h3>

          {uploadProgress && (
            <>
              <p className="text-sm text-stone-600 font-medium">
                {uploadProgress.currentStep}
              </p>

              {/* Overall Progress Bar */}
              <div className="w-full bg-stone-200 rounded-full h-3 mt-4">
                <div
                  className="bg-red-600 h-3 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${uploadProgress.overall}%` }}
                ></div>
              </div>
              <p className="text-xs text-stone-500">
                Overall Progress: {Math.round(uploadProgress.overall)}%
              </p>

              {/* Single song progress */}
              {uploadProgress.song > 0 && (
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-stone-600 mb-1">
                    <span>Song Upload</span>
                    <span>{uploadProgress.song}%</span>
                  </div>
                  <div className="w-full bg-stone-200 rounded-full h-2">
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
                  <div className="flex justify-between text-xs text-stone-600 mb-1">
                    <span>Cover Art Upload</span>
                    <span>{uploadProgress.coverArt}%</span>
                  </div>
                  <div className="w-full bg-stone-200 rounded-full h-2">
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
                          <div className="flex justify-between text-xs text-stone-600 mb-1">
                            <span>Track {parseInt(trackIndex) + 1} Upload</span>
                            <span>{progress}%</span>
                          </div>
                          <div className="w-full bg-stone-200 rounded-full h-2">
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

          <p className="text-sm text-stone-600">
            Please do not close or refresh the window
          </p>
          <p className="text-xs text-stone-500">
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
