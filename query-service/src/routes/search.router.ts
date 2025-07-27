import {
  AuthenticatedRequest,
  CustomError,
  requireAuth,
} from '@groovy-streaming/common'
import Router, { NextFunction, Response } from 'express'
import User from '../models/User.model'
import { Album } from '../models/Album.model'
import { Song } from '../models/Song.model'
import { Playlist } from '../models/Playlist.model'

const router = Router()
// search albums by title, artist, or collaborators,tags, or genre
router.get(
  '/albums',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }
      const { q } = req.query
      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 20
      const skip = (page - 1) * limit

      if (!q || typeof q !== 'string') {
        throw new CustomError('Search query "q" is required', 400)
      }

      // 1. Search for artists/collaborators by name
      const users = await User.find(
        { displayName: { $regex: q, $options: 'i' } },
        '_id'
      )
      const userIds = users.map((user) => user._id)

      // 2. Build the main query
      const query = {
        $and: [
          {
            $or: [
              { title: { $regex: q, $options: 'i' } },
              { artist: { $in: userIds } },
              { collaborators: { $in: userIds } },
              { tags: { $regex: q, $options: 'i' } },
              { genre: { $regex: q, $options: 'i' } },
            ],
          },
          {
            $or: [
              { visibility: 'public' },
              { visibility: 'private', artist: user.id },
            ],
          },
        ],
      }

      const albums = await Album.find(query)
        .populate('artist', 'displayName')
        .populate('collaborators', 'displayName')
        .populate({
          path: 'songs',
          populate: [
            {
              path: 'metadata.artist',
              select: 'displayName',
            },
            {
              path: 'metadata.album',
              select: 'title',
            },
          ],
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)

      const total = await Album.countDocuments(query)
      const responseAlbums = albums.map((album) => ({
        likedBy: album.likedBy.length,
        isLikedByCurrentUser: req.user?.id
          ? album.likedBy.includes(req.user.id)
          : false,
        ...album.toObject(),
      }))

      res.status(200).json({
        albums: responseAlbums,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalAlbums: total,
      })
    } catch (error) {
      next(error)
    }
  }
)
// search songs by matching pattern (title, artist, or collaborator name)
router.get(
  '/songs',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }
      const { q } = req.query
      const sort = (req.query.sort as string) ?? 'Descending'
      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 20
      const skip = (page - 1) * limit

      if (!q || typeof q !== 'string') {
        throw new CustomError('Search query "q" is required', 400)
      }

      // 1. Search for artists/collaborators by name
      const users = await User.find(
        { displayName: { $regex: q, $options: 'i' } },
        '_id'
      )
      const userIds = users.map((user) => user._id)

      // 2. Build the main query
      const songs = await Song.find({
        $and: [
          {
            $or: [
              { 'metadata.title': { $regex: q, $options: 'i' } },
              { 'metadata.artist': { $in: userIds } },
              { 'metadata.collaborators': { $in: userIds } },
              { 'metadata.tags': { $regex: q, $options: 'i' } },
              { 'metadata.genre': { $regex: q, $options: 'i' } },
            ],
          },
          {
            $or: [
              { visibility: 'public' },
              { visibility: 'private', 'metadata.artist': user._id },
            ],
          },
        ],
      })
        .populate('metadata.artist', 'displayName')
        .populate('metadata.album', 'title coverUrl')
        .populate('metadata.collaborators', 'displayName')
        .sort({ createdAt: sort === 'Ascending' ? 1 : -1 })
        .skip(skip)
        .limit(limit)

      const songsToShow = songs

      const total = songsToShow.length

      res.json({
        songs: songsToShow,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalSongs: total,
      })
    } catch (error) {
      next(error)
    }
  }
)
// search playlists by matching pattern
router.get(
  '/playlists',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }

      const query = req.query.q as string
      const sort = (req.query.sort as string) ?? 'Descending'
      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 10
      const skip = (page - 1) * limit

      if (!query || query.trim().length === 0) {
        throw new CustomError('Search query is required', 400)
      }

      if (limit > 50) {
        throw new CustomError('Limit cannot exceed 50', 400)
      }

      const searchQuery = query.trim()

      // First, find users that match the search query
      const matchingUsers = await User.find({
        displayName: { $regex: searchQuery, $options: 'i' },
      })
        .select('_id')
        .limit(100) // Limit to prevent too many user IDs

      const matchingUserIds = matchingUsers.map((user) => user._id)

      // Build comprehensive search filter
      const searchFilter = {
        $and: [
          // Search criteria - title, description, tags, or creator/collaborator names
          {
            $or: [
              { title: { $regex: searchQuery, $options: 'i' } },
              { description: { $regex: searchQuery, $options: 'i' } },
              {
                'songs.songId': {
                  $in: await Song.find(
                    { 'metadata.title': { $regex: query, $options: 'i' } },
                    '_id'
                  ).then((songs) => songs.map((song) => song._id)),
                },
              },
              {
                'songs.songId': {
                  $in: await Song.find(
                    { 'metadata.tags': { $regex: query, $options: 'i' } },
                    '_id'
                  ).then((songs) => songs.map((song) => song._id)),
                },
              },
              {
                'songs.songId': {
                  $in: await Song.find(
                    { 'metadata.genre': { $regex: query, $options: 'i' } },
                    '_id'
                  ).then((songs) => songs.map((song) => song._id)),
                },
              },
              ...(matchingUserIds.length > 0
                ? [
                    { creator: { $in: matchingUserIds } },
                    { collaborators: { $in: matchingUserIds } },
                  ]
                : []),
            ],
          },
          // Smart visibility logic
          {
            $or: [
              { visibility: 'public' },
              {
                $and: [
                  { visibility: 'private' },
                  {
                    $or: [{ creator: user._id }, { collaborators: user._id }],
                  },
                ],
              },
            ],
          },
        ],
      }

      // Get results with parallel queries
      const [playlists, totalPlaylists] = await Promise.all([
        Playlist.find(searchFilter)
          .populate('creator', 'displayName email')
          .populate('collaborators', 'displayName email')
          .populate({
            path: 'songs.songId',
            select: 'metadata hlsUrl coverArtUrl duration status',
            populate: [
              {
                path: 'metadata.artist',
                select: 'displayName',
              },
              {
                path: 'metadata.collaborators',
                select: 'displayName',
              },
            ],
          })
          .populate('songs.addedBy', 'displayName')
          .sort({ createdAt: sort === 'Ascending' ? 1 : -1 })
          .skip(skip)
          .limit(limit),
        Playlist.countDocuments(searchFilter),
      ])

      const totalPages = Math.ceil(totalPlaylists / limit)

      res.status(200).json({
        message: 'playlist search completed successfully',
        data: {
          playlists: playlists,
          pagination: {
            currentPage: page,
            totalPages,
            totalPlaylists,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
            limit,
          },
          searchQuery,
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

// search artist by display name
router.get(
  '/artists',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }
      const { q } = req.query
      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 10
      const skip = (page - 1) * limit

      if (!q || typeof q !== 'string') {
        throw new CustomError('Search query "q" is required', 400)
      }
      const artists = await User.find(
        { displayName: { $regex: q, $options: 'i' } },
        '_id displayName'
      )
        .limit(limit)
        .skip(skip)

      const totalArtists = await User.countDocuments({
        displayName: { $regex: q, $options: 'i' },
      })
      console.log('Total artists found:', totalArtists)
      const totalPages = Math.ceil(totalArtists / limit)
      res.status(200).json({
        message: 'Artist search completed successfully',
        data: {
          artists,
          pagination: {
            currentPage: page,
            totalPages,
            totalArtists,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
            limit,
          },
          searchQuery: q,
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

router.get(
  '/all',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }
      const { q } = req.query

      if (!q || typeof q !== 'string') {
        throw new CustomError('Search query "q" is required', 400)
      }

      // 1. Search for artists/collaborators by name
      const users = await User.find(
        { displayName: { $regex: q, $options: 'i' } },
        '_id'
      ).populate('displayName')

      const albumsByQ = await Album.find(
        { title: { $regex: q, $options: 'i' } },
        '_id title artist collaborators'
      ).populate([
        { path: 'artist', select: 'displayName' },
        { path: 'collaborators', select: 'displayName' },
      ])
      const albumIds = albumsByQ.map((album) => album._id)

      const userIds = users.map((user) => user._id)

      // 2. Build the main query for albums
      const albumQuery = {
        $and: [
          {
            $or: [
              { title: { $regex: q, $options: 'i' } },
              { artist: { $in: userIds } },
              { collaborators: { $in: userIds } },
              { tags: { $regex: q, $options: 'i' } },
              { genre: { $regex: q, $options: 'i' } },
            ],
          },
          {
            $or: [
              { visibility: 'public' },
              { visibility: 'private', artist: user.id },
            ],
          },
        ],
      }

      // 3. Build the main query for songs
      const songQuery = {
        $and: [
          {
            $or: [
              { 'metadata.title': { $regex: q, $options: 'i' } },
              { 'metadata.artist': { $in: userIds } },
              { 'metadata.collaborators': { $in: userIds } },
              { 'metadata.album': { $in: albumIds } },
              { 'metadata.tags': { $regex: q, $options: 'i' } },
              { 'metadata.genre': { $regex: q, $options: 'i' } },
            ],
          },
          {
            $or: [
              { visibility: 'public' },
              { visibility: 'private', 'metadata.artist': user._id },
            ],
          },
        ],
      }

      // 4. Build the main query for playlists
      const playlistQuery = {
        $and: [
          {
            $or: [
              { title: { $regex: q, $options: 'i' } },
              { description: { $regex: q, $options: 'i' } },
              { creator: { $in: userIds } },
              { collaborators: { $in: userIds } },
              {
                'songs.songId': {
                  $in: await Song.find(
                    { 'metadata.title': { $regex: q, $options: 'i' } },
                    '_id'
                  ).then((songs) => songs.map((song) => song._id)),
                },
              },
              {
                'songs.songId': {
                  $in: await Song.find(
                    { 'metadata.tags': { $regex: q, $options: 'i' } },
                    '_id'
                  ).then((songs) => songs.map((song) => song._id)),
                },
              },
              {
                'songs.songId': {
                  $in: await Song.find(
                    { 'metadata.genre': { $regex: q, $options: 'i' } },
                    '_id'
                  ).then((songs) => songs.map((song) => song._id)),
                },
              },
            ],
          },
          {
            $or: [
              { visibility: 'public' },
              {
                $and: [
                  { visibility: 'private' },
                  {
                    $or: [{ creator: user._id }, { collaborators: user._id }],
                  },
                ],
              },
            ],
          },
        ],
      }

      const [albums, songs, playlists] = await Promise.all([
        Album.find(albumQuery)
          .populate('artist', 'displayName')
          .populate('collaborators', 'displayName')
          .populate({
            path: 'songs',
            populate: [
              {
                path: 'metadata.artist',
                select: 'displayName',
              },
              {
                path: 'metadata.album',
                select: 'title',
              },
            ],
          })
          .sort({ createdAt: -1 })
          .limit(5),
        Song.find(songQuery)
          .populate('metadata.artist', 'displayName')
          .populate('metadata.album', 'title coverUrl')
          .populate('metadata.collaborators', 'displayName')
          .sort({ createdAt: -1 })
          .limit(5),
        Playlist.find(playlistQuery)
          .populate('creator', 'displayName')
          .populate('collaborators', 'displayName')
          .populate({
            path: 'songs.songId',
            select: 'metadata hlsUrl coverArtUrl duration status',
            populate: [
              {
                path: 'metadata.artist',
                select: 'displayName',
              },
              {
                path: 'metadata.collaborators',
                select: 'displayName',
              },
            ],
          })
          .populate('songs.addedBy', 'displayName')
          .sort({ createdAt: -1 })
          .limit(5),
      ])
      const responseAlbums = albums.map((album) => ({
        likedBy: album.likedBy.length,
        isLikedByCurrentUser: req.user?.id
          ? album.likedBy.includes(req.user.id)
          : false,
        ...album.toObject(),
      }))

      const responseSongs = songs.map((song) => ({
        likedBy: song.metadata.likedBy.length,
        isLikedByCurrentUser: song.metadata.likedBy.includes(user.id),
        ...song.toObject(),
      }))
      const responsePlaylists = playlists.map((playlist) => ({
        likedBy: playlist.likedBy?.length || 0,
        isLikedByCurrentUser: playlist.likedBy?.includes(user.id) || false,
        ...playlist.toObject(),
      }))

      res.json({
        albums: responseAlbums,
        songs: responseSongs,
        playlists: responsePlaylists,
        artists: users.map((user) => ({
          _id: user._id,
          displayName: user.displayName,
        })),
      })
    } catch (error) {
      next(error)
    }
  }
)

export { router as searchRouter }
