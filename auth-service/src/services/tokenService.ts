import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import User, { IUser } from '../models/User.model'
import { config, configDotenv } from 'dotenv'
import { EnumMagicLinkType } from '../types'
import { Response } from 'express'

configDotenv({
  path: '.env',
})
config({
  path: '.env',
})

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET!
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!
const JWT_ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN!
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN!
const MAGIC_LINK_SECRET = process.env.MAGIC_LINK_SECRET!
const MAGIC_LINK_EXPIRES_IN = process.env.MAGIC_LINK_EXPIRES_IN!
const MAX_REFRESH_TOKENS_PER_USER = parseInt(
  process.env.MAX_REFRESH_TOKENS_PER_USER ?? '5'
)
export const generateAccessToken = (userId: string): string => {
  return jwt.sign({ sub: userId }, JWT_ACCESS_SECRET, {
    expiresIn: JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  })
}

export const generateRefreshToken = async (
  userId: string,
  ipAddress?: string
): Promise<string> => {
  // Generate token values
  const refreshTokenValue = crypto.randomBytes(40).toString('hex')
  const expires = new Date(
    Date.now() + parseInt(JWT_REFRESH_EXPIRES_IN) * 24 * 60 * 60 * 1000
  ) // Assuming JWT_REFRESH_EXPIRES_IN is in days like '7d'

  // The new token to add
  const newToken = {
    token: refreshTokenValue,
    expires,
    ipAddress,
  }

  // Use findOneAndUpdate with aggregation pipeline for atomic operations
  await User.findByIdAndUpdate(
    userId,
    [
      // Stage 1: Filter out expired tokens
      {
        $set: {
          refreshTokens: {
            $filter: {
              input: '$refreshTokens',
              as: 'token',
              cond: { $gt: ['$$token.expires', new Date()] },
            },
          },
        },
      },
      // Stage 2: Sort tokens by expiration date (newest first)
      {
        $set: {
          refreshTokens: {
            $sortArray: {
              input: '$refreshTokens',
              sortBy: { expires: -1 },
            },
          },
        },
      },
      // Stage 3: Keep only the most recent tokens (up to limit - 1)
      {
        $set: {
          refreshTokens: {
            $slice: ['$refreshTokens', 0, MAX_REFRESH_TOKENS_PER_USER - 1],
          },
        },
      },
      // Stage 4: Add the new token
      {
        $set: {
          refreshTokens: {
            $concatArrays: ['$refreshTokens', [newToken]],
          },
        },
      },
    ],
    { new: true }
  )

  // The token stored in DB is the raw value, the token signed and returned to client contains user ID
  return jwt.sign({ sub: userId, jti: refreshTokenValue }, JWT_REFRESH_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  })
}

export const verifyRefreshToken = (
  token: string
): { sub: string; jti: string } => {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET) as { sub: string; jti: string }
  } catch (error) {
    throw new Error('Invalid refresh token' + (error as Error).message)
  }
}

export const generateMagicLinkToken = (
  email: string,
  type: EnumMagicLinkType
): string => {
  return jwt.sign({ email, type }, MAGIC_LINK_SECRET, {
    expiresIn: MAGIC_LINK_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  })
}

export const verifyMagicLinkToken = (
  token: string
): { email: string; type: EnumMagicLinkType } => {
  try {
    return jwt.verify(token, MAGIC_LINK_SECRET) as {
      email: string
      type: EnumMagicLinkType
    }
  } catch (error) {
    throw new Error('Invalid or expired token ' + (error as Error).message)
  }
}

export const revokeRefreshToken = async (
  userId: string,
  refreshTokenValue: string
): Promise<void> => {
  const user = await User.findById(userId)
  if (user) {
    user.refreshTokens = user.refreshTokens.filter(
      (rt) => rt.token !== refreshTokenValue
    )
    await user.save()
  }
}

export const sendTokens = async (
  res: Response,
  user: IUser,
  ipAddress?: string
) => {
  const accessToken = generateAccessToken(user.id)
  const refreshToken = await generateRefreshToken(user.id, ipAddress) // This is the signed JWT refresh token

  // Set refresh token in an HttpOnly cookie
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // Only send over HTTPS in production
    sameSite: 'none',
    maxAge: parseInt(
      process.env.JWT_REFRESH_EXPIRES_IN_MILLISECONDS ?? '604800000'
    ),
    // path: '/auth/refresh-token', // Important: Scope the cookie to the refresh token path
  })

  // Send access token and user info in JSON response
  res.json({
    message: 'Authentication successful',
    accessToken,
    user: {
      id: user.id,
      email: user.email,
      isEmailVerified: user.isEmailVerified,
    },
  })
}

export const sendRefreshTokenCookie = async (
  res: Response,
  user: IUser,
  ipAddress?: string
) => {
  const refreshToken = await generateRefreshToken(user.id, ipAddress)
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: parseInt(
      process.env.JWT_REFRESH_EXPIRES_IN_MILLISECONDS ?? '604800000'
    ),
  })
}
