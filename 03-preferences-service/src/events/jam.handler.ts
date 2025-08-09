import { Server, Socket } from 'socket.io'
import { JamSession } from '../models/JamSession.model'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'

interface SocketWithAuth extends Socket {
  data: {
    user?: { id: string }
  }
}

// Function to generate a short, random, and readable join code
const generateJoinCode = () => {
  return crypto.randomBytes(3).toString('hex').toUpperCase()
}

export const initializeJamHandler = (io: Server) => {
  // Authentication Middleware
  io.use((socket: SocketWithAuth, next) => {
    const token = socket.handshake.auth.token

    if (!token) {
      return next(new Error('Authentication error: No token provided.'))
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as {
        sub: string
      }
      socket.data.user = { id: decoded.sub } // Attach user data to the socket
      next()
    } catch (err) {
      console.error('Authentication error:', (err as Error).message)
      return next(new Error('Authentication error: Invalid token.'))
    }
  })

  io.on('connection', (socket: SocketWithAuth) => {
    console.log(
      `Jam handler connected for client: ${socket.id}, User: ${socket.data.user?.id}`
    )

    // Event: When a user starts a new Jam session
    socket.on('start-jam', async ({ songId }) => {
      try {
        const userId = socket.data.user!.id
        console.log(
          `[start-jam] User ${userId} starting jam with song ${songId}`
        )
        const joinCode = generateJoinCode()

        const newSession = new JamSession({
          creator: userId,
          queue: [songId],
          currentSong: {
            songId: songId,
            startedAt: new Date(),
            playbackPosition: 0,
          },
          hasControlPermissions: [userId],
          joinCode: joinCode,
        })

        await newSession.save()
        const session = await getPopulatedSession(newSession._id.toString())

        if (!session) {
          return socket.emit('error', {
            message: 'Could not create jam session.',
          })
        }
        console.log(session)

        const room = `jam:${session._id.toString()}`
        socket.join(room)

        console.log(
          `[start-jam] Session ${session._id} created with code ${joinCode}. User ${socket.id} joined room ${room}`
        )

        // Notify the creator that the session is ready
        socket.emit('session-updated', session)
      } catch (error) {
        console.error('Error starting jam session:', error)
        socket.emit('error', { message: 'Could not start jam session.' })
      }
    })

    // Event: When a user joins an existing Jam session
    socket.on('join-jam', async ({ joinCode }) => {
      try {
        const userId = socket.data.user!.id
        console.log(
          `[join-jam] User ${userId} attempting to join session with code ${joinCode}`
        )

        const session = await JamSession.findOne({ joinCode })

        if (!session) {
          console.log(`[join-jam] Session with code ${joinCode} not found.`)
          return socket.emit('error', { message: 'Jam session not found.' })
        }

        // Add user to participants if not already there
        if (!session.participants.includes(userId)) {
          session.participants.push(userId)
          session.participants = [...new Set(session.participants)] // Deduplicate
          await session.save()
        }

        const populatedSession = await getPopulatedSession(
          session._id.toString()
        )

        const room = `jam:${session._id.toString()}`
        socket.join(room)
        console.log(`[join-jam] User ${socket.id} joined room ${room}`)

        // Notify everyone in the room (including the new user) about the updated session
        io.to(room).emit('session-updated', populatedSession)
      } catch (error) {
        console.error('Error joining jam session:', error)
        socket.emit('error', { message: 'Could not join jam session.' })
      }
    })

    // Event: When the creator controls playback (play, pause)
    socket.on(
      'control-playback',
      async ({ sessionId, action, playbackPosition }) => {
        try {
          const userId = socket.data.user!.id
          console.log(
            `[control-playback] User ${userId} sending action '${action}' for session ${sessionId}`
          )

          const session = await JamSession.findById(sessionId)

          if (!session) {
            return socket.emit('error', { message: 'Jam session not found.' })
          }

          // check if the user is the creator or has control permissions
          if (
            session.creator.toString() !== userId &&
            !session.hasControlPermissions.includes(userId)
          ) {
            return socket.emit('error', {
              message: 'You do not have permission to change the song.',
            })
          }

          // Update playback state
          session.playbackState = action // action should be 'playing' or 'paused'

          // If playing, we reset the server's reference for playback position
          if (action === 'playing') {
            session.currentSong.startedAt = new Date()
            session.currentSong.playbackPosition = playbackPosition || 0
          } else if (action === 'paused') {
            // Calculate how long the song has been playing and store it
            const elapsedTime =
              (new Date().getTime() - session.currentSong.startedAt.getTime()) /
              1000
            session.currentSong.playbackPosition += elapsedTime
          }

          await session.save()

          const populatedSession = await getPopulatedSession(
            session._id.toString()
          )

          const room = `jam:${session._id.toString()}`

          // Notify everyone in the room about the state change
          io.to(room).emit('session-updated', populatedSession)
        } catch (error) {
          console.error('Error handling playback control:', error)
          socket.emit('error', {
            message: 'Could not process playback control.',
          })
        }
      }
    )

    // Event: When any user adds a song to the queue
    socket.on('add-to-queue', async ({ sessionId, songId }) => {
      try {
        const userId = socket.data.user!.id
        console.log(
          `[add-to-queue] User ${userId} adding song ${songId} to session ${sessionId}`
        )

        const session = await JamSession.findById(sessionId)

        if (!session) {
          return socket.emit('error', { message: 'Jam session not found.' })
        }

        // Add song to the queue if it's not already there
        if (!session.queue.includes(songId)) {
          session.queue.push(songId)
          await session.save()
        }

        const populatedSession = await getPopulatedSession(
          session._id.toString()
        )
        const room = `jam:${session._id.toString()}`

        // Notify everyone in the room about the updated queue
        io.to(room).emit('session-updated', populatedSession)
      } catch (error) {
        console.error('Error adding to queue:', error)
        socket.emit('error', { message: 'Could not add song to queue.' })
      }
    })

    // Event: When any user changes the current song
    socket.on('change-song', async ({ sessionId, songId }) => {
      try {
        const userId = socket.data.user!.id
        console.log(
          `[change-song] User ${userId} changing song to ${songId} in session ${sessionId}`
        )

        const session = await JamSession.findById(sessionId)

        if (!session) {
          return socket.emit('error', { message: 'Jam session not found.' })
        }
        // Rule: Only the creator can change the song
        console.log(session.hasControlPermissions.includes(userId))
        if (
          session.creator.toString() !== userId &&
          !session.hasControlPermissions.includes(userId)
        ) {
          return socket.emit('error', {
            message: 'You do not have permission to change the song.',
          })
        }

        // Update the current song
        session.currentSong.songId = songId
        session.currentSong.startedAt = new Date()
        session.currentSong.playbackPosition = 0
        session.playbackState = 'playing' // Changing a song implies playing it

        await session.save()

        const populatedSession = await getPopulatedSession(
          session._id.toString()
        )
        const room = `jam:${session._id.toString()}`

        // Notify everyone in the room about the new song
        io.to(room).emit('session-updated', populatedSession)
      } catch (error) {
        console.error('Error changing song:', error)
        socket.emit('error', { message: 'Could not change song.' })
      }
    })

    // Event: When the creator seeks within the current song
    socket.on('seek', async ({ sessionId, position }) => {
      try {
        const userId = socket.data.user!.id
        console.log(
          `[seek] User ${userId} seeking to ${position} in session ${sessionId}`
        )

        const session = await JamSession.findById(sessionId)

        if (!session) {
          return socket.emit('error', { message: 'Jam session not found.' })
        }

        // Rule: Only the creator can control global playback
        if (
          session.creator.toString() !== userId &&
          !session.hasControlPermissions.includes(userId)
        ) {
          return socket.emit('error', {
            message: 'You do not have permission to change the song.',
          })
        }

        session.currentSong.playbackPosition = position
        await session.save()

        const populatedSession = await getPopulatedSession(
          session._id.toString()
        )
        const room = `jam:${session._id.toString()}`

        // Notify everyone in the room about the seek event
        io.to(room).emit('session-updated', populatedSession)
      } catch (error) {
        console.error('Error handling seek:', error)
        socket.emit('error', { message: 'Could not process seek.' })
      }
    })

    // Event: When the creator changes the repeat mode
    socket.on('control-repeat-mode', async ({ sessionId, mode }) => {
      try {
        const userId = socket.data.user!.id
        console.log(
          `[control-repeat-mode] User ${userId} setting repeat mode to ${mode} for session ${sessionId}`
        )

        const session = await JamSession.findById(sessionId)

        if (!session) {
          return socket.emit('error', { message: 'Jam session not found.' })
        }

        // Rule: Only the creator can control global playback
        if (
          session.creator.toString() !== userId &&
          !session.hasControlPermissions.includes(userId)
        ) {
          return socket.emit('error', {
            message: 'You do not have permission to change the repeat mode.',
          })
        }

        session.repeat = mode
        await session.save()

        const populatedSession = await getPopulatedSession(
          session._id.toString()
        )
        const room = `jam:${session._id.toString()}`

        // Notify everyone in the room about the repeat mode change
        io.to(room).emit('session-updated', populatedSession)
      } catch (error) {
        console.error('Error handling repeat mode control:', error)
        socket.emit('error', {
          message: 'Could not process repeat mode control.',
        })
      }
    })

    // Event: When the creator toggles shuffle mode
    socket.on('control-shuffle', async ({ sessionId, shuffle }) => {
      try {
        const userId = socket.data.user!.id
        console.log(
          `[control-shuffle] User ${userId} setting shuffle to ${shuffle} for session ${sessionId}`
        )

        const session = await JamSession.findById(sessionId)

        if (!session) {
          return socket.emit('error', { message: 'Jam session not found.' })
        }

        // Rule: Only the creator can control global playback
        if (
          session.creator.toString() !== userId &&
          !session.hasControlPermissions.includes(userId)
        ) {
          return socket.emit('error', {
            message: 'Only the creator can control shuffle mode.',
          })
        }

        session.shuffle = shuffle
        await session.save()

        const populatedSession = await getPopulatedSession(
          session._id.toString()
        )
        const room = `jam:${session._id.toString()}`

        // Notify everyone in the room about the shuffle mode change
        io.to(room).emit('session-updated', populatedSession)
      } catch (error) {
        console.error('Error handling shuffle control:', error)
        socket.emit('error', {
          message: 'Could not process shuffle control.',
        })
      }
    })
    // Event : give control permissions to a user
    socket.on('give-control-permission', async ({ sessionId, userId }) => {
      try {
        const currentUserId = socket.data.user!.id
        console.log(
          `[give-control-permission] User ${currentUserId} giving control permission to ${userId} in session ${sessionId}`
        )

        const session = await JamSession.findById(sessionId)

        if (!session) {
          return socket.emit('error', { message: 'Jam session not found.' })
        }

        // Rule: Only the creator can give control permissions
        if (session.creator.toString() !== currentUserId) {
          return socket.emit('error', {
            message: 'Only the creator can give control permissions.',
          })
        }

        // Add user to control permissions if not already there
        if (!session.hasControlPermissions.includes(userId)) {
          session.hasControlPermissions.push(userId)
          await session.save()
        }

        const populatedSession = await getPopulatedSession(
          session._id.toString()
        )
        const room = `jam:${session._id.toString()}`

        // Notify everyone in the room about the updated session
        io.to(room).emit('session-updated', populatedSession)
      } catch (error) {
        console.error('Error giving control permission:', error)
        socket.emit('error', { message: 'Could not give control permission.' })
      }
    })
    // Event : remove control permissions from a user
    socket.on('revoke-control-permission', async ({ sessionId, userId }) => {
      try {
        const currentUserId = socket.data.user!.id
        console.log(
          `[revoke-control-permission] User ${currentUserId} removing control permission from ${userId} in session ${sessionId}`
        )
        const session = await JamSession.findById(sessionId)
        if (!session) {
          return socket.emit('error', { message: 'Jam session not found.' })
        }
        // Rule: Only the creator can remove control permissions
        if (session.creator.toString() !== currentUserId) {
          return socket.emit('error', {
            message: 'Only the creator can remove control permissions.',
          })
        }
        // Remove user from control permissions if they exist
        if (session.hasControlPermissions.includes(userId)) {
          session.hasControlPermissions = session.hasControlPermissions.filter(
            (id) => id.toString() !== userId
          )
          await session.save()
        }
        const populatedSession = await getPopulatedSession(
          session._id.toString()
        )
        const room = `jam:${session._id.toString()}`

        // Notify everyone in the room about the updated session
        io.to(room).emit('session-updated', populatedSession)
      } catch (error) {
        console.error('Error removing control permission:', error)
        socket.emit('error', {
          message: 'Could not remove control permission.',
        })
      }
    })

    // Event: When a user requests the current session state
    socket.on('get-session', async ({ sessionId }) => {
      try {
        const session = await JamSession.findById(sessionId)
        if (!session) {
          return socket.emit('error', { message: 'Jam session not found.' })
        }
        const populatedSession = await getPopulatedSession(
          session._id.toString()
        )
        socket.emit('session-updated', populatedSession)
      } catch (error) {
        console.error('Error getting session:', error)
        socket.emit('error', { message: 'Could not retrieve session.' })
      }
    })

    // Event: clear the queue
    socket.on('clear-queue', async ({ sessionId }) => {
      try {
        const userId = socket.data.user!.id
        console.log(
          `[clear-queue] User ${userId} clearing queue for session ${sessionId}`
        )

        const session = await JamSession.findById(sessionId)

        if (!session) {
          return socket.emit('error', { message: 'Jam session not found.' })
        }

        // Rule: Only the creator can clear the queue
        if (
          session.creator.toString() !== userId &&
          !session.hasControlPermissions.includes(userId)
        ) {
          return socket.emit('error', {
            message: 'You do not have permission to clear the queue.',
          })
        }

        session.queue = []
        await session.save()

        const populatedSession = await getPopulatedSession(
          session._id.toString()
        )
        const room = `jam:${session._id.toString()}`

        // Notify everyone in the room about the cleared queue
        io.to(room).emit('session-updated', populatedSession)
      } catch (error) {
        console.error('Error clearing queue:', error)
        socket.emit('error', { message: 'Could not clear the queue.' })
      }
    })
    // Event: When a user disconnects
    socket.on('disconnect', async () => {
      try {
        const userId = socket.data.user?.id
        if (!userId) {
          return
        }

        console.log(`[disconnect] User ${userId} disconnected.`)

        const session = await JamSession.findOne({ participants: userId })

        if (!session) {
          return
        }

        const room = `jam:${session._id.toString()}`

        // If the creator disconnects, just remove them from participants
        // The session will persist until its 12-hour expiry or explicit end.
        console.log(`[disconnect] User ${userId} left session ${session._id}.`)
        session.participants = session.participants.filter(
          (p) => p.toString() !== userId
        )
        await session.save()

        const populatedSession = await getPopulatedSession(
          session._id.toString()
        )
        io.to(room).emit('session-updated', populatedSession)
      } catch (error) {
        console.error(
          `[disconnect] Error handling disconnect for user ${socket.data.user?.id}:`,
          error
        )
      }
    })
  })
}

// helper function to get a populated session
const getPopulatedSession = async (sessionId: string) => {
  return await JamSession.findById(sessionId)
    .populate({ path: 'participants', select: 'displayName' })
    .populate({
      path: 'queue',
      populate: {
        path: 'metadata.artist',
        select: 'displayName',
      },
    })
    .populate({
      path: 'queue',
      populate: {
        path: 'metadata.album',
        select: 'title coverUrl',
      },
    })
    .populate({
      path: 'currentSong.songId',
      populate: {
        path: 'metadata.artist',
        select: 'displayName',
      },
    })
    .populate({
      path: 'currentSong.songId',
      populate: {
        path: 'metadata.album',
        select: 'title coverUrl',
      },
    })
}
