import cloudinary from '../config/cloudinary'
import { UploadApiResponse } from 'cloudinary'

export async function generatePresignedUploadUrl(
  userId: string,
  songId?: string
): Promise<{
  url: string
  timestamp: number
  signature: string
  api_key: string
  public_id: string
}> {
  try {
    const timestamp = Math.round(new Date().getTime() / 1000)
    const public_id = `songs/${userId}/${timestamp}`

    const params = {
      timestamp,
      public_id,
      resource_type: 'video', // Cloudinary treats audio as video
      folder: 'songs',
      eager: [
        {
          streaming_profile: 'hd', // Auto HLS conversion
          format: 'm3u8',
        },
      ],
    }
    const signature = cloudinary.utils.api_sign_request(
      params,
      process.env.CLOUDINARY_API_SECRET!
    )
    return {
      url: `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/upload`,
      timestamp,
      signature,
      api_key: process.env.CLOUDINARY_API_KEY!,
      public_id,
    }
  } catch (error) {
    console.error('Error generating presigned URL:', error)
    throw new Error('Failed to generate presigned upload URL')
  }
}
