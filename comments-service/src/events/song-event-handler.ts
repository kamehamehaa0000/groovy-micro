import { Song } from '../models/Song.model'
import { Playlist } from '../models/Playlist.model'
import { Album } from '../models/Album.model'

import { BaseEvent, EventTypes } from '@groovy-streaming/common'

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

      default:
        console.log(`🤷‍♂️ Unknown event type: ${event.eventType}`)
    }
  }

  static handleSongCreated = async (
    eventData: SongCreatedEventData
  ): Promise<void> => {
    try {
      await Song.create({
        _id: eventData.songId,
        title: eventData.title,
        artist: eventData.artist,
        album: eventData.album,
      })
    } catch (error: any) {
      if (error.code === 11000) {
        console.log(`ℹ️ Song ${eventData.songId} already exists - this is OK`) // Duplicate key error - song already exists
        // DON'T throw - acknowledge message (song creation succeeded in the past)
        return
      } else if (error.name === 'ValidationError') {
        console.error(
          `❌ Validation error creating song ${eventData.songId}:`,
          error.message
        )
        return
      } else if (error.code === 11000) {
        console.log(`ℹ️ User ${eventData.userId} already exists - this is OK`) // Duplicate key error - user already exists
        // DON'T throw - acknowledge message (user creation succeeded in the past)
        return
      } else if (error.name === 'ValidationError') {
        console.error(
          `❌ Validation error creating user ${eventData.userId}:`,
          error.message
        )
        return
      }
      throw error
    }
  }

  static handleSongUpdated = async (
    event: SongUpdatedEventData
  ): Promise<void> => {
    try {
      if (event.title || event.artist || event.album) {
        const song = await Song.findById(event.songId)
        if (!song) {
          console.error(`❌ User ${event.userId} not found for update`)
          return
        }
        user.displayName = event.displayName
        await user.save()
      }
    } catch (error) {
      console.error(
        `❌ Error updating user ${event.userId}:`,
        error instanceof Error ? error.message : error
      )
      return
    }
  }

  static handleSongDeleted = async (
    event: SongDeletedEventData
  ): Promise<void> => {
    try {
      await Song.findByIdAndDelete(event.songId)
      console.log(`🗑️ Song deleted: ${event.songId}`)
    } catch (error) {
      console.error(
        `❌ Error deleting song ${event.songId}:`,
        error instanceof Error ? error.message : error
      )
    }
  }

  static handleAlbumCreated = async (
    eventData: AlbumCreatedEventData
  ): Promise<void> => {
    try {
      await Album.create({
        _id: eventData.albumId,
        title: eventData.title,
        artist: eventData.artist,
        coverUrl: eventData.coverUrl,
      })
    } catch (error: any) {
      if (error.code === 11000) {
        console.log(`ℹ️ Album ${eventData.albumId} already exists - this is OK`)
        return
      } else if (error.name === 'ValidationError') {
        console.error(
          `❌ Validation error creating album ${eventData.albumId}:`,
          error.message
        )
        return
      }
      throw error
    }
  }
  static handleAlbumUpdated = async (
    event: AlbumUpdatedEventData
  ): Promise<void> => {
    try {
      const album = await Album.findById(event.albumId)
      if (!album) {
        console.error(`❌ Album ${event.albumId} not found for update`)
        return
      }
      if (event.title) album.title = event.title
      if (event.artist) album.artist = event.artist
      if (event.coverUrl) album.coverUrl = event.coverUrl
      await album.save()
    } catch (error) {
      console.error(
        `❌ Error updating album ${event.albumId}:`,
        error instanceof Error ? error.message : error
      )
    }
  }
  static handleAlbumDeleted = async (
    event: AlbumDeletedEventData
  ): Promise<void> => {
    try {
      await Album.findByIdAndDelete(event.albumId)
      console.log(`🗑️ Album deleted: ${event.albumId}`)
    } catch (error) {
      console.error(
        `❌ Error deleting album ${event.albumId}:`,
        error instanceof Error ? error.message : error
      )
    }
  }

  static handlePlaylistCreated = async (
    eventData: PlaylistCreatedEventData
  ): Promise<void> => {
    try {
      await Playlist.create({
        _id: eventData.playlistId,
        title: eventData.title,
        creator: eventData.creator,
        songs: eventData.songs,
      })
    } catch (error: any) {
      if (error.code === 11000) {
        console.log(
          `ℹ️ Playlist ${eventData.playlistId} already exists - this is OK`
        )
        return
      } else if (error.name === 'ValidationError') {
        console.error(
          `❌ Validation error creating playlist ${eventData.playlistId}:`,
          error.message
        )
        return
      }
      throw error
    }
  }

  static handlePlaylistUpdated = async (
    event: PlaylistUpdatedEventData
  ): Promise<void> => {
    try {
      const playlist = await Playlist.findById(event.playlistId)
      if (!playlist) {
        console.error(`❌ Playlist ${event.playlistId} not found for update`)
        return
      }
      if (event.title) playlist.title = event.title
      if (event.songs) playlist.songs = event.songs
      await playlist.save()
    } catch (error) {
      console.error(
        `❌ Error updating playlist ${event.playlistId}:`,
        error instanceof Error ? error.message : error
      )
    }
  }

  static handlePlaylistDeleted = async (
    event: PlaylistDeletedEventData
  ): Promise<void> => {
    try {
      await Playlist.findByIdAndDelete(event.playlistId)
      console.log(`🗑️ Playlist deleted: ${event.playlistId}`)
    } catch (error) {
      console.error(
        `❌ Error deleting playlist ${event.playlistId}:`,
        error instanceof Error ? error.message : error
      )
    }
  }
}

export interface SongCreatedEventData {}
export interface SongUpdatedEventData {}
export interface SongDeletedEventData {}
export interface AlbumCreatedEventData {}
export interface AlbumUpdatedEventData {}
export interface AlbumDeletedEventData {}
export interface PlaylistCreatedEventData {}
export interface PlaylistUpdatedEventData {}
export interface PlaylistDeletedEventData {}
