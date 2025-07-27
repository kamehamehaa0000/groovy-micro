import {
  AuthenticatedRequest,
  CustomError,
  optionalAuth,
  requireAuth,
} from '@groovy-streaming/common'
import { Router, Response, NextFunction } from 'express'
import { Song } from '../models/Song.model'

const router = Router()

// fetch songs by genre, tags, or collaborators
router.get(
  '/genre',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }
      const { genre } = req.query
      const sort = (req.query.sort as string) ?? 'Descending'
      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 20
      const skip = (page - 1) * limit
      
      const filter: any = { visibility: 'public' }
      if (genre) {
        filter['metadata.genre'] = genre as string
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
        likedBy: song.metadata.likedBy.length,
        isLikedByCurrentUser: song.metadata.likedBy.includes(user.id),
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
