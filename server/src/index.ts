import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import dotenv from "dotenv";
import Redis from "ioredis";
import { client as pgClient } from "./db";

dotenv.config();

const isProduction = process.env.NODE_ENV === "production";
const port = parseInt(process.env.PORT || "4000", 10);
const host = "0.0.0.0";

// Initialize Fastify with structured logger
export const app = Fastify({
  logger: isProduction
    ? true
    : {
        transport: {
          target: "pino-pretty",
          options: {
            translateTime: "HH:MM:ss Z",
            ignore: "pid,hostname",
          },
        },
      },
});

// Initialize Redis client
export const redis = new Redis(
  process.env.REDIS_URL || "redis://localhost:6379",
  {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
  }
);

async function bootstrap() {
  // 1. Plugins
  await app.register(cors, {
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });

  await app.register(cookie, {
    secret: process.env.COOKIE_SECRET || "cookie_secret_at_least_32_characters_long",
    parseOptions: {},
  });

  await app.register(jwt, {
    secret: process.env.JWT_SECRET || "jwt_secret_at_least_32_characters_long",
    cookie: {
      cookieName: "access_token",
      signed: false,
    },
  });

  await app.register(rateLimit, {
    max: 1000,
    timeWindow: "1 minute",
    redis: redis,
  });

  // 2. Health & Diagnostic Check
  app.get("/healthz", async (req, reply) => {
    let dbStatus = "unknown";
    let redisStatus = "unknown";

    try {
      await pgClient`SELECT 1`;
      dbStatus = "healthy";
    } catch (err: any) {
      dbStatus = `unhealthy: ${err.message}`;
    }

    try {
      const pong = await redis.ping();
      redisStatus = pong === "PONG" ? "healthy" : "unhealthy";
    } catch (err: any) {
      redisStatus = `unhealthy: ${err.message}`;
    }

    const isHealthy = dbStatus === "healthy" && redisStatus === "healthy";
    const statusCode = isHealthy ? 200 : 503;

    return reply.status(statusCode).send({
      status: isHealthy ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus,
        redis: redisStatus,
      },
    });
  });

  // 3. API Root
  app.get("/api/v1", async () => {
    return {
      name: "Groovy Modular Monolith API",
      version: "2.0.0",
      runtime: "Bun",
      timestamp: new Date().toISOString(),
    };
  });

  // Connect to Redis in background
  try {
    await redis.connect();
    app.log.info("✅ Redis connected successfully");
  } catch (err: any) {
    app.log.warn(`⚠️ Redis connection deferred or failed: ${err.message}`);
  }

  // 4. Start Server
  try {
    await app.listen({ port, host });
    app.log.info(`🚀 Groovy Server running at http://${host}:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Graceful shutdown handling
const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
for (const signal of signals) {
  process.on(signal, async () => {
    app.log.info(`🔄 ${signal} received. Shutting down gracefully...`);
    try {
      await app.close();
      await redis.quit();
      await pgClient.end();
      app.log.info("👋 Server shut down completed.");
      process.exit(0);
    } catch (err) {
      app.log.error(err, "Error during graceful shutdown");
      process.exit(1);
    }
  });
}

bootstrap();
