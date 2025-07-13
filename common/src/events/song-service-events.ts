export enum StatusEnum {
  UPLOADING = 'uploading',
  UPLOADED = 'uploaded',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}
export interface SongCreatedEventData {
  songId: string
  coverArtUrl: string
  originalUrl: string
  hlsUrl?: string
  status: StatusEnum
  metadata: {
    title: string
    artist: string
    collaborators: string[]
    album: string
    genre: string
    tags: string[]
    trackNumber?: number
    likedBy: string[]
  }
  visibility: 'public' | 'private'
}
export interface SongUpdatedEventData extends SongCreatedEventData {}
export interface SongDeletedEventData {
  songId: string
}

export interface AlbumCreatedEventData {
  albumId: string
  title?: string
  artist?: string
  coverUrl?: string
  genre?: string
  tags?: string[]
  collaborators?: string[]
  likedBy: string[]
  songs?: string[]
  visibility?: 'public' | 'private'
}

export interface AlbumUpdatedEventData extends AlbumCreatedEventData {}
export interface AlbumDeletedEventData {
  albumId: string
}

export interface PlaylistCreatedEventData {
  playlistId: string
  title: string
  description: string
  creator: string // User._id
  collaborators?: string[] // User._id[]
  visibility: 'public' | 'private'
  likedBy: string[]
  songs: {
    songId: string // Song._id
    addedBy: string // User._id
    order: number
  }[]
  coverUrl: string
}
export interface PlaylistUpdatedEventData extends PlaylistCreatedEventData {}
export interface PlaylistDeletedEventData {
  playlistId: string
}
