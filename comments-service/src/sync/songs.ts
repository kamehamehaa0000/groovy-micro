import axios from 'axios'
import { Song } from '../models/Song.model'
import { SyncMetadata } from '../models/SyncMetadata.model'
import { CommentEntityEnum, Comment } from '../models/Comment.model'

const SONGS_SERVICE_URL =
  process.env.SONGS_SERVICE_URL ?? 'http://localhost:3000'

const syncSongs = async () => {
  try {
    const lastSync = await getLastSyncTimestamp()
    console.log(`Starting song sync...Last sync: ${lastSync?.toISOString()}`)

    const allSongIdsResponse = await axios.get(
      `${SONGS_SERVICE_URL}/api/v1/sync/songs`,
      {
        headers: { 'x-sync-api-key': process.env.SYNC_API_KEY },
        params: { getAllIds: 'true' },
      }
    )

    const activeSongIds = new Set(allSongIdsResponse.data.data.songIds)

    // Step 2: Find and delete songs that no longer exist in auth service
    const localSongs = await Song.find({}).select('_id')
    const songsToDelete = localSongs.filter(
      (song: any) => !activeSongIds.has(song._id)
    )

    if (songsToDelete.length > 0) {
      const songIdsToDelete = songsToDelete.map((s: any) => s._id)
      await cleanupSongReferences(songIdsToDelete)
      await Song.deleteMany({ _id: { $in: songIdsToDelete } })
      console.log(`Cleaned up ${songsToDelete.length} orphaned songs`)
    }

    // Step 3: Sync updated/new songs (only if we have a last sync timestamp)
    let totalProcessed = 0
    let totalCreated = 0
    let totalUpdated = 0

    if (lastSync) {
      let page = 1
      let totalPages = 1

      do {
        const response = await axios.get(
          `${SONGS_SERVICE_URL}/api/v1/sync/songs`,
          {
            headers: { 'x-sync-api-key': process.env.SYNC_API_KEY },
            params: {
              page,
              limit: 100,
              since: lastSync.toISOString(),
            },
          }
        )

        const { songs, pagination } = response.data.data
        totalPages = pagination.totalPages

        if (songs && songs.length > 0) {
          const bulkOps = songs.map((song: any) => ({
            updateOne: {
              filter: { _id: song._id },
              update: {
                $set: {
                  _id: song._id,
                  coverArtUrl: song.coverArtUrl,
                  originalUrl: song.originalUrl,
                  hlsUrl: song.hlsUrl,
                  status: song.status,
                  visibility: song.visibility,
                  metadata: song.metadata,
                },
              },
              upsert: true,
            },
          }))

          const result = await Song.bulkWrite(bulkOps)
          totalCreated += result.upsertedCount
          totalUpdated += result.modifiedCount
          totalProcessed += songs.length
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
    console.error('Error syncing albums:', error)
    throw error
  }
}

const fullSyncSongs = async () => {
  try {
    console.log('Starting FULL album sync...')
    await SyncMetadata.deleteOne({ type: 'album-sync' }) // Reset last sync timestamp

    let page = 1
    let totalPages = 1
    let totalProcessed = 0

    do {
      const response = await axios.get(
        `${SONGS_SERVICE_URL}/api/v1/sync/songs`,
        {
          headers: { 'x-sync-api-key': process.env.SYNC_API_KEY },
          params: { page, limit: 100 },
        }
      )

      const { songs, pagination } = response.data.data
      totalPages = pagination.totalPages

      if (songs && songs.length > 0) {
        const bulkOps = songs.map((song: any) => ({
          updateOne: {
            filter: { _id: song._id },
            update: {
              $set: {
                _id: song._id,
                coverArtUrl: song.coverArtUrl,
                originalUrl: song.originalUrl,
                hlsUrl: song.hlsUrl,
                status: song.status,
                visibility: song.visibility,
                metadata: song.metadata,
              },
            },
            upsert: true,
          },
        }))

        await Song.bulkWrite(bulkOps)
        totalProcessed += songs.length
      }
      page++
    } while (page <= totalPages)

    // After full sync, clean up albums that don't exist in source
    const allSongIdsResponse = await axios.get(
      `${SONGS_SERVICE_URL}/api/v1/sync/songs`,
      {
        headers: { 'x-sync-api-key': process.env.SYNC_API_KEY },
        params: { getAllIds: 'true' },
      }
    )

    const activeAlbumIds = new Set(allSongIdsResponse.data.data.songIds)
    const localSongs = await Song.find({}).select('_id')
    const songsToDelete = localSongs.filter(
      (song: any) => !activeAlbumIds.has(song._id)
    )

    if (songsToDelete.length > 0) {
      const songIdsToDelete = songsToDelete.map((s: any) => s._id)
      await cleanupSongReferences(songIdsToDelete)
      await Song.deleteMany({ _id: { $in: songIdsToDelete } })
      console.log(`Cleaned up ${songIdsToDelete.length} orphaned songs`)
    }

    await updateLastSyncTimestamp(new Date())
    console.log(`Full sync completed - processed ${totalProcessed} songs`)
  } catch (error) {
    console.error('Error in full sync:', error)
    throw error
  }
}

// ... rest of the helper functions remain the same
const getLastSyncTimestamp = async (): Promise<Date | null> => {
  try {
    const metadata = await SyncMetadata.findOne({ type: 'song-sync' })
    return metadata?.lastSyncAt || null
  } catch (error) {
    console.error('Error getting last sync timestamp:', error)
    return null
  }
}

const updateLastSyncTimestamp = async (timestamp: Date) => {
  try {
    await SyncMetadata.updateOne(
      { type: 'song-sync' },
      { $set: { lastSyncAt: timestamp } },
      { upsert: true }
    )
  } catch (error) {
    console.error('Error updating last sync timestamp:', error)
  }
}

const cleanupSongReferences = async (deletedSongIds: string[]) => {
  try {
    // Delete all songs and its comments
    await Song.deleteMany({ _id: { $in: deletedSongIds } })
    await Comment.deleteMany({
      entityType: CommentEntityEnum.SONG,
      entityId: { $in: deletedSongIds },
    })
  } catch (error) {
    console.error('Error cleaning up Song references:', error)
  }
}

export { syncSongs, fullSyncSongs }
