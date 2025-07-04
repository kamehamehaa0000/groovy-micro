import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { config, configDotenv } from 'dotenv'
import passport from 'passport'
import { globalErrorHandler } from '@groovy-streaming/common'
import { AuthRouter } from './routes/auth.router'
import { SyncRouter } from './sync/users'

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
app.use(passport.initialize())
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

app.use('/api/v1/auth', generalLimiter, AuthRouter)
app.use('/api/v1/sync', SyncRouter)

app.use(globalErrorHandler)
