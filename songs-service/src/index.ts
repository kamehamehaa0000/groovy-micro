import { app } from './app'
import dotenv, { configDotenv } from 'dotenv'
dotenv.config()
configDotenv()
import {
  closeDatabaseConnections,
  connectToDatabase,
  verifyEnv,
  connectToQueue,
  testR2Connection,
  createPubSubManager,
} from '@groovy-streaming/common'
import { initializeEventListeners } from './events/initialize-event-listener'
import { r2Client } from './config/cloudflareR2'
import { fullSyncUsers, syncUsers } from './sync/users'
import { fullSyncSongAnalytics, syncSongAnalytics } from './sync/analytics'

let SyncInterval: NodeJS.Timeout

async function startServer() {
  try {
    verifyEnv([
      'NODE_ENV',
      'PORT',
      'BASE_URL',
      'CLIENT_URL',
      'JWT_ACCESS_SECRET',
      'JWT_REFRESH_SECRET',
      'JWT_ACCESS_EXPIRES_IN',
      'JWT_REFRESH_EXPIRES_IN',
      'MAGIC_LINK_SECRET',
      'MAGIC_LINK_EXPIRES_IN',
      'CLOUDAMQP_URL',
    ]) // Ensures all required environment variables are set

    await connectToDatabase(process.env.MONGODB_URI!)

    SyncInterval = setInterval(async () => {
      try {
        console.log('🔄 Starting hourly partial sync...')
        await Promise.all([syncUsers(), syncSongAnalytics()])
        console.log('✅ Hourly partial sync completed')
      } catch (error) {
        console.error(
          '❌ Error during hourly partial sync:',
          (error as Error).message
        )
      }
    }, 10 * 60 * 1000) // 10 minutes in milliseconds

    try {
      await fullSyncUsers()
      await fullSyncSongAnalytics()
    } catch (error) {
      console.error('❌ Error during full sync:', (error as Error).message)
    }
    await connectToQueue(process.env.CLOUDAMQP_URL!)
    await testR2Connection(r2Client, process.env.R2_BUCKET_NAME!)
    await initializeEventListeners(['USER', 'ANALYTICS'])

    await createPubSubManager(
      process.env.GCP_PROJECT_ID!,
      process.env.GCP_SERVICE_ACCOUNT_KEY_PATH!
    )

    const PORT = process.env.PORT
    const server = app.listen(PORT, () => {
      console.log(
        `🚀 Songs-service-started -
        1. Port ${PORT} 
        2. Environment ${process.env.NODE_ENV?.toUpperCase()}
        3. Health check: http://localhost:${PORT}/health `
      )
    })
    server.on('error', (error) => {
      console.log('Error on server songs service:', error.message)
    })
  } catch (error) {
    console.log('Error starting songs service:', (error as Error).message)
    process.exit(1)
  }
}

const gracefulShutdown = async (signal: string) => {
  console.log(`🔄 ${signal} received, shutting down gracefully...`)
  try {
    await closeDatabaseConnections()
    process.exit(0)
  } catch (error: any) {
    console.error('Error during graceful shutdown:', error.message)
    process.exit(1)
  }
}

startServer()
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))
