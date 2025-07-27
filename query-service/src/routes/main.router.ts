import { Router } from 'express'
import { songsRouter } from './songs.router'
import { albumRouter } from './albums.router'
import { playlistRouter } from './playlist.router'
import { libraryRouter } from './libraries.router'
import { searchRouter } from './search.router'

const router = Router()
router.use('/songs', songsRouter)
router.use('/playlists', playlistRouter)
router.use('/albums', albumRouter)
router.use('/comments', songsRouter)
router.use('/libraries', libraryRouter)
router.use('/search', searchRouter)
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    service: 'comments-service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  })
})
export { router as mainRouter }
