import express from 'express'
import cors from 'cors'
import { v4 as uuidv4 } from 'uuid'
import os from 'os'
import {
  verifyEnv,
  StatusEnum,
  createPubSubManager,
  TOPICS,
  SUBSCRIPTIONS,
  BaseEvent,
} from '@groovy-streaming/common'
import fs from 'fs'
import path from 'path'
const app = express()
import { config, configDotenv } from 'dotenv'
import { sendWebhook } from './utils/send-webhook'
import { downloadFromR2, uploadToR2 } from './utils/r2-utils'
import { convertToHLS } from './utils/convert-to-hls'

config({
  path: './.env',
})
configDotenv()

app.use(cors())
app.use(express.json())

let PubSubManager: any

const connectAndConsume = async () => {
  try {
    const connected = await PubSubManager.testConnection()
    if (!connected) {
      console.error('Worker: Connection to PubSubManager failed')
      return
    }

    // Subscribe to GCP Pub/Sub for audio conversion tasks
    await PubSubManager.subscribe(
      TOPICS.AUDIO_CONVERSION,
      SUBSCRIPTIONS.HLS_WORKER_AUDIO_CONVERSION,
      async (event: BaseEvent) => {
        try {
          const job = event.data
          await processConversionJob(job)
        } catch (error) {
          console.log(`Worker: Error processing job: ${error}`)
          // Do not rethrow here so the message is acknowledged and not retried/requeued
        }
      }
    )
    console.log('Worker: Subscribed to audio-conversion topic')
  } catch (error) {
    console.error('Worker: Failed to initialize Pub/Sub subscription:', error)
    setTimeout(connectAndConsume, 30000) // Retry subscription initialization
  }
}
app.get('/', (req, res) => {
  res.send('HLS Conversion Worker')
})

const processConversionJob = async (job: any) => {
  const { songId, inputKey, outputKey } = job
  const tempDir = path.join(os.tmpdir(), uuidv4())

  try {
    console.log(`Worker: Starting conversion for song ${songId}`)

    try {
      await sendWebhook(process.env.WEBHOOK_URL!, {
        songId,
        status: StatusEnum.PROCESSING,
      })
    } catch (webhookError) {
      console.log('Processing Webhook Failed', (webhookError as Error).message)
      // Continue processing - we'll try to send completion webhook later
    }

    // Create temp directories
    fs.mkdirSync(tempDir, { recursive: true })
    const outputDir = path.join(tempDir, 'hls')
    fs.mkdirSync(outputDir, { recursive: true })

    // Download - convert - upload
    const inputPath = path.join(tempDir, 'input.mp3')
    await downloadFromR2(inputKey, inputPath)
    const { duration } = await convertToHLS(inputPath, outputDir)
    console.log(
      `Worker: Conversion completed for song ${songId}, duration: ${duration}`
    )
    const hlsFiles = fs.readdirSync(outputDir)
    console.log(`Worker: Generated HLS files:`, hlsFiles)
    // Check each file in detail
    hlsFiles.forEach((file) => {
      const filePath = path.join(outputDir, file)
      const stats = fs.statSync(filePath)
      console.log(`Worker: File found: ${file} (${stats.size} bytes)`)
    })
    for (const file of hlsFiles) {
      const filePath = path.join(outputDir, file)
      const r2Key = `${outputKey}${file}`

      // Check if file exists and log its size
      const stats = fs.statSync(filePath)
      console.log(`Worker: Uploading ${file} (${stats.size} bytes) to ${r2Key}`)

      let contentType: string
      if (file.endsWith('.m3u8')) {
        contentType = 'application/vnd.apple.mpegurl'
      } else if (
        file.endsWith('.m4s') ||
        file === 'init.mp4' ||
        file.endsWith('.mp4')
      ) {
        contentType = 'video/mp4'
      } else {
        contentType = 'application/octet-stream'
      }
      try {
        await uploadToR2(filePath, r2Key, contentType)
        console.log(`Worker: Successfully uploaded ${file}`)
      } catch (uploadError) {
        console.error(`Worker: Failed to upload ${file}:`, uploadError)
        throw uploadError
      }
    }
    // Send success webhook
    const hlsUrl = `${process.env.R2_CUSTOM_DOMAIN}/${outputKey}playlist.m3u8`

    await sendWebhook(process.env.WEBHOOK_URL!, {
      songId,
      status: StatusEnum.COMPLETED,
      hlsUrl,
      duration,
    })

    console.log(`Worker: Successfully processed song ${songId}`)
  } catch (error) {
    console.error(`Worker: Error processing song ${songId}:`, error)

    // Send failure webhook
    await sendWebhook(process.env.WEBHOOK_URL!, {
      songId,
      status: StatusEnum.FAILED,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    throw error
  } finally {
    // Cleanup temp files
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  }
}

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'hls-worker',
    timestamp: new Date().toISOString(),
  })
})
app.get('/', (req, res) => {
  res.send('HLS Conversion Worker')
})

// Initialize connections and start server
const startServer = async () => {
  try {
    if (!process.env.WEBHOOK_SECRET || !process.env.WEBHOOK_URL) {
      console.log(process.env.WEBHOOK_SECRET, process.env.WEBHOOK_URL)
      throw new Error(
        'WEBHOOK_SECRET and WEBHOOK_URL must be set in the environment variables'
      )
    }

    verifyEnv([
      'WEBHOOK_SECRET',
      'WEBHOOK_URL',
      'R2_ENDPOINT',
      'R2_ACCESS_KEY_ID',
      'R2_SECRET_ACCESS_KEY',
      'R2_BUCKET_NAME',
      'R2_CUSTOM_DOMAIN',
      'GCP_PROJECT_ID',
      'GCP_SERVICE_ACCOUNT_KEY_PATH',
      'PORT',
      'NODE_ENV',
    ])

    PubSubManager = createPubSubManager(
      process.env.GCP_PROJECT_ID!,
      process.env.GCP_SERVICE_ACCOUNT_KEY_PATH!
    )

    await connectAndConsume()
    const port = process.env.PORT ?? 3000

    app.listen(port, () => {
      console.log(`Server is running on port ${port}`)
    })
    app.on('error', (err) => {
      console.error('Server error:', err)
    })
  } catch (error) {
    console.error('Failed to start HLS worker:', (error as Error).message)
    process.exit(1)
  }
}

startServer().catch(console.error)

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...')
  if (PubSubManager) {
    try {
      await PubSubManager.close()
    } catch (err) {
      console.error('Error closing PubSubManager:', err)
    }
  }
  process.exit(0)
})
