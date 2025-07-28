export interface Song {
  streamCount?: number | 'N/A'
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

export interface Album {
  _id: string
  title: string
  coverUrl: string
  artist: {
    _id: string
    displayName: string
  }
  updatedAt: string
  likedBy?: string[]
  isLikedByCurrentUser?: boolean
  streamCount?: number
  songs: Song[]
  genre: string
  visibility?: 'public' | 'private'
  createdAt: string
}
export interface Playlist {
  _id: string
  title: string
  description?: string
  creator: {
    _id: string
    displayName: string
  }
  coverUrl?: string
  collaborators?: { _id: string; displayName: string }[]
  songs: {
    songId: Song
    order: number
    addedBy: {
      _id: string
      displayName: string
    }
    _id: string
  }[]
  createdAt: string
  updatedAt: string
  visibility: 'public' | 'private'
  isLikedByCurrentUser?: boolean
  likedBy?: string[]
  streamCount?: number
}
