import { Router } from 'express'
import { syncRouter } from './sync/sync.router'

const router = Router()

router.use('/sync', syncRouter)

export { router as mainRouter }
