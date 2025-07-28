import axios from 'axios'
import { SyncMetadata } from '../models/SyncMetadata.model'
import { SongAnalytics } from '../models/SongAnalytics.model'

const PREFERENCE_SERVICE_URL = process.env.PREFERENCE_SERVICE_URL!

const syncSongAnalytics = async () => {
  try {
    const lastSync = await getLastSyncTimestamp()
    console.log(
      `Starting libraries sync...Last sync: ${lastSync?.toISOString()}`
    )

    const allSongAnalyticsId = await axios.get(
      `${PREFERENCE_SERVICE_URL}/api/v1/sync/song-analytics`,
      {
        headers: { 'x-sync-api-key': process.env.SYNC_API_KEY },
        params: { getAllIds: 'true' },
      }
    )

    const activeSongAnalyticsIds = new Set(
      allSongAnalyticsId.data.data.songAnalyticsIds
    )

    // Step 2: Find and delete libraries that no longer exist in auth service
    const localSongAnalytics = await SongAnalytics.find({}).select('_id')
    const songAnalyticsToDelete = localSongAnalytics.filter(
      (sa) => !activeSongAnalyticsIds.has(sa._id)
    )

    if (songAnalyticsToDelete.length > 0) {
      const songAnalyticsIdsToDelete = songAnalyticsToDelete.map((sa) => sa._id)
      await SongAnalytics.deleteMany({ _id: { $in: songAnalyticsIdsToDelete } })
      console.log(
        `Cleaned up ${songAnalyticsToDelete.length} orphaned song analytics`
      )
    }

    // Step 3: Sync updated/new song analytics (only if we have a last sync timestamp)
    let totalProcessed = 0
    let totalCreated = 0
    let totalUpdated = 0

    if (lastSync) {
      let page = 1
      let totalPages = 1

      do {
        const response = await axios.get(
          `${PREFERENCE_SERVICE_URL}/api/v1/sync/song-analytics`,
          {
            headers: { 'x-sync-api-key': process.env.SYNC_API_KEY },
            params: {
              page,
              limit: 100,
              since: lastSync.toISOString(),
            },
          }
        )

        const { songAnalytics, pagination } = response.data.data
        totalPages = pagination.totalPages

        if (songAnalytics && songAnalytics.length > 0) {
          const bulkOps = songAnalytics.map((sa: any) => ({
            updateOne: {
              filter: { _id: sa._id },
              update: {
                $set: {
                  _id: sa._id,
                  songId: sa.songId,
                  streamCount: sa.streamCount,
                },
              },
              upsert: true,
            },
          }))

          const result = await SongAnalytics.bulkWrite(bulkOps)
          totalCreated += result.upsertedCount
          totalUpdated += result.modifiedCount
          totalProcessed += songAnalytics.length
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

const fullSyncSongAnalytics = async () => {
  try {
    console.log('Starting FULL library sync...')
    await SyncMetadata.deleteOne({ type: 'song-analytics-sync' }) // Reset last sync timestamp

    let page = 1
    let totalPages = 1
    let totalProcessed = 0

    do {
      const response = await axios.get(
        `${PREFERENCE_SERVICE_URL}/api/v1/sync/song-analytics`,
        {
          headers: { 'x-sync-api-key': process.env.SYNC_API_KEY },
          params: { page, limit: 100 },
        }
      )

      const { songAnalytics, pagination } = response.data.data
      totalPages = pagination.totalPages

      if (songAnalytics && songAnalytics.length > 0) {
        console.log('songAnalytics', songAnalytics)
        const bulkOps = songAnalytics.map((sa: any) => ({
          updateOne: {
            filter: { _id: sa._id },
            update: {
              $set: {
                _id: sa._id,
                songId: sa.songId,
                streamCount: sa.streamCount,
              },
            },
            upsert: true,
          },
        }))

        await SongAnalytics.bulkWrite(bulkOps)
        totalProcessed += songAnalytics.length
      }
      page++
    } while (page <= totalPages)

    // After full sync, clean up song analytics that don't exist in source
    const allSongAnalyticsIdsResponse = await axios.get(
      `${PREFERENCE_SERVICE_URL}/api/v1/sync/song-analytics`,
      {
        headers: { 'x-sync-api-key': process.env.SYNC_API_KEY },
        params: { getAllIds: 'true' },
      }
    )

    const activeSongAnalyticsIds = new Set(
      allSongAnalyticsIdsResponse.data.data.songAnalyticsIds
    )
    const localSongAnalytics = await SongAnalytics.find({}).select('_id')
    const songAnalyticsToDelete = localSongAnalytics.filter(
      (sa: any) => !activeSongAnalyticsIds.has(sa._id.toString())
    )

    if (songAnalyticsToDelete.length > 0) {
      const songAnalyticsIdsToDelete = songAnalyticsToDelete.map((sa) => sa._id)
      await SongAnalytics.deleteMany({ _id: { $in: songAnalyticsIdsToDelete } })
      console.log(
        `Cleaned up ${songAnalyticsToDelete.length} orphaned song analytics`
      )
    }

    await updateLastSyncTimestamp(new Date())
    console.log(
      `Full sync completed - processed ${totalProcessed} song analytics`
    )
  } catch (error) {
    console.error('Error in full sync:', error)
    throw error
  }
}

// ... rest of the helper functions remain the same
const getLastSyncTimestamp = async (): Promise<Date | null> => {
  try {
    const metadata = await SyncMetadata.findOne({ type: 'song-analytics-sync' })
    return metadata?.lastSyncAt || null
  } catch (error) {
    console.error('Error getting last sync timestamp:', error)
    return null
  }
}

const updateLastSyncTimestamp = async (timestamp: Date) => {
  try {
    await SyncMetadata.updateOne(
      { type: 'song-analytics-sync' },
      { $set: { lastSyncAt: timestamp } },
      { upsert: true }
    )
  } catch (error) {
    console.error('Error updating last sync timestamp:', error)
  }
}

export { syncSongAnalytics, fullSyncSongAnalytics }
