import axios from 'axios'
import { User } from '../models/User.model'
import { SyncMetadata } from '../models/SyncMetadata.model'

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://localhost:3000'

const syncUsers = async () => {
  try {
    console.log('Starting user sync...')
    const lastSync = await getLastSyncTimestamp()
    console.log(`Last sync: ${lastSync ? lastSync.toISOString() : 'Never'}`)

    // Step 1: Get all active user IDs from auth service for deletion check
    const allUserIdsResponse = await axios.get(
      `${AUTH_SERVICE_URL}/api/v1/sync/users`,
      {
        headers: { 'x-sync-api-key': process.env.SYNC_API_KEY },
        params: { getAllIds: 'true' },
      }
    )

    const activeUserIds = new Set(allUserIdsResponse.data.data.userIds)

    // Step 2: Find and delete users that no longer exist in auth service
    const localUsers = await User.find({}).select('_id')
    const usersToDelete = localUsers.filter(
      (user) => !activeUserIds.has(user._id)
    )

    if (usersToDelete.length > 0) {
      const userIdsToDelete = usersToDelete.map((u) => u._id)
      await cleanupUserReferences(userIdsToDelete)
      await User.deleteMany({ _id: { $in: userIdsToDelete } })
      console.log(`Deleted ${usersToDelete.length} users that no longer exist`)
    }

    // Step 3: Sync updated/new users (only if we have a last sync timestamp)
    let totalProcessed = 0
    let totalCreated = 0
    let totalUpdated = 0

    if (lastSync) {
      let page = 1
      let totalPages = 1

      do {
        const response = await axios.get(
          `${AUTH_SERVICE_URL}/api/v1/sync/users`,
          {
            headers: { 'x-sync-api-key': process.env.SYNC_API_KEY },
            params: {
              page,
              limit: 100,
              since: lastSync.toISOString(),
            },
          }
        )

        const { users, pagination } = response.data.data
        totalPages = pagination.totalPages

        if (users && users.length > 0) {
          const bulkOps = users.map((user: any) => ({
            updateOne: {
              filter: { _id: user._id },
              update: {
                $set: {
                  _id: user._id,
                  displayName: user.displayName,
                  email: user.email,
                  googleId: user.googleId,
                },
              },
              upsert: true,
            },
          }))

          const result = await User.bulkWrite(bulkOps)
          totalCreated += result.upsertedCount
          totalUpdated += result.modifiedCount
          totalProcessed += users.length

          console.log(
            `Page ${page}/${totalPages}: Processed ${users.length} users`
          )
        }

        page++
      } while (page <= totalPages)
    } else {
      console.log(
        'No last sync timestamp - skipping incremental sync (use full sync instead)'
      )
    }

    await updateLastSyncTimestamp(new Date())

    console.log(`User sync completed:`)
    console.log(`- Processed: ${totalProcessed}`)
    console.log(`- Created: ${totalCreated}`)
    console.log(`- Updated: ${totalUpdated}`)
    console.log(`- Deleted: ${usersToDelete.length}`)
  } catch (error) {
    console.error('Error syncing users:', error)
    throw error
  }
}

const fullSyncUsers = async () => {
  try {
    console.log('Starting FULL user sync...')

    // Reset last sync timestamp
    await SyncMetadata.deleteOne({ type: 'user-sync' })

    let page = 1
    let totalPages = 1
    let totalProcessed = 0

    do {
      const response = await axios.get(
        `${AUTH_SERVICE_URL}/api/v1/sync/users`,
        {
          headers: { 'x-sync-api-key': process.env.SYNC_API_KEY },
          params: { page, limit: 100 },
        }
      )

      const { users, pagination } = response.data.data
      totalPages = pagination.totalPages

      if (users && users.length > 0) {
        const bulkOps = users.map((user: any) => ({
          updateOne: {
            filter: { _id: user._id },
            update: {
              $set: {
                _id: user._id,
                displayName: user.displayName,
                email: user.email,
                googleId: user.googleId,
              },
            },
            upsert: true,
          },
        }))

        await User.bulkWrite(bulkOps)
        totalProcessed += users.length
        console.log(
          `Page ${page}/${totalPages}: Processed ${users.length} users`
        )
      }

      page++
    } while (page <= totalPages)

    // After full sync, clean up users that don't exist in source
    const allUserIdsResponse = await axios.get(
      `${AUTH_SERVICE_URL}/api/v1/sync/users`,
      {
        headers: { 'x-sync-api-key': process.env.SYNC_API_KEY },
        params: { getAllIds: 'true' },
      }
    )

    const activeUserIds = new Set(allUserIdsResponse.data.data.userIds)
    const localUsers = await User.find({}).select('_id')
    const usersToDelete = localUsers.filter(
      (user) => !activeUserIds.has(user._id)
    )

    if (usersToDelete.length > 0) {
      const userIdsToDelete = usersToDelete.map((u) => u._id)
      await cleanupUserReferences(userIdsToDelete)
      await User.deleteMany({ _id: { $in: userIdsToDelete } })
      console.log(`Cleaned up ${usersToDelete.length} orphaned users`)
    }

    await updateLastSyncTimestamp(new Date())
    console.log(`Full sync completed - processed ${totalProcessed} users`)
  } catch (error) {
    console.error('Error in full sync:', error)
    throw error
  }
}

// ... rest of the helper functions remain the same
const getLastSyncTimestamp = async (): Promise<Date | null> => {
  try {
    const metadata = await SyncMetadata.findOne({ type: 'user-sync' })
    return metadata?.lastSyncAt || null
  } catch (error) {
    console.error('Error getting last sync timestamp:', error)
    return null
  }
}

const updateLastSyncTimestamp = async (timestamp: Date) => {
  try {
    await SyncMetadata.updateOne(
      { type: 'user-sync' },
      { $set: { lastSyncAt: timestamp } },
      { upsert: true }
    )
  } catch (error) {
    console.error('Error updating last sync timestamp:', error)
  }
}

const cleanupUserReferences = async (deletedUserIds: string[]) => {
  try {
    const { Playlist } = await import('../models/Playlist.model')
    const { Song } = await import('../models/Song.model')

    console.log(
      `Cleaning up references for ${deletedUserIds.length} deleted users...`
    )

    await Playlist.updateMany(
      { collaborators: { $in: deletedUserIds } },
      { $pull: { collaborators: { $in: deletedUserIds } } }
    )

    const deletedPlaylists = await Playlist.deleteMany({
      creator: { $in: deletedUserIds },
    })

    await Song.updateMany(
      { 'metadata.collaborators': { $in: deletedUserIds } },
      { $pull: { 'metadata.collaborators': { $in: deletedUserIds } } }
    )

    const deletedSongs = await Song.deleteMany({
      'metadata.artist': { $in: deletedUserIds },
    })

    console.log(
      `Cleanup: ${deletedPlaylists.deletedCount} playlists, ${deletedSongs.deletedCount} songs`
    )
  } catch (error) {
    console.error('Error cleaning up user references:', error)
  }
}

export { syncUsers, fullSyncUsers }
