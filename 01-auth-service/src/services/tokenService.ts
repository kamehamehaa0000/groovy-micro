import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import mongoose from 'mongoose'
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
  ipAddress?: string,
  revokeTokenValue?: string // Add optional parameter to revoke old token
): Promise<string> => {
  // Generate token values
  const refreshTokenValue = crypto.randomBytes(40).toString('hex')
  const expires = new Date(
    Date.now() + parseInt(JWT_REFRESH_EXPIRES_IN) * 24 * 60 * 60 * 1000
  )

  // Use findByIdAndUpdate with retry logic to handle version conflicts
  let retries = 3
  while (retries > 0) {
    try {
      console.log(
        `Generating refresh token for user ${userId} with IP ${ipAddress}`
      )

      const user = await User.findById(userId)
      console.log(`Found user: ${user ? user.email : 'not found'}`)
      if (!user) {
        throw new Error('User not found')
      }

      // Clean up expired tokens
      user.refreshTokens = user.refreshTokens.filter(
        (rt) => rt.expires > new Date()
      )

      // If revoking a specific token, remove it
      if (revokeTokenValue) {
        user.refreshTokens = user.refreshTokens.filter(
          (rt) => rt.token !== revokeTokenValue
        )
      }

      // If we have too many tokens, remove the oldest ones
      if (user.refreshTokens.length >= MAX_REFRESH_TOKENS_PER_USER) {
        user.refreshTokens.sort(
          (a, b) => b.expires.getTime() - a.expires.getTime()
        )
        user.refreshTokens = user.refreshTokens.slice(
          0,
          MAX_REFRESH_TOKENS_PER_USER - 1
        )
      }

      // Add the new token
      const newToken = {
        token: refreshTokenValue,
        expires,
        ipAddress: ipAddress ?? 'unknown',
      }
      user.refreshTokens.push(newToken)

      await user.save()
      break // Success, exit retry loop
    } catch (error: any) {
      if (error.name === 'VersionError' && retries > 1) {
        retries--
        console.log(`Version conflict, retrying... (${retries} attempts left)`)
        // Wait a bit before retrying
        await new Promise((resolve) => setTimeout(resolve, 100))
        continue
      }
      throw error
    }
  }

  // The token stored in DB is the raw value, the token signed and returned to client contains user ID
  return jwt.sign({ sub: userId, jti: refreshTokenValue }, JWT_REFRESH_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  })
}
export const verifyRefreshToken = (
  token: string
): { sub: string; jti: string } => {
  try {
    // console.log('Verifying refresh token:', token)
    // console.log('Using secret:', JWT_REFRESH_SECRET)

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
  let retries = 3
  while (retries > 0) {
    try {
      const user = await User.findById(userId)
      if (!user) return
      if (!user) return

      user.refreshTokens = user.refreshTokens.filter(
        (rt) => rt.token !== refreshTokenValue
      )
      await user.save()
      break // Success, exit retry loop
    } catch (error: any) {
      if (error.name === 'VersionError' && retries > 1) {
        retries--
        console.log(
          `Version conflict in revoke, retrying... (${retries} attempts left)`
        )
        await new Promise((resolve) => setTimeout(resolve, 100))
        continue
      }
      throw error
    }
  }
}

export const sendTokens = async (
  res: Response,
  user: IUser,
  ipAddress?: string
) => {
  const accessToken = generateAccessToken(user.id)
  const refreshToken = await generateRefreshToken(user.id, ipAddress)

  // Set refresh token in an HttpOnly cookie
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: parseInt(
      process.env.JWT_REFRESH_EXPIRES_IN_MILLISECONDS ?? '604800000'
    ),
    path: '/', // Make sure it's available for all paths
  })

  // Send access token and user info in JSON response
  res.json({
    message: 'Authentication successful',
    accessToken,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      isEmailVerified: user.isEmailVerified,
    },
  })
}

export const refreshTokenRotation = async (
  userId: string,
  oldTokenValue: string,
  ipAddress?: string
): Promise<string> => {
  // Generate new token and revoke old one in a single operation
  return await generateRefreshToken(userId, ipAddress, oldTokenValue)
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
