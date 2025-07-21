import {
  AuthenticatedRequest,
  CustomError,
  optionalAuth,
  requireAuth,
} from '@groovy-streaming/common'
import { Playlist } from '../models/Playlist.model'
import { User } from '../models/User.model'
import { Response, NextFunction, Router } from 'express'

const router = Router()

// get all public playlists
router.get(
  '/get/all/public',
  optionalAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req as AuthenticatedRequest
      const userId = user ? user.id : null

      const sort = (req.query.sort as string) ?? 'Ascending'
      const page = parseInt(req.query.page as string) ?? 1
      const limit = parseInt(req.query.limit as string) ?? 10
      const skip = (page - 1) * limit

      const playlists = await Playlist.find({ visibility: 'public' })
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
        .sort({ createdAt: sort === 'Ascending' ? 1 : -1 })
        .skip(skip)
        .limit(limit)

      const playlistData = playlists.map((playlist) => {
        return {
          likedBy: playlist.likedBy.length,
          likedByCurrentUser: userId ? playlist.likedBy.includes(userId) : false,
          ...playlist.toObject(),
        }
      })

      res.status(200).json({ playlists: playlistData })
    } catch (error) {
      next(error)
    }
  }
)

// get all playlists by current user
router.get(
  '/me',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }
      const sort = (req.query.sort as string) ?? 'Ascending'
      const page = parseInt(req.query.page as string) ?? 1
      const limit = parseInt(req.query.limit as string) ?? 10
      const skip = (page - 1) * limit

      const playlists = await Playlist.find({ creator: user.id })
        .sort({ createdAt: sort === 'Ascending' ? 1 : -1 })
        .skip(skip)
        .limit(limit)
      const playlistData = playlists.map((playlist) => {
        return {
          likedBy: playlist.likedBy.length,
          likedByCurrentUser: playlist.likedBy.includes(user.id),
          ...playlist.toObject(),
        }
      })
      res.status(200).json({ playlists: playlistData })
    } catch (error) {
      next(error)
    }
  }
)

// get playlist by id
router.get(
  '/playlist/id/:playlistId',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }

      const { playlistId } = req.params
      if (!playlistId) {
        throw new CustomError('Playlist ID is required', 400)
      }

      const playlist = await Playlist.findById(playlistId)
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

      res.status(200).json({
        likedBy: playlist.likedBy.length,
        likedByCurrentUser: playlist.likedBy.includes(user.id),
        ...playlist.toObject(),
      })
    } catch (error) {
      next(error)
    }
  }
)

// get public playlists where user is either creator or collaborator
router.get(
  '/user/:userId/public',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }
      const sort = (req.query.sort as string) ?? 'Ascending'
      const page = parseInt(req.query.page as string) ?? 1
      const limit = parseInt(req.query.limit as string) ?? 10
      const skip = (page - 1) * limit

      const { userId } = req.params
      if (!userId) {
        throw new CustomError('User ID is required', 400)
      }

      // Validate that the user exists
      const targetUser = await User.findById(userId).select('_id displayName')
      if (!targetUser) {
        throw new CustomError('User not found', 404)
      }

      // Find playlists where user is creator OR collaborator AND visibility is public
      const playlists = await Playlist.find({
        $and: [
          { visibility: 'public' },
          {
            $or: [{ creator: userId }, { collaborators: userId }],
          },
        ],
      })
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
        .limit(limit)

      // Add role information to each playlist
      const playlistsWithRoles = playlists.map((playlist) => {
        const isCreator = playlist.creator === userId
        const isCollaborator = playlist.collaborators?.some(
          (collaborator: any) => collaborator._id.toString() === userId
        )
        const userRole = isCreator
          ? 'creator'
          : isCollaborator
          ? 'collaborator'
          : null

        return {
          ...playlist.toObject(),
          userRole: userRole,
        }
      })

      res.status(200).json({
        message: 'Public playlists retrieved successfully',
        data: {
          user: {
            id: targetUser._id,
            displayName: targetUser.displayName,
          },
          playlists: playlistsWithRoles,
          totalCount: playlistsWithRoles.length,
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

// get public playlists where user is creator
router.get(
  '/user/:userId/created/public',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }

      const { userId } = req.params
      if (!userId) {
        throw new CustomError('User ID is required', 400)
      }
      const sort = (req.query.sort as string) ?? 'Ascending'
      const page = parseInt(req.query.page as string) ?? 1
      const limit = parseInt(req.query.limit as string) ?? 20
      const skip = (page - 1) * limit

      // Validate that the user exists
      const targetUser = await User.findById(userId).select('_id displayName')
      if (!targetUser) {
        throw new CustomError('User not found', 404)
      }

      // Find playlists created by the user that are public
      const playlists = await Playlist.find({
        creator: userId,
        visibility: 'public',
      })
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
        .limit(limit)

      res.status(200).json({
        message: 'Public playlists created by user retrieved successfully',
        data: {
          user: {
            id: targetUser._id,
            displayName: targetUser.displayName,
          },
          playlists,
          totalCount: playlists.length,
          role: 'creator',
        },
      })
    } catch (error) {
      next(error)
    }
  }
)
// get public playlists where user is a collaborator
router.get(
  '/user/:userId/collaborated/public',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError('User not authenticated', 401)
      }

      const { userId } = req.params
      if (!userId) {
        throw new CustomError('User ID is required', 400)
      }
      const sort = (req.query.sort as string) ?? 'Ascending'
      const page = parseInt(req.query.page as string) ?? 1
      const limit = parseInt(req.query.limit as string) ?? 10
      const skip = (page - 1) * limit

      // Validate that the user exists
      const targetUser = await User.findById(userId).select('_id displayName')
      if (!targetUser) {
        throw new CustomError('User not found', 404)
      }

      // Find playlists where user is a collaborator and visibility is public
      const playlists = await Playlist.find({
        collaborators: userId,
        visibility: 'public',
      })
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
        .limit(limit)

      res.status(200).json({
        message: 'Public playlists collaborated by user retrieved successfully',
        data: {
          user: {
            id: targetUser._id,
            displayName: targetUser.displayName,
          },
          playlists,
          totalCount: playlists.length,
          role: 'collaborator',
        },
      })
    } catch (error) {
      next(error)
    }
  }
)
// search playlists by title or description or creator/collaborators name
router.get(
  '/search',
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
              { tags: { $regex: searchQuery, $options: 'i' } },
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

export { router as playlistRouter }
