import { create } from "zustand";
import { api } from "../lib/api";
import type { UserProfile } from "../types/auth";

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
  ) => Promise<void>;
  logout: () => Promise<void>;
  revokeAll: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

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

  clearAuth: () =>
    set({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
    }),

  checkAuth: async () => {
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

      // 2. Fetch user profile
      const profileData = await api.get<{ user: UserProfile }>(
        "/api/v1/auth/me",
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      set({ user: profileData.user, isAuthenticated: true });
    } catch {
      set({ user: null, accessToken: null, isAuthenticated: false });
    } finally {
      set({ isLoading: false });
    }
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
  },

  register: async (email, password, displayName) => {
    const data = await api.post<{ accessToken: string }>(
      "/api/v1/auth/register",
      {
        email,
        password,
        displayName,
      }
    );

    set({ accessToken: data.accessToken, isAuthenticated: true });

    const profileData = await api.get<{ user: UserProfile }>(
      "/api/v1/auth/me",
      {
        headers: { Authorization: `Bearer ${data.accessToken}` },
      }
    );

    set({ user: profileData.user });
  },

  logout: async () => {
    try {
      await api.post("/api/v1/auth/logout");
    } finally {
      get().clearAuth();
    }
  },

  revokeAll: async () => {
    try {
      await api.post("/api/v1/auth/revoke-all");
    } finally {
      get().clearAuth();
    }
  },

  refreshProfile: async () => {
    const profileData = await api.get<{ user: UserProfile }>("/api/v1/auth/me");
    set({ user: profileData.user });
  },
}));
