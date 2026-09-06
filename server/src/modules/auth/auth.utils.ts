import { randomUUID } from "crypto";
import type { FastifyReply } from "fastify";

export const ACCESS_TOKEN_TTL_SEC = parseInt(
  process.env.ACCESS_TOKEN_TTL_SEC || "900",
  10
); // 15 minutes
export const REFRESH_TOKEN_TTL_SEC = parseInt(
  process.env.REFRESH_TOKEN_TTL_SEC || "604800",
  10
); // 7 days

export const REFRESH_COOKIE_NAME = "refresh_token";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Returns standard secure cookie configuration for the refresh token.
 */
export function getRefreshCookieOptions() {
  return {
    path: "/api/v1/auth",
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    maxAge: REFRESH_TOKEN_TTL_SEC,
  };
}

/**
 * Attaches the refresh token cookie to the response.
 */
export function setRefreshTokenCookie(
  reply: FastifyReply,
  refreshToken: string
): void {
  reply.setCookie(
    REFRESH_COOKIE_NAME,
    refreshToken,
    getRefreshCookieOptions()
  );
}

/**
 * Clears the refresh token cookie upon logout.
 */
export function clearRefreshTokenCookie(reply: FastifyReply): void {
  reply.clearCookie(REFRESH_COOKIE_NAME, {
    path: "/api/v1/auth",
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
  });
}

/**
 * Generates cryptographic UUIDs for token families and unique JTIs.
 */
export function generateTokenIdentifiers(): { familyId: string; jti: string } {
  return {
    familyId: randomUUID(),
    jti: randomUUID(),
  };
}

export interface GoogleUserInfo {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture?: string;
}

/**
 * Verifies a Google ID token using Google's tokeninfo endpoint.
 * Highly portable, standard Fetch API compatible with both Node.js and Bun.
 */
export async function verifyGoogleIdToken(
  idToken: string
): Promise<GoogleUserInfo | null> {
  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(
        idToken
      )}`
    );

    if (!res.ok) {
      return null;
    }

    const payload = (await res.json()) as Record<string, any>;

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (clientId && payload.aud !== clientId && clientId !== "dev_google_client_id") {
      return null;
    }

    const isEmailVerified =
      payload.email_verified === "true" || payload.email_verified === true;

    return {
      sub: payload.sub,
      email: payload.email,
      emailVerified: isEmailVerified,
      name: payload.name || payload.email.split("@")[0],
      picture: payload.picture,
    };
  } catch {
    return null;
  }
}

/**
 * Exchanges Google OAuth authorization code for tokens.
 */
export async function exchangeGoogleCodeForTokens(
  code: string
): Promise<{ idToken: string; accessToken: string } | null> {
  try {
    const params = new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      redirect_uri:
        process.env.GOOGLE_REDIRECT_URI ||
        "http://localhost:4000/api/v1/auth/google/callback",
      grant_type: "authorization_code",
    });

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!res.ok) {
      return null;
    }

    const data = (await res.json()) as Record<string, any>;
    return {
      idToken: data.id_token,
      accessToken: data.access_token,
    };
  } catch {
    return null;
  }
}
