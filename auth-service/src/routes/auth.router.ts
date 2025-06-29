import {
  CustomError,
  validateRequest,
  AuthenticatedRequest,
  requireAuth,
} from '@groovy-streaming/common'
import { NextFunction, Request, Response, Router } from 'express'
import { body } from 'express-validator'
import { IUser, User } from '../models/User.model'
import {
  generateAccessToken,
  generateMagicLinkToken,
  refreshTokenRotation,
  sendRefreshTokenCookie,
  sendTokens,
  verifyMagicLinkToken,
  verifyRefreshToken,
} from '../services/tokenService'
import passport from '../config/passport'
import {
  sendMagicLinkEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from '../services/emailService'
import { EnumMagicLinkType } from '../types'
import { UserEventPublisher } from '../events/user-event-publisher'

const router = Router()

router.post(
  '/register',
  body('email').isEmail().withMessage('Invalid email format'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('displayName')
    .notEmpty()
    .withMessage('Display name is required')
    .isLength({ min: 3 })
    .withMessage('Display name must be at least 3 characters long'),
  validateRequest,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password, displayName } = req.body
      const existingUser = await User.findOne({ email })
      if (existingUser) {
        throw new CustomError('Bad Request', 409, 'Email already in use')
      }
      const newUser = new User({
        email,
        password,
        isEmailVerified: false,
        displayName: displayName,
      })

      //Send verification email before saving user
      const verificationToken = generateMagicLinkToken(
        email,
        EnumMagicLinkType.EMAIL_VERIFICATION
      )
      await sendVerificationEmail(email, verificationToken)

      await newUser.save()

      res.status(201).json({
        message:
          'Registration successful. Please check your email to verify your account.',
        user: {
          id: newUser.id,
          email: newUser.email,
          isEmailVerified: newUser.isEmailVerified,
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

router.post(
  '/verify-email',
  body('token').notEmpty().withMessage('Verification token is required.'),
  validateRequest,
  async (req: Request, res: Response, next: NextFunction) => {
    console.log('Email verification request received')
    const { token } = req.body
    try {
      const payload = verifyMagicLinkToken(token)

      if (payload.type !== EnumMagicLinkType.EMAIL_VERIFICATION) {
        throw new CustomError(
          'Bad Request',
          400,
          'Invalid or expired verification token'
        )
      }
      const user = await User.findOne({
        email: payload.email,
      })
      if (!user) {
        throw new CustomError('Not Found', 404, 'User not found')
      }
      if (user.isEmailVerified) {
        res.status(200).json({
          message: 'Email already verified',
        })
        return
      }
      user.isEmailVerified = true
      await user.save()

      await UserEventPublisher.UserCreatedEvent(
        user.id,
        user.email ?? payload.email,
        user.displayName
      )
      // await sendTokens(res, user, req.ip)
      res.status(200).json({
        message: 'Email verification successful',
      })
    } catch (error) {
      next(error)
    }
  }
)

router.post(
  '/resend-verification-email',
  async (req: Request, res: Response, next: NextFunction) => {
    const { email } = req.body
    if (!email) {
      next(new CustomError('Bad Request', 400, 'Email is required'))
      return
    }
    try {
      const user = await User.findOne({ email })
      if (!user) {
        next(new CustomError('Not Found', 404, 'User not found'))
        return
      }
      if (user.isEmailVerified) {
        res.status(200).json({
          message: 'Email already verified',
        })
        return
      }
      const verificationToken = generateMagicLinkToken(
        email,
        EnumMagicLinkType.EMAIL_VERIFICATION
      )
      await sendVerificationEmail(email, verificationToken)
      res.status(200).json({
        message: 'Verification email resent. Please check your inbox.',
      })
    } catch (error) {
      next(error)
    }
  }
)

router.post('/login', (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate(
    'local',
    {
      session: false,
    },
    async (err: any, user: IUser | false, info: any) => {
      if (err) return next(err)
      if (!user) {
        return next(
          new CustomError(
            'Unauthorized', // This is a general type, could be more specific if needed
            401,
            info?.message ?? 'Login failed' // Use the message from the passport strategy
          )
        )
      }
      try {
        await sendTokens(res, user)
      } catch (sendTokensError) {
        return next(sendTokensError)
      }
    }
  )(req, res, next)
})

// // --- Google OAuth Routes ---

router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
  })
)
router.get(
  '/google/callback',
  (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate(
      'google',
      {
        failureRedirect: `${process.env.CLIENT_URL}/login?error=google_failed`,
        session: false,
      },
      async (err: any, user: IUser | false, info: any) => {
        if (err) return next(err)
        if (!user) {
          const errorMessage = info?.message
            ? encodeURIComponent(info.message)
            : 'Google authentication failed.'
          return res.redirect(
            `${process.env.CLIENT_URL}/login?error=${errorMessage}`
          )
        }

        try {
          const accessToken = generateAccessToken(user.id)
          await sendRefreshTokenCookie(res, user, req.ip)

          // Create URL with token and user data as query parameters
          const successUrl = new URL(`${process.env.CLIENT_URL}/login-success`)
          successUrl.searchParams.set('token', accessToken)

          res.redirect(successUrl.toString())
        } catch (err) {
          console.error('Error sending tokens:', err)
          res.redirect(`${process.env.CLIENT_URL}/login-error`)
        }
      }
    )(req, res, next)
  }
)

// --- Magic Link (Passwordless Email Login) ---
router.post(
  '/magic-link/request',
  body('email').isEmail().withMessage('Invalid email format'),
  validateRequest,
  async (req: Request, res: Response, next: NextFunction) => {
    const { email } = req.body
    try {
      const user = await User.findOne({ email })
      console.log('Magic link request user:', user)
      if (!user) {
        return next(
          new CustomError('Not Found', 404, 'User not found with this email')
        )
      }
      if (!user.isEmailVerified) {
        return next(
          new CustomError(
            'Forbidden',
            403,
            'Email not verified. Please verify your email first.'
          )
        )
      }
      const magicLinkToken = generateMagicLinkToken(
        email,
        EnumMagicLinkType.LOGIN
      )
      await sendMagicLinkEmail(email, magicLinkToken)
      res.status(200).json({
        message: 'Magic link sent to your email. Please check your inbox.',
      })
    } catch (error) {
      next(error)
    }
  }
)

router.post(
  '/magic-link/verify',
  body('token').notEmpty().withMessage('Magic token is required.'),
  validateRequest,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token } = req.body
      const payload = verifyMagicLinkToken(token)
      const user = await User.findOne({ email: payload.email })

      if (!user)
        return next(new CustomError('Not Found', 404, 'User not found'))

      //Mark email as verified if not already
      if (!user.isEmailVerified) {
        user.isEmailVerified = true
        await user.save()
      }

      await sendTokens(res, user, req.ip)
    } catch (error) {
      console.error('Magic link verification error:', error)
      res.status(401).json({ message: 'Invalid or expired magic link.' })
    }
  }
)

// --- Refresh Token Route ---
router.post(
  '/refresh-token',
  async (req: Request, res: Response, next: NextFunction) => {
    const { refreshToken: token } = req.cookies

    console.log('Refresh token request received')

    if (!token) {
      return next(
        new CustomError('Unauthorized', 401, 'Refresh token is required')
      )
    }

    try {
      const payload = verifyRefreshToken(token)
      console.log('Token payload:', payload)

      const user = await User.findById(payload.sub)
      if (!user) {
        return next(new CustomError('Not Found', 404, 'User not found'))
      }

      // Check if the refresh token value (jti) exists in the user's stored refresh tokens
      const storedToken = user.refreshTokens.find(
        (rt) => rt.token === payload.jti
      )

      if (!storedToken) {
        console.log('Token not found in database')
        return next(
          new CustomError('Unauthorized', 401, 'Invalid refresh token')
        )
      }

      if (storedToken.expires < new Date()) {
        console.log('Token expired')
        return next(
          new CustomError('Unauthorized', 401, 'Expired refresh token')
        )
      }

      console.log('Token valid, rotating refresh token...')

      // Use the combined function to rotate tokens
      const newRefreshToken = await refreshTokenRotation(
        user.id,
        storedToken.token,
        req.ip
      )

      const newAccessToken = generateAccessToken(user.id)

      // Set new refresh token cookie
      res.cookie('refreshToken', newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: parseInt(
          process.env.JWT_REFRESH_EXPIRES_IN_MILLISECONDS ?? '604800000'
        ),
        path: '/',
      })

      res.json({
        message: 'Token refreshed successfully',
        accessToken: newAccessToken,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          isEmailVerified: user.isEmailVerified,
        },
      })
    } catch (error) {
      console.error('Refresh token error:', error)
      return next(error)
    }
  }
)

router.get(
  '/profile',
  passport.authenticate('jwt', { session: false }),
  (req: Request, res: Response) => {
    const { email, displayName, id, isEmailVerified } = req.user as IUser
    res.json({ user: { email, displayName, id, isEmailVerified } })
  }
)

router.get(
  '/me',
  passport.authenticate('jwt', { session: false }),
  (req: Request, res: Response) => {
    if (!req.user) {
      res.status(401).json({ message: 'Unauthorized' })
      return
    }
    const user = req.user as IUser
    res.json({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      isEmailVerified: user.isEmailVerified,
    })
  }
)

router.put(
  '/change-display-name',
  requireAuth,
  body('newDisplayName')
    .notEmpty()
    .withMessage('New display name is required')
    .isLength({ min: 3 })
    .withMessage('Display name must be at least 3 characters long'),
  validateRequest,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { newDisplayName } = req.body

      const user = req.user as IUser
      if (!user) {
        next(new CustomError('Unauthorized', 401, 'User not authenticated'))
      }
      const currentUser = await User.findById(user.id)
      if (!currentUser) {
        return next(new CustomError('Not Found', 404, 'User not found'))
      }

      const existingUser = await User.findOne({
        displayName: newDisplayName,
      })
      if (existingUser) {
        next(new CustomError('Conflict', 409, 'Display name already in use'))
        return
      }

      currentUser.displayName = newDisplayName
      await currentUser.save()
      await UserEventPublisher.UserUpdatedEvent(
        currentUser.id,
        newDisplayName,
        ['displayName']
      )

      res.json({
        message: 'Display name updated successfully',
        user: {
          email: currentUser.email,
          displayName: currentUser.displayName,
        },
      })
    } catch (error) {
      next(error)
    }
  }
)

router.post(
  '/reset-password/request',
  body('email').isEmail().withMessage('Invalid email address'),
  validateRequest,
  async (req: Request, res: Response, next: NextFunction) => {
    const { email } = req.body
    try {
      const user = await User.findOne({ email })
      if (!user) {
        return next(
          new CustomError('Not Found', 404, 'User not found with this email')
        )
      }
      const resetToken = generateMagicLinkToken(
        email,
        EnumMagicLinkType.PASSWORD_RESET
      )
      await sendPasswordResetEmail(email, resetToken, process.env.CLIENT_URL!)
      res.status(200).json({
        message: 'Password reset email sent. Please check your inbox.',
      })
    } catch (error) {
      next(error)
    }
  }
)

router.post(
  '/reset-password/verify',
  body('token').notEmpty().withMessage('Reset token is required.'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters long'),
  validateRequest,
  async (req: Request, res: Response, next: NextFunction) => {
    const { token, newPassword } = req.body
    try {
      const payload = verifyMagicLinkToken(token)
      const user = await User.findOne({ email: payload.email })

      if (!user) {
        return next(new CustomError('Not Found', 404, 'User not found'))
      }

      user.password = newPassword
      await user.save()
      res.status(200).json({ message: 'Password reset successful.' })
    } catch (error) {
      console.error('Password reset error:', error)
      next(error)
    }
  }
)

router.post(
  '/logout',
  passport.authenticate('jwt', { session: false }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user as IUser
      console.log('User logging out:', user.email)
      // Clear the refresh token cookie
      res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        path: '/',
      })

      // Optionally: Remove all refresh tokens from database
      await User.findByIdAndUpdate(user.id, {
        $set: { refreshTokens: [] },
      })

      res.json({ message: 'Logged out successfully' })
    } catch (error) {
      next(error)
    }
  }
)
export { router as AuthRouter }
