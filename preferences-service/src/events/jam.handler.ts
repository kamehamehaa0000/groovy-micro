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
        id: string
      }
      socket.data.user = { id: decoded.id } // Attach user data to the socket
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
      // No longer need userId from client
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
          joinCode: joinCode,
        })

        await newSession.save()
        const session = await JamSession.findById(newSession._id).populate(
          'participants queue currentSong.songId'
        )

        const room = `jam:${session!._id.toString()}`
        socket.join(room)

        console.log(
          `[start-jam] Session ${
            session!._id
          } created with code ${joinCode}. User ${
            socket.id
          } joined room ${room}`
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
        const userId = socket.data.user!.id;
        console.log(`[join-jam] User ${userId} attempting to join session with code ${joinCode}`);

        const session = await JamSession.findOne({ joinCode });

        if (!session) {
          console.log(`[join-jam] Session with code ${joinCode} not found.`);
          return socket.emit('error', { message: 'Jam session not found.' });
        }

        // Add user to participants if not already there
        if (!session.participants.includes(userId)) {
          session.participants.push(userId);
          await session.save();
        }

        const populatedSession = await JamSession.findById(session._id).populate('participants queue currentSong.songId');

        const room = `jam:${session._id.toString()}`;
        socket.join(room);
        console.log(`[join-jam] User ${socket.id} joined room ${room}`);

        // Notify everyone in the room (including the new user) about the updated session
        io.to(room).emit('session-updated', populatedSession);

      } catch (error) {
        console.error('Error joining jam session:', error);
        socket.emit('error', { message: 'Could not join jam session.' });
      }
    });

    // Event: When the creator controls playback (play, pause)
    socket.on('control-playback', async ({ sessionId, action }) => {
      try {
        const userId = socket.data.user!.id;
        console.log(`[control-playback] User ${userId} sending action '${action}' for session ${sessionId}`);

        const session = await JamSession.findById(sessionId);

        if (!session) {
          return socket.emit('error', { message: 'Jam session not found.' });
        }

        // Rule: Only the creator can control global playback
        if (session.creator.toString() !== userId) {
          return socket.emit('error', { message: 'Only the creator can control playback.' });
        }

        // Update playback state
        session.playbackState = action; // action should be 'playing' or 'paused'

        // If playing, we reset the server's reference for playback position
        if (action === 'playing') {
            session.currentSong.startedAt = new Date();
            // Note: The client is expected to provide the playbackPosition when the play event is fired.
            // For simplicity here, we assume it continues from where it was, but a more robust solution
            // might involve the client sending its current timestamp.
        } else if (action === 'paused') {
            // Calculate how long the song has been playing and store it
            const elapsedTime = (new Date().getTime() - session.currentSong.startedAt.getTime()) / 1000;
            session.currentSong.playbackPosition += elapsedTime;
        }

        await session.save();

        const populatedSession = await JamSession.findById(session._id).populate('participants queue currentSong.songId');
        const room = `jam:${session._id.toString()}`;

        // Notify everyone in the room about the state change
        io.to(room).emit('session-updated', populatedSession);

      } catch (error) {
        console.error('Error handling playback control:', error);
        socket.emit('error', { message: 'Could not process playback control.' });
      }
    });

    // Event: When any user adds a song to the queue
    socket.on('add-to-queue', async ({ sessionId, songId }) => {
      try {
        const userId = socket.data.user!.id;
        console.log(`[add-to-queue] User ${userId} adding song ${songId} to session ${sessionId}`);

        const session = await JamSession.findById(sessionId);

        if (!session) {
          return socket.emit('error', { message: 'Jam session not found.' });
        }

        // Add song to the queue if it's not already there
        if (!session.queue.includes(songId)) {
          session.queue.push(songId);
          await session.save();
        }

        const populatedSession = await JamSession.findById(session._id).populate('participants queue currentSong.songId');
        const room = `jam:${session._id.toString()}`;

        // Notify everyone in the room about the updated queue
        io.to(room).emit('session-updated', populatedSession);

      } catch (error) {
        console.error('Error adding to queue:', error);
        socket.emit('error', { message: 'Could not add song to queue.' });
      }
    });

    // Event: When any user changes the current song
    socket.on('change-song', async ({ sessionId, songId }) => {
      try {
        const userId = socket.data.user!.id;
        console.log(`[change-song] User ${userId} changing song to ${songId} in session ${sessionId}`);

        const session = await JamSession.findById(sessionId);

        if (!session) {
          return socket.emit('error', { message: 'Jam session not found.' });
        }

        // Update the current song
        session.currentSong.songId = songId;
        session.currentSong.startedAt = new Date();
        session.currentSong.playbackPosition = 0;
        session.playbackState = 'playing'; // Changing a song implies playing it

        await session.save();

        const populatedSession = await JamSession.findById(session._id).populate('participants queue currentSong.songId');
        const room = `jam:${session._id.toString()}`;

        // Notify everyone in the room about the new song
        io.to(room).emit('session-updated', populatedSession);

      } catch (error) {
        console.error('Error changing song:', error);
        socket.emit('error', { message: 'Could not change song.' });
      }
    });

    socket.on('disconnect', async () => {
      try {
        const userId = socket.data.user?.id;
        if (!userId) {
          return;
        }

        console.log(`[disconnect] User ${userId} disconnected.`);

        const session = await JamSession.findOne({ participants: userId });

        if (!session) {
          return;
        }

        const room = `jam:${session._id.toString()}`;

        // If the creator disconnects, end the session for everyone
        if (session.creator.toString() === userId) {
          console.log(`[disconnect] Creator ${userId} left session ${session._id}. Ending the jam.`);
          io.to(room).emit('session-ended', { message: 'The Jam creator has left. The session has ended.' });
          await JamSession.findByIdAndDelete(session._id);
        } else {
          // If a participant disconnects, just remove them
          console.log(`[disconnect] Participant ${userId} left session ${session._id}.`);
          session.participants = session.participants.filter(p => p.toString() !== userId);
          await session.save();

          const populatedSession = await JamSession.findById(session._id).populate('participants queue currentSong.songId');
          io.to(room).emit('session-updated', populatedSession);
        }
      } catch (error) {
        console.error(`[disconnect] Error handling disconnect for user ${socket.data.user?.id}:`, error);
      }
    });
  })
}
