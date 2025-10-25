import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { config, configDotenv } from 'dotenv'
import http from 'http'
import { Server } from 'socket.io'
import { createClient } from 'redis'
import { createAdapter } from '@socket.io/redis-adapter'
import { globalErrorHandler } from '@groovy-streaming/common'
import { mainRouter } from './routes/main.router'
import { initializeJamHandler } from './events/jam.handler'
import { initializeStreamHandler } from './events/stream.handler'
import Redis from 'ioredis'

configDotenv({
  path: '.env',
})
config({
  path: '.env',
}) // Load environment variables from .env file

export const app = express()
export const httpServer = http.createServer(app)

const io = new Server(httpServer, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
  },
})

const redisPubClient = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000)
    return delay
  },
})

const redisSubClient = redisPubClient.duplicate()

redisPubClient.on('error', (err) => {
  console.error('Redis Pub Client Error:', err)
})

redisSubClient.on('error', (err) => {
  console.error('Redis Sub Client Error:', err)
})

redisPubClient.on('ready', () => {
  console.log('✅ Redis Pub Client connected')
})

redisSubClient.on('ready', () => {
  console.log('✅ Redis Sub Client connected')
})

// Wait for both clients to be ready before setting up adapter
Promise.all([
  new Promise((resolve) => redisPubClient.on('ready', resolve)),
  new Promise((resolve) => redisSubClient.on('ready', resolve)),
])
  .then(() => {
    io.adapter(createAdapter(redisPubClient, redisSubClient))
    console.log('✅ Socket.IO Redis adapter connected')
  })
  .catch((err) => {
    console.error('❌ Failed to setup Redis adapter:', err)
  })

initializeJamHandler(io)
initializeStreamHandler(io)

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

app.use('/api/v1', generalLimiter, mainRouter)

app.use(globalErrorHandler)
