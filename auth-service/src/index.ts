import { app } from './app'
import {
  connectToDatabase,
  closeDatabaseConnections,
  verifyEnv,
} from '@groovy-streaming/common'
import { pubSubManager } from './events/pubSubManager'
import { Subscriptions, TOPICS } from './events/events'

async function startServer() {
  try {
    verifyEnv([
      'NODE_ENV',
      'PORT',
      'BASE_URL',
      'CLIENT_URL',
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'SMTP_SERVICE',
      'SMTP_HOST',
      'SMTP_USER',
      'SMTP_PASS',
      'FROM_EMAIL',
      'JWT_ACCESS_SECRET',
      'JWT_REFRESH_SECRET',
      'JWT_ACCESS_EXPIRES_IN',
      'JWT_REFRESH_EXPIRES_IN',
      'MAGIC_LINK_SECRET',
      'MAGIC_LINK_EXPIRES_IN',
    ]) // Ensures all required environment variables are set

    await connectToDatabase(process.env.MONGODB_URI!)
    pubSubManager.listTopics().then((topics) => {
      console.log('Available Pub/Sub topics:', topics)
    })
    pubSubManager.subscribe(
      TOPICS.SONG_EVENTS,
      Subscriptions.AUTH_SERVICE_SONG_EVENTS,
      async (event) => {
        console.log('Received song event:', event)
      }
    )
    const PORT = process.env.PORT
    const server = app.listen(PORT, () => {
      console.log(
        `🚀 Auth service running on port ${PORT} in ${process.env.NODE_ENV?.toUpperCase()} environment.`
      )
      console.log(`📊 Health check: http://localhost:${PORT}/health`)
    })
    server.on('error', (error) => {
      console.error('❌ Server error: ', error.message)
    })
  } catch (error) {
    console.error('❌ Failed to start auth service:', (error as Error).message)
    process.exit(1)
  }
}

const gracefulShutdown = async (signal: string) => {
  console.log(`🔄 ${signal} received, shutting down gracefully...`)
  try {
    await closeDatabaseConnections()
    console.log('✅ Cleanup completed')
    process.exit(0)
  } catch (error) {
    console.error('❌ Error during cleanup while shutting down:', error)
    process.exit(1)
  }
}
startServer()

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))
