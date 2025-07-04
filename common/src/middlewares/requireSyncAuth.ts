import { NextFunction, Request, Response } from 'express'

export const requireSyncAuth = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const syncApiKey = req.headers['x-sync-api-key']
  if (syncApiKey !== process.env.SYNC_API_KEY) {
    res.status(401).json({ message: 'Unauthorized' })
    return
  }
  next()
}
