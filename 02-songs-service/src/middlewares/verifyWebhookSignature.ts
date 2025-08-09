import crypto from 'crypto'
import { Request, Response, NextFunction } from 'express'

export const verifyWebhookSignature = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const signature = req.headers['x-signature'] as string
    const timestamp = req.headers['x-timestamp'] as string
    const service = req.headers['x-service'] as string

    if (!signature || !timestamp || service !== 'hls-worker') {
      return res.status(401).json({ error: 'Missing or invalid headers' })
    }

    // Check timestamp (prevent replay attacks)
    const currentTime = Date.now()
    const requestTime = parseInt(timestamp)
    const timeDiff = Math.abs(currentTime - requestTime)

    if (timeDiff > 300000) {
      return res.status(401).json({ error: 'Request timestamp too old' })
    }

    // Verify signature
    const payload = JSON.stringify(req.body)
    const expectedSignature = crypto
      .createHmac('sha256', process.env.WEBHOOK_SECRET!)
      .update(payload)
      .digest('hex')

    const providedSignature = signature.replace('sha256=', '')

    if (
      !crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'hex'),
        Buffer.from(providedSignature, 'hex')
      )
    ) {
      return res.status(401).json({ error: 'Invalid signature' })
    }

    next()
  } catch (error) {
    return res.status(401).json({ error: 'Authentication failed' })
  }
}

// Use the middleware on your webhook endpoint
