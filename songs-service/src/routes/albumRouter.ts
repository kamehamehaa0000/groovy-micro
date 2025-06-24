import { NextFunction, Router, Request, Response } from 'express'

const router = Router()

router.post(
  'upload/presigned/album',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({
        message: 'Presigned URLs for album upload generated successfully',
      })
    } catch (error) {
      next(error)
    }
  }
)
