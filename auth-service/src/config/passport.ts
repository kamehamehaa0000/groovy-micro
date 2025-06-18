import passport from 'passport'
import { Strategy as LocalStrategy } from 'passport-local'
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import User, { IUser } from '../models/User.model'

import { config, configDotenv } from 'dotenv'
configDotenv({
  path: '.env',
})
config({
  path: '.env',
})

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET!
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL!

// Local Strategy (Email/Password)
passport.use(
  new LocalStrategy(
    { usernameField: 'email' },
    async (email, password, done) => {
      try {
        const user = await User.findOne({ email }).select('+password')
        if (!user) {
          return done(null, false, { message: 'Incorrect email.' })
        }
        if (!user.password) {
          // User might have signed up with OAuth
          return done(null, false, {
            message:
              'Please log in with your social account or reset password.',
          })
        }
        const isMatch = await user.comparePassword(password)
        if (!isMatch) {
          return done(null, false, { message: 'Incorrect password.' })
        }
        if (!user.isEmailVerified) {
          // Optional: check if email is verified
          return done(null, false, {
            message: 'Please verify your email first.',
          })
        }
        return done(null, user as any)
      } catch (err) {
        return done(err)
      }
    }
  )
)

// JWT Strategy (For protecting routes)
passport.use(
  'jwt',
  new JwtStrategy(
    {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: JWT_ACCESS_SECRET,
    },
    async (payload, done) => {
      try {
        const user = await User.findById(payload.sub)
        if (user) {
          return done(null, user)
        }
        return done(null, false)
      } catch (err) {
        return done(err, false)
      }
    }
  )
)

// Google OAuth 2.0 Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      callbackURL: GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await User.findOne({ googleId: profile.id })
        if (user) {
          return done(null, user as any)
        }
        // If user exists with this email but no googleId, link them or ask to login first
        const existingEmailUser =
          profile.emails && profile.emails[0]
            ? await User.findOne({ email: profile.emails[0].value })
            : null

        if (existingEmailUser) {
          // Automatically link if email matches and is verified
          existingEmailUser.googleId = profile.id
          await existingEmailUser.save()
          return done(null, existingEmailUser as any)
        }

        user = new User({
          displayName:
            profile.displayName ||
            (profile.emails && profile.emails[0]
              ? profile.emails[0].value.split('@')[0]
              : 'Anonymous'),
          googleId: profile.id,
          email:
            profile.emails && profile.emails[0]
              ? profile.emails[0].value
              : undefined,
          isEmailVerified:
            profile.emails && profile.emails[0]
              ? profile.emails[0].verified
              : false,
        })
        await user.save()
        return done(null, user as any)
      } catch (err) {
        return done(err, false)
      }
    }
  )
)

export default passport
