import fastify from 'fastify'
import fastifyHttpProxy from '@fastify/http-proxy'
import dotenv, { configDotenv } from 'dotenv'
import cors from '@fastify/cors'
configDotenv()
dotenv.config({ path: '.env' })

const server = fastify({
  logger: true, //for dev only
})

server.register(cors, {
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
})
// Enhanced proxy configuration with proper header forwarding

// 1. Auth Service Proxy
server.register(fastifyHttpProxy, {
  upstream: process.env.AUTH_SERVICE_URL!,
  prefix: '/api/auth', // Requests to /api/auth/* will be forwarded
  rewritePrefix: '/api/v1/auth', // Rewrite to the service's internal prefix
})

// 2. Songs Service Proxy
server.register(fastifyHttpProxy, {
  upstream: process.env.SONGS_SERVICE_URL!,
  prefix: '/api/songs',
  rewritePrefix: '/api/v1', // The songs service uses /api/v1/*
})

// 3. Comments Service Proxy
server.register(fastifyHttpProxy, {
  upstream: process.env.COMMENTS_SERVICE_URL!,
  prefix: '/api/comments',
  rewritePrefix: '/api/v1',
})

// 4. Preferences Service Proxy (Handles HTTP and WebSockets)
server.register(fastifyHttpProxy, {
  upstream: process.env.PREFERENCES_SERVICE_URL!,
  prefix: '/api/preferences',
  rewritePrefix: '/api/v1',
  websocket: true, // Enable WebSocket proxying for Socket.IO
})

// 5. Query Service Proxy
server.register(fastifyHttpProxy, {
  upstream: process.env.QUERY_SERVICE_URL!,
  prefix: '/api/query',
  rewritePrefix: '/api/v1/query',
})

// Health check for the gateway itself
server.get('/health', async (request, reply) => {
  return { status: 'OK', service: 'api-gateway' }
})

const start = async () => {
  try {
    if (
      !process.env.GATEWAY_PORT ||
      !process.env.AUTH_SERVICE_URL ||
      !process.env.SONGS_SERVICE_URL ||
      !process.env.COMMENTS_SERVICE_URL ||
      !process.env.PREFERENCES_SERVICE_URL ||
      !process.env.QUERY_SERVICE_URL
    ) {
      server.log.error('Missing environment variables')
      process.exit(1)
    }
    const port = parseInt(process.env.GATEWAY_PORT)
    await server.listen({ port })
    server.log.info(`API Gateway listening on port ${port}`)
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}

start()
