import { Router, Response, NextFunction } from 'express'
const router = Router()
import {
  AuthenticatedRequest,
  CustomError,
  requireAuth,
} from '@groovy-streaming/common'
import Library from '../models/Library.model'
import { Album } from '../models/Album.model'
import { v4 } from 'uuid'
import { SongServiceEventPublisher } from '../events/song-event-publisher'
// Add song to recently played
router.post(
  '/add/recently-played/song/:songId',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req

      if (!user) {
        throw new CustomError(
          'User not authenticated',
          401,
          'User must be logged in to like a song'
        )
      }
      const { songId } = req.params
      const userLibrary = await Library.findOne({ userId: user.id })
      if (!userLibrary) {
        const newLibraryId = await v4()
        const newLibrary = await Library.create({
          _id: newLibraryId,
          userId: user.id,
        })
        newLibrary.recentlyPlayed.push(songId)
        await newLibrary.save()
        await SongServiceEventPublisher.LibraryCreatedEvent({
          LibraryId: newLibraryId,
          recentlyPlayed: newLibrary.recentlyPlayed,
          listenLater: newLibrary.listenLater,
          userId: newLibrary.userId,
        })
      } else {
        if (!userLibrary.recentlyPlayed.includes(songId)) {
          userLibrary.recentlyPlayed.push(songId)
          await userLibrary.save()
          await SongServiceEventPublisher.LibraryUpdatedEvent({
            LibraryId: userLibrary._id,
            recentlyPlayed: userLibrary.recentlyPlayed,
            listenLater: userLibrary.listenLater,
            userId: userLibrary.userId,
          })
        }
      }
      res
        .status(200)
        .json({ message: 'Song successfully added to recently played', songId })
    } catch (error) {
      next(error)
    }
  }
)
// Add song to listen later
router.post(
  '/add/listen-later/song/:songId',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError(
          'User not authenticated',
          401,
          'User must be logged in to like a song'
        )
      }
      const { songId } = req.params
      const userLibrary = await Library.findOne({ userId: user.id })
      if (!userLibrary) {
        const newLibraryId = await v4()
        const newLibrary = await Library.create({
          _id: newLibraryId,
          userId: user.id,
        })
        newLibrary.listenLater.push(songId)
        await newLibrary.save()
        await SongServiceEventPublisher.LibraryCreatedEvent({
          LibraryId: newLibraryId,
          recentlyPlayed: newLibrary.recentlyPlayed,
          listenLater: newLibrary.listenLater,
          userId: newLibrary.userId,
        })
      } else {
        if (!userLibrary.listenLater.includes(songId)) {
          userLibrary.listenLater.push(songId)
          await userLibrary.save()
          await SongServiceEventPublisher.LibraryUpdatedEvent({
            LibraryId: userLibrary._id,
            recentlyPlayed: userLibrary.recentlyPlayed,
            listenLater: userLibrary.listenLater,
            userId: userLibrary.userId,
          })
        }
      }
      res
        .status(200)
        .json({ message: 'Song successfully added to listen later' })
    } catch (error) {
      next(error)
    }
  }
)
// Add album to listen later
router.post(
  'add/listen-later/album/:albumId',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError(
          'User not authenticated',
          401,
          'User must be logged in to like a song'
        )
      }
      const { albumId } = req.params
      if (!albumId) {
        throw new CustomError(
          'Album ID is required',
          400,
          'Please provide a valid album ID'
        )
      }
      const album = await Album.findById(albumId)
      if (!album) {
        throw new CustomError(
          'Album not found',
          404,
          'The specified album does not exist'
        )
      }
      const userLibrary = await Library.findOne({ userId: user.id })
      if (!userLibrary) {
        const newLibrary = await Library.create({
          userId: user.id,
        })

        album.songs.forEach((songId: string) => {
          if (!newLibrary.listenLater.includes(songId)) {
            newLibrary.listenLater.push(songId)
          }
        })
        await newLibrary.save()
        await SongServiceEventPublisher.LibraryCreatedEvent({
          LibraryId: newLibrary._id,
          recentlyPlayed: newLibrary.recentlyPlayed,
          listenLater: newLibrary.listenLater,
          userId: newLibrary.userId,
        })
      } else {
        album.songs.forEach((songId: string) => {
          if (!userLibrary.listenLater.includes(songId)) {
            userLibrary.listenLater.push(songId)
          }
        })
        await userLibrary.save()
        await SongServiceEventPublisher.LibraryUpdatedEvent({
          LibraryId: userLibrary._id,
          recentlyPlayed: userLibrary.recentlyPlayed,
          listenLater: userLibrary.listenLater,
          userId: userLibrary.userId,
        })
      }
      res
        .status(200)
        .json({ message: 'Song successfully added to listen later' })
    } catch (error) {
      next(error)
    }
  }
)
// Remove song from listen later
router.patch(
  'remove/listen-later/song/:songId',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError(
          'User not authenticated',
          401,
          'User must be logged in to like a song'
        )
      }
      const { songId } = req.params
      const userLibrary = await Library.findOne({ userId: user.id })
      if (!userLibrary) {
        const newLibraryId = await v4()
        const newLibrary = await Library.create({
          _id: newLibraryId,
          userId: user.id,
        })
        newLibrary.listenLater.push(songId)
        await newLibrary.save()
        await SongServiceEventPublisher.LibraryCreatedEvent({
          LibraryId: newLibraryId,
          recentlyPlayed: newLibrary.recentlyPlayed,
          listenLater: newLibrary.listenLater,
          userId: newLibrary.userId,
        })
      } else if (!userLibrary.listenLater.includes(songId)) {
        userLibrary.listenLater = userLibrary.listenLater.filter(
          (id) => id !== songId
        )
        await userLibrary.save()
        await SongServiceEventPublisher.LibraryUpdatedEvent({
          LibraryId: userLibrary._id,
          recentlyPlayed: userLibrary.recentlyPlayed,
          listenLater: userLibrary.listenLater,
          userId: userLibrary.userId,
        })
      }
      res
        .status(200)
        .json({ message: 'Song successfully added to listen later', songId })
    } catch (error) {
      next(error)
    }
  }
)
// Remove album from listen later
router.patch(
  'remove/listen-later/album/:albumId',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { user } = req
      if (!user) {
        throw new CustomError(
          'User not authenticated',
          401,
          'User must be logged in to like a song'
        )
      }
      const { albumId } = req.params
      const album = await Album.findById(albumId)
      if (!albumId) {
        throw new CustomError(
          'Album ID is required',
          400,
          'Please provide a valid album ID'
        )
      }
      if (!album) {
        throw new CustomError(
          'Album not found',
          404,
          'The specified album does not exist'
        )
      }
      const userLibrary = await Library.findOne({ userId: user.id })
      if (!userLibrary) {
        const newLibraryId = await v4()
        const newLibrary = await Library.create({
          _id: newLibraryId,
          userId: user.id,
        })
        const songIdsToRemove = new Set(album.songs)
        newLibrary.listenLater = newLibrary.listenLater.filter(
          (id) => !songIdsToRemove.has(id)
        )
        await newLibrary.save()
        await SongServiceEventPublisher.LibraryCreatedEvent({
          LibraryId: newLibraryId,
          recentlyPlayed: newLibrary.recentlyPlayed,
          listenLater: newLibrary.listenLater,
          userId: newLibrary.userId,
        })
      } else {
        const songIdsToRemove = new Set(album.songs)
        userLibrary.listenLater = userLibrary.listenLater.filter(
          (id) => !songIdsToRemove.has(id)
        )
        await userLibrary.save()
        await SongServiceEventPublisher.LibraryUpdatedEvent({
          LibraryId: userLibrary._id,
          recentlyPlayed: userLibrary.recentlyPlayed,
          listenLater: userLibrary.listenLater,
          userId: userLibrary.userId,
        })
      }
      res
        .status(200)
        .json({ message: 'Song successfully added to listen later' })
    } catch (error) {
      next(error)
    }
  }
)

export { router as libraryRouter }
