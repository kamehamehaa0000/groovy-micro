import { Router } from 'express'
import { singleRouter } from './single.router'
import { AlbumRouter } from './album.router'
import { updateRouter } from './update.router'
import { queryRouter } from './query-single.router'
import { queryAlbumRouter } from './query-album.router'

const router = Router()

router.use('/songs', singleRouter)
router.use('/albums', AlbumRouter)
router.use('/update', updateRouter)
router.use('/query/single', queryRouter)
router.use('/query/album', queryAlbumRouter)

export { router as mainRouter }
