import axios from 'axios'
import toast from 'react-hot-toast'
import { create } from 'zustand'
// Remove persist middleware completely
import axiosInstance from '../utils/axios-interceptor'

const API_BASE_URL = `${import.meta.env.VITE_API_GATEWAY_URL!}/auth`

export interface User {
  id: string
  email: string
  displayName: string
  isEmailVerified: boolean
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | string[] | null
  accessToken: string | null
  isInitialized: boolean // New flag to track if auth has been initialized
}

export interface AuthActions {
  login: (email: string, password: string) => Promise<void>
  register: (userData: {
    email: string
    password: string
    displayName: string
  }) => Promise<void>
  logout: () => Promise<void>
  getCurrentUser: () => Promise<User | void | null>
  refreshToken: () => Promise<string | null>
  requestPasswordReset: (email: string) => Promise<void>
  verifyEmail: (token: string) => Promise<void>
  resendVerificationEmail: (email: string) => Promise<void>
  resetPassword: (token: string, newPassword: string) => Promise<void>
  verifyMagicLink: (token: string) => Promise<void>
  requestMagicLink: (email: string) => Promise<void>
  clearError: () => void
  setTokens: (accessToken: string) => void
  checkAuth: () => Promise<void>
  changeDisplayName: (newDisplayName: string) => Promise<void>
  initializeAuth: () => Promise<void> // New method for app startup
}

type AuthStore = AuthState & AuthActions
let refreshPromise: Promise<void> | null = null

export const useAuthStore = create<AuthStore>()((set, get) => ({
  //Initial State - Everything in memory only
  isAuthenticated: false,
  user: null,
  isLoading: false,
  accessToken: null,
  error: null,
  isInitialized: false,

  //Actions
  login: async (email, password) => {
    set({ isLoading: true, error: null })
    try {
      const response = await axios.post(
        `${API_BASE_URL}/login`,
        {
          email,
          password,
        },
        {
          withCredentials: true,
        }
      )
      const { accessToken, user } = response.data
      set({
        accessToken,
        user,
        isAuthenticated: true,
        isLoading: false,
      })
      toast.success('Login successful!')
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      throw error
    }
  },

  register: async (userData) => {
    set({ isLoading: true, error: null })
    try {
      await axios.post(`${API_BASE_URL}/register`, userData, {
        withCredentials: true,
      })
      set({ isLoading: false })
    } catch (error) {
      const errors = (error as any).response?.data?.errors
      if (Array.isArray(errors) && errors.length > 0) {
        const errorMessages = errors.map((err: any) => {
          return err.message + ' - ' + err.reason
        })
        set({
          error: errorMessages,
          isLoading: false,
        })
      } else {
        set({
          error:
            'Error Registering the user, Try again later or verify your inputs.',
          isLoading: false,
        })
      }
      throw error
    }
  },

  logout: async () => {
    const currentAccessToken = get().accessToken
    try {
      if (currentAccessToken) {
        await axios.post(
          `${API_BASE_URL}/logout`,
          {},
          {
            headers: {
              Authorization: `Bearer ${currentAccessToken}`,
            },
            withCredentials: true,
          }
        )
      }
    } catch (error) {
      console.error('Logout API error (ignoring):', error)
    } finally {
      set({
        user: null,
        isAuthenticated: false,
        accessToken: null,
        error: null,
        isLoading: false,
      })
    }
  },

  clearError: () => {
    set({ error: null })
  },

  setTokens: (accessToken: string) => {
    set({ accessToken })
  },

  refreshToken: async (): Promise<string | null> => {
    if (refreshPromise) {
      await refreshPromise
      return get().accessToken
    }

    refreshPromise = (async () => {
      try {
        const response = await axios.post(
          `${API_BASE_URL}/refresh-token`,
          {},
          {
            withCredentials: true,
          }
        )

        const { user, accessToken } = await response.data

        set({
          user,
          isAuthenticated: true,
          accessToken,
        })

        return accessToken
      } catch (error) {
        console.error('Token refresh failed:', error)
        set({
          user: null,
          isAuthenticated: false,
          accessToken: null,
        })
        throw error
      } finally {
        refreshPromise = null
      }
    })()

    await refreshPromise
    return get().accessToken
  },

  // New method: Initialize auth state on app startup
  initializeAuth: async (): Promise<void> => {
    const currentState = get()

    // Prevent multiple initializations
    if (currentState.isInitialized) {
      return
    }

    set({ isLoading: true, error: null })

    try {
      // Try to refresh token (this will check if refresh token exists in cookies)
      await get().refreshToken()

      // If successful, we're authenticated
      console.log('Auth initialized successfully from refresh token')
    } catch (error) {
      // No valid refresh token or refresh failed
      console.log('No valid refresh token found or refresh failed:', error)
      set({
        user: null,
        isAuthenticated: false,
        accessToken: null,
        error: null,
      })
    } finally {
      set({
        isLoading: false,
        isInitialized: true,
      })
    }
  },

  checkAuth: async (): Promise<void> => {
    const currentState = get()

    // If not initialized yet, initialize first
    if (!currentState.isInitialized) {
      await get().initializeAuth()
      return
    }

    // Prevent multiple simultaneous checkAuth calls
    if (currentState.isLoading) {
      return
    }

    // If already authenticated with valid token, just return
    if (
      currentState.isAuthenticated &&
      currentState.accessToken &&
      currentState.user
    ) {
      return
    }

    // If not authenticated, try to refresh
    if (!currentState.isAuthenticated || !currentState.accessToken) {
      try {
        await get().refreshToken()
      } catch (error) {
        console.log('Refresh failed during checkAuth:', error)
        set({
          user: null,
          isAuthenticated: false,
          accessToken: null,
          error: null,
        })
      }
    }
  },

  // ...rest of existing methods remain the same...
  requestPasswordReset: async (email: string) => {
    set({ isLoading: true, error: null })
    try {
      await axios.post(`${API_BASE_URL}/reset-password/request`, {
        email,
      })
      set({ isLoading: false })
      toast.success('Password reset email sent!')
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      throw error
    }
  },

  verifyEmail: async (token: string) => {
    set({ isLoading: true, error: null })
    try {
      const res = await axios.post(`${API_BASE_URL}/verify-email`, {
        token,
      })
      const { user, accessToken } = res.data
      set({
        user,
        accessToken,
        isAuthenticated: true,
        isLoading: false,
      })
      toast.success('Email verified successfully!')
    } catch (error) {
      const errors = (error as any).response?.data?.errors
      if (Array.isArray(errors) && errors.length > 0) {
        const errorMessages = errors.map((err: any) => {
          return err.message + ' - ' + err.reason
        })
        set({
          error: errorMessages,
          isLoading: false,
        })
      } else {
        set({
          error: 'Error verifying the user.',
          isLoading: false,
        })
      }
      throw error
    }
  },

  resendVerificationEmail: async (email: string) => {
    set({ isLoading: true, error: null })
    try {
      await axios.post(`${API_BASE_URL}/resend-verification-email`, {
        email,
      })
      set({ isLoading: false })
      toast.success('Verification email sent!')
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      throw error
    }
  },

  resetPassword: async (token: string, newPassword: string) => {
    set({ isLoading: true, error: null })
    try {
      await axios.post(`${API_BASE_URL}/reset-password/verify`, {
        token,
        newPassword,
      })
      set({ isLoading: false })
      toast.success('Password reset successfully!')
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      throw error
    }
  },

  verifyMagicLink: async (token: string) => {
    set({ isLoading: true, error: null })
    try {
      const response = await axios.post(
        `${API_BASE_URL}/magic-link/verify`,
        { token },
        {
          withCredentials: true,
        }
      )
      const { accessToken, user } = response.data
      set({
        accessToken,
        user,
        isAuthenticated: true,
        isLoading: false,
      })

      toast.success('Magic link verified successfully!')
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      throw error
    }
  },

  requestMagicLink: async (email: string) => {
    set({ isLoading: true, error: null })
    try {
      await axios.post(`${API_BASE_URL}/magic-link/request`, { email })
      set({ isLoading: false })
      toast.success('Magic link sent to your email!')
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      throw error
    }
  },

  getCurrentUser: async (): Promise<void | User | null> => {
    set({ isLoading: true, error: null })
    try {
      const response = await axiosInstance.get(`${API_BASE_URL}/me`)
      set({
        isLoading: false,
        user: response.data.user,
        isAuthenticated: true,
      })
      return response.data
    } catch (error) {
      set({ isLoading: false, error: (error as Error).message })
      throw error
    }
  },
  changeDisplayName: async (newDisplayName: string) => {
    set({ isLoading: true, error: null })
    try {
      await axiosInstance.put(`${API_BASE_URL}/change-display-name`, {
        newDisplayName,
      })
    } catch (error) {
      set({ isLoading: false, error: (error as Error).message })
      throw error
    }
  },
}))
