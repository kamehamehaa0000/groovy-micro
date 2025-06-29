import axios, { AxiosError } from 'axios'
import toast from 'react-hot-toast'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import axiosInstance from '../utils/axios-interceptor'

const API_BASE_URL = 'http://localhost:4000/api/v1'

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
}
type AuthStore = AuthState & AuthActions
let refreshPromise: Promise<void> | null = null

export const authStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      //Initial State
      isAuthenticated: false,
      user: null,
      isLoading: false,
      accessToken: null,
      error: null,

      //Actions
      login: async (email, password) => {
        set({ isLoading: true, error: null })
        try {
          const response = await axios.post(
            `${API_BASE_URL}/auth/login`,
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
          await axios.post(`${API_BASE_URL}/auth/register`, userData, {
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
        try {
          await axios.post(
            `${API_BASE_URL}/auth/logout`,
            {},
            {
              headers: {
                Authorization: `Bearer ${get().accessToken ?? ''}`,
              },
              withCredentials: true,
            }
          )
          toast.success('Logout successful!')
        } catch (error) {
          console.error('Logout error:', error)
          throw error
        } finally {
          set({
            user: null,
            isAuthenticated: false,
            accessToken: null,
            error: null,
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
        // Prevent multiple simultaneous refresh requests
        if (refreshPromise) {
          await refreshPromise
          return get().accessToken
        }

        refreshPromise = (async () => {
          try {
            const response = await axios.post(
              `${API_BASE_URL}/auth/refresh-token`,
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
            // Clear auth state on refresh failure
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

      requestPasswordReset: async (email: string) => {
        set({ isLoading: true, error: null })
        try {
          await axios.post(`${API_BASE_URL}/auth/reset-password/request`, {
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
          const res = await axios.post(`${API_BASE_URL}/auth/verify-email`, {
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
          await axios.post(`${API_BASE_URL}/auth/resend-verification-email`, {
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
          await axios.post(`${API_BASE_URL}/auth/reset-password/verify`, {
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
            `${API_BASE_URL}/auth/magic-link/verify`,
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
          await axios.post(`${API_BASE_URL}/auth/magic-link/request`, { email })
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
          const response = await axiosInstance.get(`${API_BASE_URL}/auth/me`)
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

      checkAuth: async (): Promise<void> => {
        set({ isLoading: true, error: null })
        try {
          const accessToken = get().accessToken

          if (!accessToken) {
            // No access token, try to refresh
            try {
              await get().refreshToken()
              return
            } catch (error) {
              // Refresh failed, user is not authenticated
              set({
                user: null,
                isAuthenticated: false,
                accessToken: null,
                isLoading: false,
              })
              return
            }
          }

          // Try to get user data with current token
          const response = await axios.get(`${API_BASE_URL}/auth/me`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            withCredentials: true,
          })

          if (response.status === 200) {
            // Token is valid
            set({
              user: response.data,
              isAuthenticated: true,
              isLoading: false,
            })
          }
        } catch (error: any) {
          if (error.response?.status === 401) {
            // Access token expired, try to refresh
            try {
              await get().refreshToken()
            } catch (refreshError) {
              // Refresh failed, clear auth
              set({
                user: null,
                isAuthenticated: false,
                accessToken: null,
                isLoading: false,
              })
            }
          } else {
            // Other error, clear auth
            set({
              user: null,
              isAuthenticated: false,
              accessToken: null,
              isLoading: false,
            })
          }
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        user: state.user,
        accessToken: state.accessToken,
      }),
    }
  )
)
