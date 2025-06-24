import express from 'express'
import cors from 'cors'
import { v4 as uuidv4 } from 'uuid'
import r2Client from './config/cloudflareR2'
import connectToQueue, { channel } from './config/cloudAMQP'
import axios from 'axios'
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
const app = express()
import { config } from 'dotenv'
config({
  path: './.env',
})

app.use(cors())
app.use(express.json())

const connectAndConsume = async () => {
  try {
    await connectToQueue()
    if (!channel) {
      console.error('Worker: Channel is not initialized')
      return
    }

    // Set prefetch to 1 to process one job at a time
    channel.prefetch(1)

    console.log('Worker: Connected to CloudAMQP, waiting for jobs...')

    channel.consume('audio-conversion', async (msg) => {
      if (msg) {
        try {
          const job = JSON.parse(msg.content.toString())
          console.log(`Worker: Processing job for song ${job.songId}`)
          await processConversionJob(job)
          channel.ack(msg)
        } catch (error) {
          console.error('Worker: Error processing job:', error)
          // Send failure webhook
          if (msg) {
            const job = JSON.parse(msg.content.toString())
            await sendWebhook(job.webhookUrl, {
              songId: job.songId,
              status: 'failed',
              error: error instanceof Error ? error.message : 'Unknown error',
            })
          }
          channel.nack(msg, false, false) // Don't requeue failed jobs
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

const sendWebhook = async (webhookUrl: string, data: any, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await axios.post(webhookUrl, data, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'HLS-Worker/1.0',
        },
      })

      console.log(`Webhook sent successfully for song ${data.songId}`)
      return response.data
    } catch (error) {
      console.error(
        `Webhook attempt ${i + 1} failed:`,
        error instanceof Error ? error.message : error
      )

      if (i === retries - 1) {
        console.error(
          `Failed to send webhook after ${retries} attempts for song ${data.songId}`
        )
        throw error
      }

      // Wait before retry (exponential backoff)
      await new Promise((resolve) => setTimeout(resolve, Math.pow(2, i) * 1000))
    }
  }
}

const downloadFromR2 = async (
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
const uploadToR2 = async (
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

// Convert MP3 to HLS using FFmpeg
const convertToHLS = async (
  inputPath: string,
  outputDir: string
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(outputDir, 'playlist.m3u8')

    const ffmpeg = spawn('ffmpeg', [
      '-i',
      inputPath, // Input MP3 file
      '-map',
      '0:a', // Map audio stream
      '-c:a',
      'aac', // Encode audio to AAC (widely supported)
      '-b:a',
      '128k', // Set audio bitrate
      '-ac',
      '2', // Stereo audio
      '-ar',
      '44100', // Sample rate
      '-f',
      'hls', // Output format
      '-hls_time',
      '15', // Segment duration (in seconds)
      '-hls_list_size',
      '0', // Include all segments in playlist

      outputPath, // Output .m3u8 file path
    ])

    ffmpeg.stderr.on('data', (data) => {
      console.log(`FFmpeg: ${data}`)
    })

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve(outputPath)
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`))
      }
    })
  })
}
// Process conversion job
const processConversionJob = async (job: any) => {
  const { songId, inputKey, outputKey, webhookUrl } = job
  const tempDir = `/tmp/${uuidv4()}`

  try {
    console.log(`Worker: Starting conversion for song ${songId}`)
    // Send processing status webhook
    // await sendWebhook(webhookUrl, {
    //   songId,
    //   status: 'processing',
    // })

    // Create temp directories
    fs.mkdirSync(tempDir, { recursive: true })
    const outputDir = path.join(tempDir, 'hls')
    fs.mkdirSync(outputDir, { recursive: true })

    // Download MP3 from R2
    const inputPath = path.join(tempDir, 'input.mp3')
    console.log(`Worker: Downloading ${inputKey}`)
    await downloadFromR2(inputKey, inputPath)

    // Convert to HLS
    console.log(`Worker: Converting to HLS`)
    const playlistPath = await convertToHLS(inputPath, outputDir)

    // Upload HLS files to R2
    console.log(`Worker: Uploading HLS files`)
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

    // await sendWebhook(webhookUrl, {
    //   songId,
    //   status: 'completed',
    //   hlsUrl,
    //   metadata: {
    //     segmentCount: hlsFiles.filter((f) => f.endsWith('.ts')).length,
    //     playlistFile: 'playlist.m3u8',
    //   },
    // })

    console.log(`Worker: Successfully processed song ${songId}`)
  } catch (error) {
    console.error(`Worker: Error processing song ${songId}:`, error)

    // Send failure webhook
    // await sendWebhook(webhookUrl, {
    //   songId,
    //   status: 'failed',
    //   error: error instanceof Error ? error.message : 'Unknown error',
    // })
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
  await connectAndConsume()
  const port = process.env.PORT ?? 3000
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`)
  })
  app.on('error', (err) => {
    console.error('Server error:', err)
  })
}

startServer().catch(console.error)

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...')
  process.exit(0) // Remove 'await' here
})
