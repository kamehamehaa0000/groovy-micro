import {
  AlbumCreatedEventData,
  AlbumDeletedEventData,
  AlbumUpdatedEventData,
  BaseEvent,
  EventTypes,
  LibraryCreatedEventData,
  LibraryUpdatedEventData,
  PlaylistCreatedEventData,
  PlaylistDeletedEventData,
  PlaylistUpdatedEventData,
  SongCreatedEventData,
  SongDeletedEventData,
  SongStreamedEventData,
  SongUpdatedEventData,
} from '@groovy-streaming/common'

import { Playlist } from '../models/Playlist.model'
import { Album } from '../models/Album.model'
import { Song } from '../models/Song.model'
import Library from '../models/Library.model'

export class SongServiceEventHandlers {
  static async handleSongsServiceEvent(event: BaseEvent): Promise<void> {
    switch (event.eventType) {
      case EventTypes.SONG_CREATED:
        await SongServiceEventHandlers.handleSongCreated(
          event.data as SongCreatedEventData
        )
        break

      case EventTypes.SONG_DELETED:
        await SongServiceEventHandlers.handleSongDeleted(
          event.data as SongDeletedEventData
        )
        break

      case EventTypes.SONG_UPDATED:
        await SongServiceEventHandlers.handleSongUpdated(
          event.data as SongUpdatedEventData
        )
        break
      case EventTypes.ALBUM_CREATED:
        await SongServiceEventHandlers.handleAlbumCreated(
          event.data as AlbumCreatedEventData
        )
        break
      case EventTypes.ALBUM_UPDATED:
        await SongServiceEventHandlers.handleAlbumUpdated(
          event.data as AlbumUpdatedEventData
        )
        break
      case EventTypes.ALBUM_DELETED:
        await SongServiceEventHandlers.handleAlbumDeleted(
          event.data as AlbumDeletedEventData
        )
        break

      case EventTypes.PLAYLIST_CREATED:
        await SongServiceEventHandlers.handlePlaylistCreated(
          event.data as PlaylistCreatedEventData
        )
        break
      case EventTypes.PLAYLIST_UPDATED:
        await SongServiceEventHandlers.handlePlaylistUpdated(
          event.data as PlaylistUpdatedEventData
        )
        break
      case EventTypes.PLAYLIST_DELETED:
        await SongServiceEventHandlers.handlePlaylistDeleted(
          event.data as PlaylistDeletedEventData
        )
        break

      case EventTypes.LIBRARY_CREATED:
        await SongServiceEventHandlers.handleLibraryCreated(
          event.data as LibraryCreatedEventData
        )
        break
      case EventTypes.LIBRARY_UPDATED:
        await SongServiceEventHandlers.handleLibraryUpdated(
          event.data as LibraryUpdatedEventData
        )
        break

      default:
        console.log(`🤷‍♂️ Unknown event type: ${event.eventType}`)
    }
  }

  static readonly handleSongCreated = async (
    eventData: SongCreatedEventData
  ): Promise<void> => {
    try {
      await Song.create({
        _id: eventData.songId,
        coverArtUrl: eventData.coverArtUrl,
        originalUrl: eventData.originalUrl,
        hlsUrl: eventData.hlsUrl,
        status: eventData.status,
        visibility: eventData.visibility,
        metadata: eventData.metadata,
      })
    } catch (error: any) {
      if (error.code === 11000) {
        console.log(`ℹ️ Song ${eventData.songId} already exists - this is OK`) // Duplicate key error - song already exists
        // DON'T throw - acknowledge message (song creation succeeded in the past)
        return
      } else if (error.name === 'ValidationError') {
        console.error(
          `Error(song-service-song-created-event)-${eventData.songId}: ${error.message}`
        )
        return
      }
      throw error
    }
  }

  static readonly handleSongUpdated = async (
    event: SongUpdatedEventData
  ): Promise<void> => {
    try {
      const song = await Song.findById(event.songId)
      if (!song) {
        console.error(`❌ Song ${event.songId} not found for update`)
        return
      }
      song.originalUrl = event.originalUrl ?? song.originalUrl
      song.hlsUrl = event.hlsUrl ?? song.hlsUrl
      song.coverArtUrl = event.coverArtUrl ?? song.coverArtUrl
      song.status = event.status ?? song.status
      song.visibility = event.visibility ?? song.visibility
      song.metadata = event.metadata ?? song.metadata
      await song.save()
    } catch (error) {
      console.error(
        `Error(song-service-song-updated-event) ${event.songId}: ${
          (error as Error).message
        }`
      )
      return
    }
  }

  static readonly handleSongDeleted = async (
    event: SongDeletedEventData
  ): Promise<void> => {
    try {
      await Song.findByIdAndDelete(event.songId)
    } catch (error) {
      console.error(
        `Error(song-service-song-deleted-event) ${event.songId}: ${
          (error as Error).message
        }`
      )
    }
  }

  static readonly handleAlbumCreated = async (
    eventData: AlbumCreatedEventData
  ): Promise<void> => {
    try {
      console.log(
        `🔍 Creating album with data:`,
        JSON.stringify(eventData, null, 2)
      )

      // Validate that this is actually album data
      if (!eventData.albumId || !eventData.title) {
        console.error(`❌ Invalid album data received:`, eventData)
        return
      }
      await Album.create({
        _id: eventData.albumId,
        title: eventData.title,
        artist: eventData.artist,
        coverUrl: eventData.coverUrl,
        songs: eventData.songs,
        genre: eventData.genre,
        collaborators: eventData.collaborators,
        tags: eventData.tags,
        likedBy: eventData.likedBy,
      })
    } catch (error: any) {
      if (error.code === 11000) {
        console.log(
          `Error - Album ${eventData.albumId} already exists - this is OK`
        )
        return
      } else if (error.name === 'ValidationError') {
        console.error(
          `Error(song-service-album-created-event) ${eventData.albumId}: ${
            (error as Error).message
          }`
        )
        return
      }
      throw error
    }
  }
  static readonly handleAlbumUpdated = async (
    event: AlbumUpdatedEventData
  ): Promise<void> => {
    try {
      const album = await Album.findById(event.albumId)
      if (!album) {
        console.error(`Error: Album ${event.albumId} not found for update`)
        return
      }
      album.title = event.title ?? album.title
      album.artist = event.artist ?? album.artist
      album.coverUrl = event.coverUrl ?? album.coverUrl
      album.genre = event.genre ?? album.genre
      album.collaborators = event.collaborators ?? album.collaborators
      album.tags = event.tags ?? album.tags
      album.songs = event.songs ?? album.songs
      album.likedBy = event.likedBy ?? album.likedBy
      await album.save()
    } catch (error) {
      console.error(
        `Error(song-service-album-updated-event) ${event.albumId}: ${
          (error as Error).message
        }`
      )
    }
  }
  static readonly handleAlbumDeleted = async (
    event: AlbumDeletedEventData
  ): Promise<void> => {
    try {
      await Album.findByIdAndDelete(event.albumId)
    } catch (error) {
      console.error(
        `Error(song-service-album-deleted-event) ${event.albumId}: ${
          (error as Error).message
        }`
      )
    }
  }

  static readonly handlePlaylistCreated = async (
    eventData: PlaylistCreatedEventData
  ): Promise<void> => {
    try {
      await Playlist.create({
        _id: eventData.playlistId,
        title: eventData.title,
        description: eventData.description,
        creator: eventData.creator,
        collaborators: eventData.collaborators,
        visibility: eventData.visibility,
        songs: eventData.songs,
        coverUrl: eventData.coverUrl,
      })
    } catch (error: any) {
      if (error.code === 11000) {
        console.log(
          `Error: Playlist ${eventData.playlistId} already exists - this is OK`
        )
        return
      } else if (error.name === 'ValidationError') {
        console.error(
          `Error(song-service-playlist-created-event) ${eventData.playlistId}:`,
          error.message
        )
        return
      }
      throw error
    }
  }

  static readonly handlePlaylistUpdated = async (
    event: PlaylistUpdatedEventData
  ): Promise<void> => {
    try {
      const playlist = await Playlist.findById(event.playlistId)
      if (!playlist) {
        return
      }
      playlist.title = event.title ?? playlist.title
      playlist.description = event.description ?? playlist.description
      playlist.creator = event.creator ?? playlist.creator
      playlist.collaborators = event.collaborators ?? playlist.collaborators
      playlist.visibility = event.visibility ?? playlist.visibility
      playlist.songs = event.songs ?? playlist.songs
      playlist.coverUrl = event.coverUrl ?? playlist.coverUrl
      playlist.likedBy = event.likedBy ?? playlist.likedBy

      await playlist.save()
    } catch (error) {
      console.error(
        `Error(song-service-playlist-updated-event) ${event.playlistId}:`,
        error instanceof Error ? error.message : error
      )
    }
  }

  static readonly handlePlaylistDeleted = async (
    event: PlaylistDeletedEventData
  ): Promise<void> => {
    try {
      await Playlist.findByIdAndDelete(event.playlistId)
    } catch (error) {
      console.error(
        `Error(song-service-playlist-deleted-event) ${event.playlistId}:`,
        error instanceof Error ? error.message : error
      )
    }
  }

  static readonly handleLibraryCreated = async (
    eventData: LibraryCreatedEventData
  ): Promise<void> => {
    try {
      await Library.create({
        _id: eventData.LibraryId,
        recentlyPlayed: eventData.recentlyPlayed,
        listenLater: eventData.listenLater,
        userId: eventData.userId,
      })
      console.log(`Library created successfully: ${eventData.LibraryId}`)
    } catch (error) {
      console.error(
        `Error(song-service-library-created-event) ${eventData.LibraryId}:`,
        error instanceof Error ? error.message : error
      )
    }
  }

  static readonly handleLibraryUpdated = async (
    event: LibraryUpdatedEventData
  ): Promise<void> => {
    try {
      const library = await Library.findById(event.LibraryId)
      if (!library) {
        console.error(`Error: Library ${event.LibraryId} not found for update`)
        return
      }
      library.recentlyPlayed = event.recentlyPlayed ?? library.recentlyPlayed
      library.listenLater = event.listenLater ?? library.listenLater
      library.userId = event.userId ?? library.userId
      await library.save()
      console.log(`Library updated successfully: ${event.LibraryId}`)
    } catch (error) {
      console.error(
        `Error(song-service-library-updated-event) ${event.LibraryId}:`,
        error instanceof Error ? error.message : error
      )
    }
  }
}
