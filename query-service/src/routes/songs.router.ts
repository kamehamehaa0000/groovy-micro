import {
  AuthenticatedRequest,
  CustomError,
  optionalAuth,
  requireAuth,
} from '@groovy-streaming/common'
import { Router, Response, NextFunction } from 'express'
import { Song } from '../models/Song.model'

import User from '../models/User.model'

const router = Router()
// fetch songs by genre, tags, or collaborators
router.get(
  '/songs/filter',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      console.log('Query params:', req.query)
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }

      const { genre, tags, collaborators } = req.query
      const sort = (req.query.sort as string) ?? 'Descending'
      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 20
      const skip = (page - 1) * limit

      const filter: any = { visibility: 'public' }

      if (genre) {
        filter['metadata.genre'] = genre as string
      }
      if (tags) {
        filter['metadata.tags'] = { $in: (tags as string).split(',') }
      }
      if (collaborators) {
        filter['metadata.collaborators'] = {
          $in: (collaborators as string).split(','),
        }
      }

      const songs = await Song.find(filter)
        .populate('metadata.artist', 'displayName')
        .populate('metadata.album', 'title coverUrl')
        .populate('metadata.collaborators', 'displayName')
        .where({ visibility: { $ne: 'private' } })
        .sort({ createdAt: sort === 'Ascending' ? 1 : -1 })
        .skip(skip)
        .limit(limit)

      const total = await Song.countDocuments(filter)

      res.json({
        songs,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalSongs: total,
      })
    } catch (error) {
      next(error)
    }
  }
)
// search songs by matching pattern (title, artist, or collaborator name)
router.get(
  '/songs/search',
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
// fetch song by id
router.get(
  '/song/:songId',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }

      const { songId } = req.params

      const song = await Song.findById(songId)
        .populate('metadata.artist', 'displayName')
        .populate('metadata.album', 'title coverUrl')
        .populate('metadata.collaborators', 'displayName')

      if (!song) {
        throw new CustomError('Song not found', 404)
      }
      console.log(song.metadata)
      if (
        song.visibility !== 'public' &&
        song.metadata.artist.toString() !== user.id.toString()
      ) {
        throw new CustomError(
          'You do not have permission to view this song',
          403
        )
      }

      res.json({
        likedBy: song.metadata.likedBy.length,
        isLikedByCurrentUser: song.metadata.likedBy.includes(user.id),
        ...song.toObject(),
      })
    } catch (error) {
      next(error)
    }
  }
)
// fetch songs by artistId
router.get(
  '/songs/artist/:artistId',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }

      const { artistId } = req.params
      if (!artistId) {
        throw new CustomError('Artist ID is required', 400)
      }

      const sort = (req.query.sort as string) ?? 'Descending'
      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 20
      const skip = (page - 1) * limit

      const filter: any = { 'metadata.artist': artistId }

      // Only add visibility filter if the requesting user is not the artist
      if (user._id.toString() !== artistId) {
        filter.visibility = 'public'
      }

      const songs = await Song.find(filter)
        .populate('metadata.artist', 'displayName')
        .populate('metadata.album', 'title coverUrl')
        .populate('metadata.collaborators', 'displayName')
        .sort({ createdAt: sort === 'Ascending' ? 1 : -1 })
        .skip(skip)
        .limit(limit)

      const total = await Song.countDocuments(filter)
      const songsData = songs.map((song) => ({
        likeBy: song.metadata.likedBy.length,
        isLikeByCurrentUser: song.metadata.likedBy.includes(user._id),
        ...song,
      }))

      res.json({
        songs: songsData,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalSongs: total,
      })
    } catch (error) {
      next(error)
    }
  }
)
// fetch songs by current user
router.get(
  '/songs/me',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }
      const sort = (req.query.sort as string) ?? 'Descending'
      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 20
      const skip = (page - 1) * limit

      const songs = await Song.find({ 'metadata.artist': user.id })
        .populate('metadata.artist', 'displayName')
        .populate('metadata.album', 'title coverUrl')
        .populate('metadata.collaborators', 'displayName')
        .sort({ createdAt: sort === 'Ascending' ? 1 : -1 })
        .skip(skip)
        .limit(limit)

      const total = await Song.countDocuments({ 'metadata.artist': user.id })
      const songsData = songs.map((song) => ({
        likeBy: song.metadata.likedBy.length,
        isLikeByCurrentUser: song.metadata.likedBy.includes(user._id),
        ...song,
      }))
      res.json({
        songs: songsData,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalSongs: total,
      })
    } catch (error) {
      next(error)
    }
  }
)
// get all public songs
router.get(
  '/all/public',
  optionalAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const sort = (req.query.sort as string) ?? 'Descending'
      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 20
      const skip = (page - 1) * limit

      const songs = await Song.find({ visibility: 'public' })
        .populate('metadata.artist', 'displayName')
        .populate('metadata.album', 'title coverUrl')
        .populate('metadata.collaborators', 'displayName')
        .sort({ createdAt: sort === 'Ascending' ? 1 : -1 })
        .skip(skip)
        .limit(limit)

      const total = await Song.countDocuments({ visibility: 'public' })
      const songsData = songs.map((song) => ({
        likedBy: song.metadata?.likedBy?.length,
        isLikedByCurrentUser: req.user?.id
          ? song.metadata?.likedBy?.includes(req.user.id)
          : false,
        ...song.toObject(),
      }))
      res.json({
        songs: songsData,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalSongs: total,
      })
    } catch (error) {
      next(error)
    }
  }
)
// get all private songs
router.get(
  '/songs/all/private',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }
      const { id: userId } = user
      console.log(user)
      const sort = (req.query.sort as string) ?? 'Descending'
      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 20
      const skip = (page - 1) * limit

      const songs = await Song.find({
        'metadata.artist': userId,
        visibility: 'private',
      })
        .populate('metadata.artist', 'displayName')
        .populate('metadata.album', 'title coverUrl')
        .populate('metadata.collaborators', 'displayName')
        .sort({ createdAt: sort === 'Ascending' ? 1 : -1 })
        .skip(skip)
        .limit(limit)

      const total = await Song.countDocuments({
        'metadata.artist': userId,
        visibility: 'private',
      })

      const songsData = songs.map((song) => ({
        likeBy: song.metadata.likedBy.length,
        isLikeByCurrentUser: song.metadata.likedBy.includes(user._id),
        ...song,
      }))

      res.json({
        songs: songsData,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalSongs: total,
      })
    } catch (error) {
      next(error)
    }
  }
)
export { router as songsRouter }
