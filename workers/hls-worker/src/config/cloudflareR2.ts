import { createR2Client } from '@groovy-streaming/common'

const r2Client = createR2Client({
  endpoint: process.env.R2_ENDPOINT!,
  accessKeyId: process.env.R2_ACCESS_KEY_ID!,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
})

export default r2Client
