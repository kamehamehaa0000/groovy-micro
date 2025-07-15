import axios from 'axios'
import { Album } from '../models/Album.model'
import { SyncMetadata } from '../models/SyncMetadata.model'
import { Playlist } from '../models/Playlist.model'
const SONGS_SERVICE_URL =
  process.env.SONGS_SERVICE_URL ?? 'http://localhost:3000'

const syncPlaylists = async () => {
  try {
    const lastSync = await getLastSyncTimestamp()
    console.log(
      `Starting playlist sync...Last sync: ${lastSync?.toISOString()}`
    )

    const allPlaylistIdResponse = await axios.get(
      `${SONGS_SERVICE_URL}/api/v1/sync/playlists`,
      {
        headers: { 'x-sync-api-key': process.env.SYNC_API_KEY },
        params: { getAllIds: 'true' },
      }
    )

    const activePlaylistIds = new Set(
      allPlaylistIdResponse.data.data.playlistIds
    )

    // Step 2: Find and delete playlists that no longer exist in auth service
    const localPlaylists = await Playlist.find({}).select('_id')
    const playlistsToDelete = localPlaylists.filter(
      (playlist) => !activePlaylistIds.has(playlist._id)
    )

    if (playlistsToDelete.length > 0) {
      const playlistIdsToDelete = playlistsToDelete.map((p) => p._id)
      await cleanupPlaylistReferences(playlistIdsToDelete)
      await Playlist.deleteMany({ _id: { $in: playlistIdsToDelete } })
    }

    // Step 3: Sync updated/new playlists (only if we have a last sync timestamp)
    let totalProcessed = 0
    let totalCreated = 0
    let totalUpdated = 0

    if (lastSync) {
      let page = 1
      let totalPages = 1

      do {
        const response = await axios.get(
          `${SONGS_SERVICE_URL}/api/v1/sync/playlists`,
          {
            headers: { 'x-sync-api-key': process.env.SYNC_API_KEY },
            params: {
              page,
              limit: 100,
              since: lastSync.toISOString(),
            },
          }
        )

        const { playlists, pagination } = response.data.data
        totalPages = pagination.totalPages

        if (playlists && playlists.length > 0) {
          const bulkOps = playlists.map((playlist: any) => ({
            updateOne: {
              filter: { _id: playlist._id },
              update: {
                $set: {
                  _id: playlist._id,
                  title: playlist.title,
                  description: playlist.description,
                  creator: playlist.creator,
                  collaborators: playlist.collaborators,
                  visibility: playlist.visibility,
                  songs: playlist.songs,
                  coverUrl: playlist.coverUrl,
                },
              },
              upsert: true,
            },
          }))

          const result = await Album.bulkWrite(bulkOps)
          totalCreated += result.upsertedCount
          totalUpdated += result.modifiedCount
          totalProcessed += playlists.length
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

const fullSyncPlaylists = async () => {
  try {
    console.log('Starting FULL playlist sync...')
    await SyncMetadata.deleteOne({ type: 'playlist-sync' }) // Reset last sync timestamp

    let page = 1
    let totalPages = 1
    let totalProcessed = 0

    do {
      const response = await axios.get(
        `${SONGS_SERVICE_URL}/api/v1/sync/playlists`,
        {
          headers: { 'x-sync-api-key': process.env.SYNC_API_KEY },
          params: { page, limit: 100 },
        }
      )

      const { playlists, pagination } = response.data.data
      totalPages = pagination.totalPages

      if (playlists && playlists.length > 0) {
        const bulkOps = playlists.map((playlist: any) => ({
          updateOne: {
            filter: { _id: playlist._id },
            update: {
              $set: {
                _id: playlist._id,
                title: playlist.title,
                description: playlist.description,
                creator: playlist.creator,
                collaborators: playlist.collaborators,
                visibility: playlist.visibility,
                songs: playlist.songs,
                coverUrl: playlist.coverUrl,
              },
            },
            upsert: true,
          },
        }))

        await Playlist.bulkWrite(bulkOps)
        totalProcessed += playlists.length
      }
      page++
    } while (page <= totalPages)

    const allPlaylistIdResponse = await axios.get(
      `${SONGS_SERVICE_URL}/api/v1/sync/playlists`,
      {
        headers: { 'x-sync-api-key': process.env.SYNC_API_KEY },
        params: { getAllIds: 'true' },
      }
    )

    const activePlaylistIds = new Set(
      allPlaylistIdResponse.data.data.playlistIds
    )
    const localPlaylists = await Playlist.find({}).select('_id')
    const playlistsToDelete = localPlaylists.filter(
      (playlist) => !activePlaylistIds.has(playlist._id)
    )
    if (playlistsToDelete.length > 0) {
      const playlistIdsToDelete = playlistsToDelete.map((p) => p._id)
      await cleanupPlaylistReferences(playlistIdsToDelete)
      await Playlist.deleteMany({ _id: { $in: playlistIdsToDelete } })
      console.log(`Cleaned up ${playlistsToDelete.length} orphaned playlists`)
    }
    await updateLastSyncTimestamp(new Date())
    console.log(`Full sync completed - processed ${totalProcessed} playlists`)
  } catch (error) {
    console.error('Error in full sync:', error)
    throw error
  }
}

// ... rest of the helper functions remain the same
const getLastSyncTimestamp = async (): Promise<Date | null> => {
  try {
    const metadata = await SyncMetadata.findOne({ type: 'playlist-sync' })
    return metadata?.lastSyncAt || null
  } catch (error) {
    console.error('Error getting last sync timestamp:', error)
    return null
  }
}

const updateLastSyncTimestamp = async (timestamp: Date) => {
  try {
    await SyncMetadata.updateOne(
      { type: 'playlist-sync' },
      { $set: { lastSyncAt: timestamp } },
      { upsert: true }
    )
  } catch (error) {
    console.error('Error updating last sync timestamp:', error)
  }
}

const cleanupPlaylistReferences = async (deletedPlaylistIds: string[]) => {
  try {
    // Delete all songs and its comments
    await Playlist.deleteMany({
      _id: { $in: deletedPlaylistIds },
    })
  } catch (error) {
    console.error('Error cleaning up playlist references:', error)
  }
}

export { syncPlaylists, fullSyncPlaylists }
