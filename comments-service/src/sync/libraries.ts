import axios from 'axios'
import { SyncMetadata } from '../models/SyncMetadata.model'
import Library from '../models/Library.model'

const SONGS_SERVICE_URL = process.env.SONGS_SERVICE_URL!

const syncLibraries = async () => {
  try {
    const lastSync = await getLastSyncTimestamp()
    console.log(
      `Starting libraries sync...Last sync: ${lastSync?.toISOString()}`
    )

    const allLibraryIdsResponse = await axios.get(
      `${SONGS_SERVICE_URL}/api/v1/sync/libraries`,
      {
        headers: { 'x-sync-api-key': process.env.SYNC_API_KEY },
        params: { getAllIds: 'true' },
      }
    )

    const activeLibraryIds = new Set(allLibraryIdsResponse.data.data.libraryIds)

    // Step 2: Find and delete libraries that no longer exist in auth service
    const localLibraries = await Library.find({}).select('_id')
    const librariesToDelete = localLibraries.filter(
      (library) => !activeLibraryIds.has(library._id)
    )

    if (librariesToDelete.length > 0) {
      const libraryIdsToDelete = librariesToDelete.map((l) => l._id)
      await Library.deleteMany({ _id: { $in: libraryIdsToDelete } })
      console.log(`Cleaned up ${librariesToDelete.length} orphaned libraries`)
    }

    // Step 3: Sync updated/new libraries (only if we have a last sync timestamp)
    let totalProcessed = 0
    let totalCreated = 0
    let totalUpdated = 0

    if (lastSync) {
      let page = 1
      let totalPages = 1

      do {
        const response = await axios.get(
          `${SONGS_SERVICE_URL}/api/v1/sync/libraries`,
          {
            headers: { 'x-sync-api-key': process.env.SYNC_API_KEY },
            params: {
              page,
              limit: 100,
              since: lastSync.toISOString(),
            },
          }
        )

        const { libraries, pagination } = response.data.data
        totalPages = pagination.totalPages

        if (libraries && libraries.length > 0) {
          const bulkOps = libraries.map((library: any) => ({
            updateOne: {
              filter: { _id: library._id },
              update: {
                $set: {
                  _id: library._id,
                  userId: library.userId,
                  recentlyPlayed: library.recentlyPlayed,
                  listenLater: library.listenLater,
                },
              },
              upsert: true,
            },
          }))

          const result = await Library.bulkWrite(bulkOps)
          totalCreated += result.upsertedCount
          totalUpdated += result.modifiedCount
          totalProcessed += libraries.length
        }
        page++
      } while (page <= totalPages)
    } else {
      console.log(
        'No last sync timestamp - skipping incremental sync (use full sync instead)'
      )
    }

    await updateLastSyncTimestamp(new Date())
  } catch (error) {
    console.error('Error syncing libraries:', error)
    throw error
  }
}

const fullSyncLibraries = async () => {
  try {
    console.log('Starting FULL library sync...')
    await SyncMetadata.deleteOne({ type: 'library-sync' }) // Reset last sync timestamp

    let page = 1
    let totalPages = 1
    let totalProcessed = 0

    do {
      const response = await axios.get(
        `${SONGS_SERVICE_URL}/api/v1/sync/libraries`,
        {
          headers: { 'x-sync-api-key': process.env.SYNC_API_KEY },
          params: { page, limit: 100 },
        }
      )

      const { libraries, pagination } = response.data.data
      totalPages = pagination.totalPages

      if (libraries && libraries.length > 0) {
        const bulkOps = libraries.map((library: any) => ({
          updateOne: {
            filter: { _id: library._id },
            update: {
              $set: {
                _id: library._id,
                userId: library.userId,
                recentlyPlayed: library.recentlyPlayed,
                listenLater: library.listenLater,
              },
            },
            upsert: true,
          },
        }))

        await Library.bulkWrite(bulkOps)
        totalProcessed += libraries.length
      }
      page++
    } while (page <= totalPages)

    // After full sync, clean up libraries that don't exist in source
    const allLibraryIdsResponse = await axios.get(
      `${SONGS_SERVICE_URL}/api/v1/sync/libraries`,
      {
        headers: { 'x-sync-api-key': process.env.SYNC_API_KEY },
        params: { getAllIds: 'true' },
      }
    )

    const activeLibraryIds = new Set(allLibraryIdsResponse.data.data.libraryIds)
    const localLibraries = await Library.find({}).select('_id')
    const librariesToDelete = localLibraries.filter(
      (library) => !activeLibraryIds.has(library._id)
    )

    if (librariesToDelete.length > 0) {
      const libraryIdsToDelete = librariesToDelete.map((l) => l._id)
      await Library.deleteMany({ _id: { $in: libraryIdsToDelete } })
      console.log(
        `Cleaned up ${librariesToDelete.length} orphaned libraries    `
      )
    }

    await updateLastSyncTimestamp(new Date())
    console.log(`Full sync completed - processed ${totalProcessed} libraries`)
  } catch (error) {
    console.error('Error in full sync:', error)
    throw error
  }
}

// ... rest of the helper functions remain the same
const getLastSyncTimestamp = async (): Promise<Date | null> => {
  try {
    const metadata = await SyncMetadata.findOne({ type: 'library-sync' })
    return metadata?.lastSyncAt || null
  } catch (error) {
    console.error('Error getting last sync timestamp:', error)
    return null
  }
}

const updateLastSyncTimestamp = async (timestamp: Date) => {
  try {
    await SyncMetadata.updateOne(
      { type: 'library-sync' },
      { $set: { lastSyncAt: timestamp } },
      { upsert: true }
    )
  } catch (error) {
    console.error('Error updating last sync timestamp:', error)
  }
}

export { syncLibraries, fullSyncLibraries }
