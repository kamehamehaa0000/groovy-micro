export interface Song {
  isLikedByCurrentUser?: boolean
  coverArtUrl?: string
  likedBy?: number
  _id: string
  hlsUrl: string
  originalUrl: string
  metadata: {
    title: string
    artist: {
      _id: string
      displayName: string
    }
    album: {
      _id: string
      title: string
      coverUrl?: string
    }
    genre: string
    trackNumber: number
    likedBy: string[]
  }
}
export type RepeatMode = 'off' | 'all' | 'one'
