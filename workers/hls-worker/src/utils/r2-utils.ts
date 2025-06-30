import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import r2Client from '../config/cloudflareR2'
import fs from 'fs'

export const downloadFromR2 = async (
  key: string,
  localPath: string
): Promise<void> => {
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
  })

  const response = await r2Client.send(command)
  const stream = response.Body as NodeJS.ReadableStream

  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(localPath)
    stream.pipe(writeStream)
    writeStream.on('finish', resolve)
    writeStream.on('error', reject)
  })
}

// Upload file to R2
export const uploadToR2 = async (
  localPath: string,
  key: string,
  contentType: string
): Promise<void> => {
  const fileStream = fs.createReadStream(localPath)

  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    Body: fileStream,
    ContentType: contentType,
  })

  await r2Client.send(command)
}
