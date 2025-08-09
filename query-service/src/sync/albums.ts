import axios from 'axios'
import { Song } from '../models/Song.model'
import { Album } from '../models/Album.model'
import { SyncMetadata } from '../models/SyncMetadata.model'

import { Comment, CommentEntityEnum } from '../models/Comment.model'

const SONGS_SERVICE_URL =
  process.env.SONGS_SERVICE_URL ?? 'http://localhost:3000'

const syncAlbums = async () => {
  try {
    const lastSync = await getLastSyncTimestamp()
    console.log(`Starting album sync...Last sync: ${lastSync?.toISOString()}`)

    const allAlbumIdsResponse = await axios.get(
      `${SONGS_SERVICE_URL}/api/v1/sync/albums`,
      {
        headers: { 'x-sync-api-key': process.env.SYNC_API_KEY },
        params: { getAllIds: 'true' },
      }
    )

    const activeAlbumIds = new Set(allAlbumIdsResponse.data.data.albumIds)

    // Step 2: Find and delete albums that no longer exist in auth service
    const localAlbums = await Album.find({}).select('_id')
    const albumsToDelete = localAlbums.filter(
      (album) => !activeAlbumIds.has(album._id)
    )

    if (albumsToDelete.length > 0) {
      const albumIdsToDelete = albumsToDelete.map((a) => a._id)
      await cleanupAlbumReferences(albumIdsToDelete)
      await Album.deleteMany({ _id: { $in: albumIdsToDelete } })
      console.log(`Cleaned up ${albumsToDelete.length} orphaned albums`)
    }

    // Step 3: Sync updated/new albums (only if we have a last sync timestamp)
    let totalProcessed = 0
    let totalCreated = 0
    let totalUpdated = 0

    if (lastSync) {
      let page = 1
      let totalPages = 1

      do {
        const response = await axios.get(
          `${SONGS_SERVICE_URL}/api/v1/sync/albums`,
          {
            headers: { 'x-sync-api-key': process.env.SYNC_API_KEY },
            params: {
              page,
              limit: 100,
              since: lastSync.toISOString(),
            },
          }
        )

        const { albums, pagination } = response.data.data
        totalPages = pagination.totalPages

        if (albums && albums.length > 0) {
          const bulkOps = albums.map((album: any) => ({
            updateOne: {
              filter: { _id: album._id },
              update: {
                $set: {
                  _id: album._id,
                  title: album.title,
                  artist: album.artist,
                  coverUrl: album.coverUrl,
                  genre: album.genre,
                  tags: album.tags,
                  collaborators: album.collaborators,
                  songs: album.songs,
                  visibility: album.visibility,
                },
              },
              upsert: true,
            },
          }))

          const result = await Album.bulkWrite(bulkOps)
          totalCreated += result.upsertedCount
          totalUpdated += result.modifiedCount
          totalProcessed += albums.length
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
    console.error('Error syncing albums:', (error as Error).message)
    throw error
  }
}

const fullSyncAlbums = async () => {
  try {
    console.log('Starting FULL album sync...')
    await SyncMetadata.deleteOne({ type: 'album-sync' }) // Reset last sync timestamp

    let page = 1
    let totalPages = 1
    let totalProcessed = 0

    do {
      const response = await axios.get(
        `${SONGS_SERVICE_URL}/api/v1/sync/albums`,
        {
          headers: { 'x-sync-api-key': process.env.SYNC_API_KEY },
          params: { page, limit: 100 },
        }
      )

      const { albums, pagination } = response.data.data
      totalPages = pagination.totalPages

      if (albums && albums.length > 0) {
        const bulkOps = albums.map((album: any) => ({
          updateOne: {
            filter: { _id: album._id },
            update: {
              $set: {
                _id: album._id,
                title: album.title,
                artist: album.artist,
                coverUrl: album.coverUrl,
                genre: album.genre,
                tags: album.tags,
                collaborators: album.collaborators,
                songs: album.songs,
                visibility: album.visibility,
              },
            },
            upsert: true,
          },
        }))

        await Album.bulkWrite(bulkOps)
        totalProcessed += albums.length
      }
      page++
    } while (page <= totalPages)

    // After full sync, clean up albums that don't exist in source
    const allAlbumIdsResponse = await axios.get(
      `${SONGS_SERVICE_URL}/api/v1/sync/albums`,
      {
        headers: { 'x-sync-api-key': process.env.SYNC_API_KEY },
        params: { getAllIds: 'true' },
      }
    )

    const activeAlbumIds = new Set(allAlbumIdsResponse.data.data.albumIds)
    const localAlbums = await Album.find({}).select('_id')
    const albumsToDelete = localAlbums.filter(
      (album) => !activeAlbumIds.has(album._id)
    )

    if (albumsToDelete.length > 0) {
      const albumIdsToDelete = albumsToDelete.map((a) => a._id)
      await cleanupAlbumReferences(albumIdsToDelete)
      await Album.deleteMany({ _id: { $in: albumIdsToDelete } })
      console.log(`Cleaned up ${albumsToDelete.length} orphaned albums`)
    }

    await updateLastSyncTimestamp(new Date())
    console.log(`Full sync completed - processed ${totalProcessed} albums`)
  } catch (error) {
    console.error('Error in full sync:', (error as Error).message)
    throw error
  }
}

// ... rest of the helper functions remain the same
const getLastSyncTimestamp = async (): Promise<Date | null> => {
  try {
    const metadata = await SyncMetadata.findOne({ type: 'album-sync' })
    return metadata?.lastSyncAt || null
  } catch (error) {
    console.error('Error getting last sync timestamp:', error)
    return null
  }
}

const updateLastSyncTimestamp = async (timestamp: Date) => {
  try {
    await SyncMetadata.updateOne(
      { type: 'album-sync' },
      { $set: { lastSyncAt: timestamp } },
      { upsert: true }
    )
  } catch (error) {
    console.error('Error updating last sync timestamp:', error)
  }
}

const cleanupAlbumReferences = async (deletedAlbumIds: string[]) => {
  try {
    // Delete all songs and its comments
    const songsToBeDeleted = await Song.find({
      'metadata.album': { $in: deletedAlbumIds },
    })
    await Song.deleteMany({
      'metadata.album': { $in: deletedAlbumIds },
    })

    songsToBeDeleted.forEach(async (song: any) => {
      await Comment.deleteMany({
        entityType: CommentEntityEnum.SONG,
        entityId: song._id,
      })
    })

    // Delete all comments associated with these albums
    await Comment.deleteMany({
      entityType: CommentEntityEnum.ALBUM,
      entityId: { $in: deletedAlbumIds },
    })
    await Album.deleteMany({
      _id: { $in: deletedAlbumIds },
    })
  } catch (error) {
    console.error('Error cleaning up album references:', error)
  }
}

export { syncAlbums, fullSyncAlbums }
