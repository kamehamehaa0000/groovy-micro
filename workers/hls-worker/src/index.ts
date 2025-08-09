import express from 'express'
import cors from 'cors'
import { v4 as uuidv4 } from 'uuid'
import {
  channel,
  connectToQueue,
  verifyEnv,
  StatusEnum,
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

const connectAndConsume = async () => {
  try {
    await connectToQueue(process.env.CLOUDAMQP_URL!)
    if (!channel) {
      console.error('Worker: Channel is not initialized')
      return
    }
    channel.prefetch(1) // Set prefetch to 1 to process one job at a time
    channel.consume('audio-conversion', async (msg) => {
      if (msg) {
        try {
          const job = JSON.parse(msg.content.toString())
          await processConversionJob(job)
          channel.ack(msg)
        } catch (error) {
          console.log(`Worker: Error processing job: ${error}`)
          channel.nack(msg, false, false) // don't requeue failed jobs
        }
      }
    })
  } catch (error) {
    console.error('Worker: Failed to connect to CloudAMQP:', error)
    setTimeout(connectAndConsume, 30000) // Retry connection after 30 seconds
  }
}
app.get('/', (req, res) => {
  res.send('HLS Conversion Worker')
})

const processConversionJob = async (job: any) => {
  const { songId, inputKey, outputKey } = job
  const tempDir = `/tmp/${uuidv4()}`

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
    for (const file of hlsFiles) {
      const filePath = path.join(outputDir, file)
      const r2Key = `${outputKey}${file}`
      const contentType = file.endsWith('.m3u8')
        ? 'application/vnd.apple.mpegurl'
        : 'video/mp2t'
      await uploadToR2(filePath, r2Key, contentType)
    }
    // Send success webhook
    const hlsUrl = `https://${process.env.R2_CUSTOM_DOMAIN}/${outputKey}playlist.m3u8`

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
      'CLOUDAMQP_URL',
      'PORT',
      'NODE_ENV',
    ])
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
  process.exit(0) // Remove 'await' here
})
