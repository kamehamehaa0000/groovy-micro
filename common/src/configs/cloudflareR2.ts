import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'

interface R2Config {
  endpoint: string
  accessKeyId: string
  secretAccessKey: string
}

export const createR2Client = (config: R2Config) => {
  return new S3Client({
    region: 'auto',
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  })
}

export async function testR2Connection(r2Client: S3Client, bucketName: string) {
  try {
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      MaxKeys: 1,
    })
    await r2Client.send(command)
    console.log('✅ R2 connection successful!')
  } catch (error) {
    console.error('❌ R2 connection failed:', error)
    throw error
  }
}
