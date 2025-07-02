import { Router } from 'express'
import { singleRouter } from './single.router'
import { AlbumRouter } from './album.router'
import { updateRouter } from './update.router'

const router = Router()

router.use('/songs', singleRouter)
router.use('/albums', AlbumRouter)
router.use('/update', updateRouter)

export { router as mainRouter }
