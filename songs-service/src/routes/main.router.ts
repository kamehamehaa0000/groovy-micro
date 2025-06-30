import { Router } from 'express'
import { singleRouter } from './single.router'
import { AlbumRouter } from './album.router'

const router = Router()

router.use('/songs', singleRouter)
router.use('/albums', AlbumRouter)

export { router as mainRouter }
