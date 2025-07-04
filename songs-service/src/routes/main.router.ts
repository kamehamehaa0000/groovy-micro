import { Router } from 'express'
import { singleRouter } from './song/single.router'
import { AlbumRouter } from './album/album.router'
import { queryRouter } from './song/query-single.router'
import { queryAlbumRouter } from './album/query-album.router'
import { syncRouter } from './sync/sync.router'
import { playlistRouter } from './playlist/playlist.router'

const router = Router()

router.use('/songs', singleRouter)
router.use('/albums', AlbumRouter)
router.use('/playlists', playlistRouter)
router.use('/query/single', queryRouter)
router.use('/query/album', queryAlbumRouter)
router.use('/sync', syncRouter)

export { router as mainRouter }
