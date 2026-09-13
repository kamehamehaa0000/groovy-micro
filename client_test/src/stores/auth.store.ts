import { create } from "zustand";
import { api } from "../lib/api";
import type { UserProfile } from "../types/auth";
import { usePlayerStore } from "./player.store";

interface AuthState {
  user: UserProfile | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  setAccessToken: (token: string | null) => void;
  setUser: (user: UserProfile | null) => void;
  clearAuth: () => void;

  checkAuth: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    displayName: string
  ) => Promise<{ message: string; email: string }>;
  verifyEmail: (token: string) => Promise<void>;
  resendVerification: (email: string) => Promise<{ success: boolean; message: string }>;
  forgotPassword: (email: string) => Promise<{ success: boolean; message: string }>;
  resetPassword: (
    token: string,
    newPassword: string
  ) => Promise<{ success: boolean; message: string }>;
  logout: () => Promise<void>;
  revokeAll: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

let checkAuthPromise: Promise<void> | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  isLoading: true,
  isAuthenticated: false,

  setAccessToken: (token) =>
    set({
      accessToken: token,
      isAuthenticated: !!token,
    }),

  setUser: (user) =>
    set({
      user,
      isAuthenticated: !!user,
    }),

  clearAuth: () => {
    set({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
    });
  },

  checkAuth: async () => {
    if (checkAuthPromise) {
      return checkAuthPromise;
    }

    checkAuthPromise = (async () => {
      try {
        set({ isLoading: true });
        // 1. Silent refresh via cookie
        const refreshRes = await fetch("/api/v1/auth/refresh", {
          method: "POST",
          credentials: "include",
        });

        if (!refreshRes.ok) {
          set({ user: null, accessToken: null, isAuthenticated: false });
          return;
        }

        const data = await refreshRes.json();
        const token = data.accessToken;
        set({ accessToken: token, isAuthenticated: true });

        // 2. Fetch user profile directly (avoiding circular 401 interceptors)
        const meRes = await fetch("/api/v1/auth/me", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          credentials: "include",
        });

        if (!meRes.ok) {
          set({ user: null, accessToken: null, isAuthenticated: false });
          return;
        }

        const profileData = await meRes.json();
        set({ user: profileData.user, isAuthenticated: true });
      } catch {
        set({ user: null, accessToken: null, isAuthenticated: false });
      } finally {
        set({ isLoading: false });
        checkAuthPromise = null;
      }
    })();

    return checkAuthPromise;
  },

  login: async (email, password) => {
    const data = await api.post<{ accessToken: string }>("/api/v1/auth/login", {
      email,
      password,
    });

    set({ accessToken: data.accessToken, isAuthenticated: true });

    // Fetch full profile with subscription
    const profileData = await api.get<{ user: UserProfile }>(
      "/api/v1/auth/me",
      {
        headers: { Authorization: `Bearer ${data.accessToken}` },
      }
    );

    set({ user: profileData.user });
    usePlayerStore.getState().initializeSync(true);
  },

  register: async (email, password, displayName) => {
    const data = await api.post<{
      user: { id: string; email: string; displayName: string };
      message: string;
    }>("/api/v1/auth/register", {
      email,
      password,
      displayName,
    });

    return { message: data.message, email: data.user.email };
  },

  verifyEmail: async (token: string) => {
    const data = await api.post<{
      user: UserProfile;
      accessToken: string;
      message: string;
    }>("/api/v1/auth/verify-email", { token });

    set({
      accessToken: data.accessToken,
      isAuthenticated: true,
      isLoading: false,
    });

    // Fetch complete user profile with subscription details
    const profileData = await api.get<{ user: UserProfile }>(
      "/api/v1/auth/me",
      {
        headers: { Authorization: `Bearer ${data.accessToken}` },
      }
    );

    set({ user: profileData.user, isAuthenticated: true });
    usePlayerStore.getState().initializeSync(true);
  },

  resendVerification: async (email: string) => {
    return await api.post<{ success: boolean; message: string }>(
      "/api/v1/auth/resend-verification",
      { email }
    );
  },

  forgotPassword: async (email: string) => {
    return await api.post<{ success: boolean; message: string }>(
      "/api/v1/auth/forgot-password",
      { email }
    );
  },

  resetPassword: async (token: string, newPassword: string) => {
    return await api.post<{ success: boolean; message: string }>(
      "/api/v1/auth/reset-password",
      { token, newPassword }
    );
  },

  logout: async () => {
    try {
      await api.post("/api/v1/auth/logout");
    } finally {
      get().clearAuth();
      usePlayerStore.getState().stopPlayback();
    }
  },

  revokeAll: async () => {
    try {
      await api.post("/api/v1/auth/revoke-all");
    } finally {
      get().clearAuth();
      usePlayerStore.getState().stopPlayback();
    }
  },

  refreshProfile: async () => {
    try {
      const profileData = await api.get<{ user: UserProfile }>("/api/v1/auth/me");
      set({ user: profileData.user, isAuthenticated: true, isLoading: false });
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },
}));
