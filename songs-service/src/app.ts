import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { config, configDotenv } from 'dotenv'

import { globalErrorHandler } from '@groovy-streaming/common'
import { mainRouter } from './routes/main.router'
import { verifyWebhookSignature } from './middlewares/verifyWebhookSignature'
import { Song } from './models/Song.model'

configDotenv({
  path: '.env',
})
config({
  path: '.env',
}) // Load environment variables from .env file
export const app = express()

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  })
)
// app.use(
//   cors({
//     origin:
//       process.env.NODE_ENV === 'production'
//         ? process.env.CLIENT_URL
//         : [
//             'http://localhost:5173',
//             'http://localhost:5174',
//             'http://localhost:3000',
//           ],
//     credentials: true,
//   })
// )
app.use(
  cors({
    origin: 'http://localhost:5173',
    credentials: true,
  })
)

app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())
// Rate limiting for sensitive auth endpoints
const strictAuthLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5, // 5 attempts per window for login/register
  message: {
    error: 'Too many authentication attempts',
    retryAfter: '5 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for token refresh and logout
    return req.path.includes('/refresh') || req.path.includes('/logout')
  },
})

const generalLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 100, // General API calls
  message: {
    error: 'Too many requests',
    retryAfter: '5 minutes',
  },
})

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    service: 'auth-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  })
})
app.post(
  '/webhook/hls-conversion',
  verifyWebhookSignature,
  async (req, res) => {
    const { songId, status, hlsUrl } = req.body
    console.log('Received webhook:', req.body)
    if (!songId || !status) {
      return res.status(400).json({ error: 'Invalid request body' })
    }
    try {
      const song = await Song.findById(req.body.songId)
      if (!song) {
        return res.status(404).json({ error: 'Song not found' })
      }
      song.status = status
      if (status === 'failed') {
        // Changed from StatusEnum.FAILED to string
        //TODO: publish song.updated event to the queue
        song.errorMessage = req.body.error ?? 'Unknown error'
      } else if (status === 'completed') {
        // Changed from StatusEnum.COMPLETED to string
        //TODO: publish song.updated event to the queue
        song.hlsUrl = hlsUrl
      } else if (status === 'processing') {
        // Added handling for processing status
        // Just update the status, no additional fields needed
      } else {
        return res.status(400).json({ error: 'Invalid status' })
      }
      await song.save()
      res.status(200).json({ success: true })
    } catch (error) {
      console.error('Webhook processing error:', error)
      return res.status(500).json({ error: 'Internal server error' })
    }
  }
)

app.use('/api/v1', generalLimiter, mainRouter)

app.use(globalErrorHandler)
