import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { config, configDotenv } from 'dotenv'
import { globalErrorHandler } from '@groovy-streaming/common'
import { mainRouter } from './routes/main.router'
import { SongAnalytics } from './models/SongAnalytics.model'

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

app.use(
  cors({
    origin: 'http://localhost:5173',
    credentials: true,
  })
)

app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())

const generalLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 100, // General API calls
  message: {
    error: 'Too many requests',
    retryAfter: '5 minutes',
  },
})

app.use('/api/v1/query', mainRouter)

app.use(globalErrorHandler)
