export interface AlbumUploadForm {
  albumName: string
  genre: string
  tags: string
  visibility: 'public' | 'private'
  coverArt: FileList
  collaborators: string[]
  tracks: {
    audioFile: FileList | undefined
    trackName: string
    trackNumber: number
    tags: string
    genre: string
    collaborators: string[]
  }[]
}

export interface UploadProgress {
  song: number
  coverArt: number
  overall: number
  currentStep: string
  tracks: { [key: number]: number }
}
