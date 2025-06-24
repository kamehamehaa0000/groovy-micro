import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import { config, configDotenv } from 'dotenv'
config({
  path: './.env',
})
configDotenv()

const r2Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

export default r2Client

export async function testR2Connection() {
  try {
    const command = new ListObjectsV2Command({
      Bucket: process.env.R2_BUCKET_NAME,
      MaxKeys: 1,
    })
    await r2Client.send(command)
    console.log('✅ R2 connection successful!')
  } catch (error) {
    console.error('❌ R2 connection failed:', error)
  }
}
