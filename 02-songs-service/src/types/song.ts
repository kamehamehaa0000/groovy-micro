export enum conversionStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  READY = 'ready',
  FAILED = 'failed',
}

export interface ISong {
  title: string
  artist?: string
  album?: string
  duration?: number
  conversionStatus: conversionStatus
  cloudinaryPublicId: string
  originalUrl: string
  hlsUrl?: string
  uploadedBy: string
  createdAt: Date
  updatedAt: Date
}

export interface SongUploadRequest {
  title: string
  artist?: string
  album?: string
  userId: string
}

export interface PresignedUrlResult {
  url: string
  timestamp: number
  signature: string
  api_key: string
  public_id: string
}

export interface CloudinaryUploadResult {
  public_id: string
  secure_url: string
  duration?: number
  format: string
  resource_type: string
}
