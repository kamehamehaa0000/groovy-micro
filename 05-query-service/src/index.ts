import dotenv, { configDotenv } from 'dotenv'
dotenv.config()
configDotenv()
import {
  closeDatabaseConnections,
  connectToDatabase,
  verifyEnv,
  createPubSubManager,
} from '@groovy-streaming/common'
import { initializeEventListeners } from './events/initialize-event-listener'

import { syncUsers, fullSyncUsers } from './sync/users'
import { syncAlbums, fullSyncAlbums } from './sync/albums'
import { syncPlaylists, fullSyncPlaylists } from './sync/playlists'
import { syncSongs, fullSyncSongs } from './sync/songs'
import { app } from './app'
import { fullSyncLibraries, syncLibraries } from './sync/libraries'

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
      'MONGODB_URI',
    ]) // Ensures all required environment variables are set
    await connectToDatabase(process.env.MONGODB_URI!)
    // Schedule partial syncs to run every hour
    SyncInterval = setInterval(async () => {
      try {
        console.log('🔄 Starting regular partial sync...')
        await Promise.all([
          syncUsers(),
          syncAlbums(),
          syncPlaylists(),
          syncSongs(),
          syncLibraries(),
        ])
        console.log('✅ regular partial sync completed')
      } catch (error) {
        console.error(
          '❌ Error during regular partial sync:',
          (error as Error).message
        )
      }
    }, 2 * 60 * 1000) // 2 minutes in milliseconds

    try {
      await fullSyncAlbums()
      await fullSyncUsers()
      await fullSyncPlaylists()
      await fullSyncSongs()
      await fullSyncLibraries()
    } catch (error) {
      console.error('❌ Error during full sync:', (error as Error).message)
    }

    await initializeEventListeners()
    await createPubSubManager(
      process.env.GCP_PROJECT_ID!,
      process.env.GCP_SERVICE_ACCOUNT_KEY_PATH!
    )

    const PORT = process.env.PORT
    const server = app.listen(PORT, () => {
      console.log(
        `🚀 Query-Service-Started -
        1. Port ${PORT} 
        2. Environment ${process.env.NODE_ENV?.toUpperCase()}
        3. Health check: http://localhost:${PORT}/health `
      )
    })
    server.on('error', (error: any) => {
      console.log('Error on server Query service:', error.message)
    })
  } catch (error) {
    console.log('Error starting Query service:', (error as Error).message)
    process.exit(1)
  }
}

const gracefulShutdown = async (signal: string) => {
  console.log(`🔄 ${signal} received, shutting down gracefully...`)
  try {
    await closeDatabaseConnections()
    if (SyncInterval) {
      clearInterval(SyncInterval) //clear the sync setInterval used for partial syncs
    }
    process.exit(0)
  } catch (error: any) {
    console.error('Error during graceful shutdown:', error.message)
    process.exit(1)
  }
}

startServer()
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))
