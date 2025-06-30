import { app } from './app'
import { closeDatabaseConnections, connectToDatabase } from './config/database'
// import { generateAccessToken } from './services/tokenService'
import { verifyEnv } from './utils/verify-env'
import { pubSubManager } from './events/pubSubManager'
import { Subscriptions, TOPICS } from './events/events'

async function startServer() {
  try {
    verifyEnv() // Ensures all required environment variables are set
    await connectToDatabase()
    // console.log(generateAccessToken('testUserId'))
    pubSubManager.listTopics().then((topics) => {
      console.log('Available Pub/Sub topics:')
      console.log(topics)
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
