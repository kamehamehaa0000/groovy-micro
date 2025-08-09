import { app } from './app'
import {
  connectToDatabase,
  closeDatabaseConnections,
  verifyEnv,
} from '@groovy-streaming/common'

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

    const PORT = process.env.PORT
    const server = app.listen(PORT, () => {
      console.log(
        `🚀 Auth-service-started -
        1. Port ${PORT} 
        2. Environment ${process.env.NODE_ENV?.toUpperCase()}
        3. Health check: http://localhost:${PORT}/health `
      )
    })
    server.on('error', (error) => {
      console.log('Error on server Auth service:', error)
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
    process.exit(0)
  } catch (error) {
    console.error('❌ Error during cleanup while shutting down:', error)
    process.exit(1)
  }
}
startServer()

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))
