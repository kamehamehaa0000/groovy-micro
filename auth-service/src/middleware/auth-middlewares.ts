import { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { CustomError } from '@groovy-streaming/common'

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string
    email: string
    isEmailVerified: boolean
    [key: string]: any
  }
  userId?: string
}
declare global {
  namespace Express {
    interface User {
      id: string
      email: string
      isEmailVerified: boolean
      [key: string]: any
    }
  }
}
export interface AuthOptions {
  required?: boolean // If false, middleware won't throw error for missing token
}

export const authenticate = (options: AuthOptions = { required: true }) => {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      let token: string | undefined

      // Try Authorization header first (Bearer token)
      const authHeader = req.headers.authorization
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7) //removes starting 'Bearer ' part
      }

      // Fallback to cookies (for browser requests)
      if (!token && req.cookies?.accessToken) {
        token = req.cookies.accessToken
      }

      if (!token) {
        if (options.required) {
          return next(
            new CustomError('Access token is required', 401, 'Unauthorized')
          )
        } else return next()
      }

      // Verify token
      const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET
      if (!JWT_ACCESS_SECRET) {
        throw new Error('JWT_ACCESS_SECRET is not configured')
      }
      const decoded = jwt.verify(token, JWT_ACCESS_SECRET) as jwt.JwtPayload

      // Attach user info to request
      req.user = {
        id: decoded.sub as string,
        email: decoded.email,
        isEmailVerified: decoded.isEmailVerified,
        iat: decoded.iat,
        exp: decoded.exp,
      }
      req.userId = decoded.sub as string

      console.log(`Authenticated user: ${JSON.stringify(req.user)}`)
      next()
    } catch (error) {
      console.error('Authentication error:', error)

      if (error instanceof jwt.TokenExpiredError) {
        return next(
          new CustomError('Access token has expired', 401, 'Token Expired')
        )
      }

      if (error instanceof jwt.JsonWebTokenError) {
        return next(
          new CustomError('Invalid access token', 401, 'Invalid Token')
        )
      }

      return next(
        new CustomError('Authentication failed', 401, 'Authentication Error')
      )
    }
  }
}

export const optionalAuth = authenticate({ required: false })
export const requireAuth = authenticate({ required: true })
