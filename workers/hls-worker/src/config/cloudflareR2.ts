import { S3Client } from '@aws-sdk/client-s3'
import { configDotenv, config } from 'dotenv'
configDotenv()
config()

const r2Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

export default r2Client
