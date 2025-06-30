import { PutObjectCommand } from '@aws-sdk/client-s3'
import { v4 as uuidv4 } from 'uuid'
import { Song, StatusEnum } from '../models/Song.model'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import r2Client from '../config/cloudflareR2'

export async function createSong(
  songFilename: string,
  coverArtFileName: string
) {
  const songId = uuidv4()
  const key = `songs/${songId}/${songFilename}`
  const coverKey = `songs/${songId}/${coverArtFileName}`

  // Generate presigned URL
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    ContentType: 'audio/mpeg',
  })
  const coverCommand = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: coverKey,
    ContentType: coverArtFileName.endsWith('.jpg') ? 'image/jpeg' : 'image/png',
  })

  const presignedUrl = await getSignedUrl(r2Client, command, {
    expiresIn: 3600,
  })

  const coverPresignedUrl = await getSignedUrl(r2Client, coverCommand, {
    expiresIn: 3600,
  })

  return {
    presignedSongUrl: presignedUrl,
    presignedCoverUrl: coverPresignedUrl,
    songUploadKey: key,
    coverUploadKey: coverKey,
    songId: songId,
  }
}

export const createSongWithoutCover = async (
  userId: string,
  songFilename: string,
  visibility: 'public' | 'private',
  metaData: {
    title: string
    artist: string
    collaborators: string[]
    trackNumber?: number
    album: string
    genre: string
    tags: string[]
  }
) => {
  const songId = uuidv4()
  const key = `songs/${songId}/${songFilename}`
  // Create database entry
  const song = new Song({
    _id: songId,
    filename: songFilename,
    status: StatusEnum.UPLOADING,
    metadata: {
      title: metaData.title,
      artist: userId,
      collaborators: metaData.collaborators ?? [],
      album: metaData.album,
      genre: metaData.genre ?? '',
      trackNumber: metaData.trackNumber,
      tags: metaData.tags ?? [],
    },
    visibility: visibility ?? 'public',
  })
  await song.save()

  // Generate presigned URL
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    ContentType: 'audio/mpeg',
  })

  const presignedUrl = await getSignedUrl(r2Client, command, {
    expiresIn: 3600,
  })

  return {
    presignedSongUrl: presignedUrl,
    songUploadKey: key,
    songId: songId,
  }
}

export const createCoverPresignedUrl = async (
  coverFilename: string,
  forSong: boolean = true,
  albumId?: string,
  songId?: string
) => {
  if (!coverFilename) {
    throw new Error('Cover filename is required')
  }
  if (!forSong && !albumId) {
    throw new Error('Album ID is required for album cover uploads')
  }
  if (forSong && !songId) {
    throw new Error('Song ID is required for song cover uploads')
  }
  let coverKey = ''
  if (forSong) {
    coverKey = `songs/${songId}/${coverFilename}`
  } else {
    coverKey = `albums/${albumId}/${coverFilename}`
  }

  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: coverKey,
    ContentType: coverFilename.endsWith('.jpg') ? 'image/jpeg' : 'image/png',
  })

  const presignedUrl = await getSignedUrl(r2Client, command, {
    expiresIn: 3600,
  })

  return {
    presignedCoverUrl: presignedUrl,
    coverUploadKey: coverKey,
  }
}
