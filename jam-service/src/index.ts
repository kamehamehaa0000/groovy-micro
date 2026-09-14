import fastifyCors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import fastifyWebsocket from "@fastify/websocket";
import Fastify from "fastify";
import { config } from "./config";
import { redis, redisSub } from "./redis";
import { jamWebSocketRoutes } from "./routes/jam.ws";

export async function buildJamApp() {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === "test" ? "silent" : "info",
      transport:
        config.NODE_ENV !== "production" && config.NODE_ENV !== "test"
          ? {
              target: "pino-pretty",
              options: {
                translateTime: "HH:MM:ss Z",
                ignore: "pid,hostname",
              },
            }
          : undefined,
    },
  });

  // CORS
  await app.register(fastifyCors, {
    origin: true,
    credentials: true,
  });

  // JWT Verification Plugin
  await app.register(fastifyJwt, {
    secret: config.JWT_SECRET,
  });

  // WebSocket Plugin
  await app.register(fastifyWebsocket, {
    options: {
      maxPayload: 1048576, // 1MB
    },
  });

  // Health check endpoint
  app.get("/health", async () => {
    const redisStatus = redis.status === "ready" || redis.status === "connect" ? "ok" : "degraded";
    return {
      status: "ok",
      service: "jam-service",
      port: config.PORT,
      redis: redisStatus,
      timestamp: Date.now(),
    };
  });

  // Register Live Jam WebSocket routes
  await app.register(jamWebSocketRoutes);

  return app;
}

// Auto-start if run directly
if (import.meta.main || process.argv[1]?.endsWith("index.ts") || process.argv[1]?.endsWith("index.js")) {
  const app = await buildJamApp();

  try {
    await app.listen({ port: config.PORT, host: "0.0.0.0" });
    console.log(`🎧 Live Jam Service running on http://0.0.0.0:${config.PORT}`);
    console.log(`📡 WebSocket endpoint available at ws://0.0.0.0:${config.PORT}/jam/ws`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  for (const signal of signals) {
    process.on(signal, async () => {
      console.log(`\nReceived ${signal}, shutting down jam-service...`);
      await app.close();
      await redis.quit().catch(() => {});
      await redisSub.quit().catch(() => {});
      process.exit(0);
    });
  }
}
