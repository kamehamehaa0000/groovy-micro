import { Router } from 'express'
import { singleRouter } from './single.router'
import { AlbumRouter } from './album.router'

import { syncRouter } from './sync/sync.router'
import { playlistRouter } from './playlist.router'

const router = Router()

router.use('/songs', singleRouter)
router.use('/albums', AlbumRouter)
router.use('/playlists', playlistRouter)
router.use('/sync', syncRouter)

export { router as mainRouter }
