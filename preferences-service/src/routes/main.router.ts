import { Router } from 'express'
import { syncRouter } from './sync/sync.router'
import { commentsRouter } from './comments/comments.router'

const router = Router()

router.use('/sync', syncRouter)
router.use('/comments', commentsRouter)

export { router as mainRouter }
