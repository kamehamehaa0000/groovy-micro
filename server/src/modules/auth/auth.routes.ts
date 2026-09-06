import type { FastifyPluginAsync } from "fastify";
import { randomBytes } from "crypto";
import { AuthService } from "./auth.service";
import {
  registerSchema,
  loginSchema,
  googleTokenSchema,
} from "./auth.schemas";
import {
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  REFRESH_COOKIE_NAME,
  exchangeGoogleCodeForTokens,
  verifyGoogleIdToken,
} from "./auth.utils";
import { requireAuth } from "./auth.guards";

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  const authService = new AuthService(fastify);

  /**
   * POST /register
   * Registers a new user, assigns free subscription, and creates outbox event.
   */
  fastify.post("/register", async (request, reply) => {
    const parseResult = registerSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "Validation failed",
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    const result = await authService.register(parseResult.data);
    setRefreshTokenCookie(reply, result.refreshToken);

    return reply.status(201).send({
      user: result.user,
      accessToken: result.accessToken,
    });
  });

  /**
   * POST /login
   * Authenticates user, issues tokens, and sets httpOnly refresh token cookie.
   * Rate limited: 5 attempts per minute per IP.
   */
  fastify.post(
    "/login",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const parseResult = loginSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Validation failed",
          errors: parseResult.error.flatten().fieldErrors,
        });
      }

      const result = await authService.login(parseResult.data);
      setRefreshTokenCookie(reply, result.refreshToken);

      return reply.status(200).send({
        user: result.user,
        accessToken: result.accessToken,
      });
    }
  );

  /**
   * POST /refresh
   * Rotates refresh token via RTR and issues new access token.
   */
  fastify.post("/refresh", async (request, reply) => {
    const rawRefreshToken = request.cookies[REFRESH_COOKIE_NAME];
    if (!rawRefreshToken) {
      return reply.status(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "Refresh token missing",
      });
    }

    const result = await authService.rotateRefreshToken(rawRefreshToken);
    setRefreshTokenCookie(reply, result.refreshToken);

    return reply.status(200).send({
      accessToken: result.accessToken,
    });
  });

  /**
   * POST /logout
   * Invalidates current refresh token session and clears cookie.
   */
  fastify.post("/logout", async (request, reply) => {
    const rawRefreshToken = request.cookies[REFRESH_COOKIE_NAME];
    await authService.logout(rawRefreshToken);
    clearRefreshTokenCookie(reply);

    return reply.status(200).send({
      success: true,
      message: "Logged out successfully",
    });
  });

  /**
   * POST /revoke-all
   * Revokes all active sessions across all devices for the authenticated user.
   */
  fastify.post(
    "/revoke-all",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      await authService.revokeAllUserSessions(request.user.id);
      clearRefreshTokenCookie(reply);

      return reply.status(200).send({
        success: true,
        message: "All sessions have been revoked. Please sign in again.",
      });
    }
  );

  /**
   * GET /me
   * Fetches current authenticated user profile, subscription, and entitlements.
   */
  fastify.get(
    "/me",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const profile = await authService.getCurrentUserProfile(request.user.id);
      return reply.status(200).send({ user: profile });
    }
  );

  /**
   * GET /google
   * Initiates Google OAuth2 Authorization Code redirect.
   */
  fastify.get("/google", async (request, reply) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return reply.status(503).send({
        statusCode: 503,
        error: "Service Unavailable",
        message: "Google OAuth is not configured on this server",
      });
    }

    const state = randomBytes(16).toString("hex");
    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI ||
      "http://localhost:4000/api/v1/auth/google/callback";

    reply.setCookie("oauth_state", state, {
      path: "/api/v1/auth",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 minutes
    });

    const googleAuthUrl = new URL(
      "https://accounts.google.com/o/oauth2/v2/auth"
    );
    googleAuthUrl.searchParams.set("client_id", clientId);
    googleAuthUrl.searchParams.set("redirect_uri", redirectUri);
    googleAuthUrl.searchParams.set("response_type", "code");
    googleAuthUrl.searchParams.set("scope", "openid email profile");
    googleAuthUrl.searchParams.set("state", state);
    googleAuthUrl.searchParams.set("access_type", "offline");
    googleAuthUrl.searchParams.set("prompt", "consent");

    return reply.redirect(googleAuthUrl.toString());
  });

  /**
   * GET /google/callback
   * Google OAuth redirect handler. Exchanges code, links account, sets cookie.
   */
  fastify.get("/google/callback", async (request, reply) => {
    const query = request.query as Record<string, string>;
    const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";

    if (query.error || !query.code) {
      return reply.redirect(`${clientUrl}/login?error=oauth_cancelled`);
    }

    const savedState = request.cookies["oauth_state"];
    if (!savedState || savedState !== query.state) {
      return reply.redirect(`${clientUrl}/login?error=invalid_state`);
    }

    reply.clearCookie("oauth_state", { path: "/api/v1/auth" });

    const tokenData = await exchangeGoogleCodeForTokens(query.code);
    if (!tokenData) {
      return reply.redirect(`${clientUrl}/login?error=token_exchange_failed`);
    }

    const userInfo = await verifyGoogleIdToken(tokenData.idToken);
    if (!userInfo) {
      return reply.redirect(`${clientUrl}/login?error=invalid_google_user`);
    }

    const result = await authService.handleGoogleUser(userInfo);
    setRefreshTokenCookie(reply, result.refreshToken);

    // Redirect to frontend callback route with access token
    return reply.redirect(
      `${clientUrl}/oauth/callback?token=${encodeURIComponent(
        result.accessToken
      )}`
    );
  });

  /**
   * POST /google/token
   * Direct Google ID token verification (for Mobile & Google One-Tap).
   */
  fastify.post("/google/token", async (request, reply) => {
    const parseResult = googleTokenSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "Validation failed",
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    const userInfo = await verifyGoogleIdToken(parseResult.data.idToken);
    if (!userInfo) {
      return reply.status(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "Invalid or unverified Google token",
      });
    }

    const result = await authService.handleGoogleUser(userInfo);
    setRefreshTokenCookie(reply, result.refreshToken);

    return reply.status(200).send({
      user: result.user,
      accessToken: result.accessToken,
    });
  });
};
