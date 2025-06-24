import axios from 'axios'
import { create } from 'zustand'

export interface IAuthStore {
  isLoggedIn: boolean
  userId: string | null
  email: string | null
  accessToken: string | null
  isEmailVerified: boolean
  setIsLoggedIn: (isLoggedIn: boolean) => void
  setAuth: (userId: string, accessToken: string) => void
  setToken: (accessToken: string) => void
  clearAuth: () => void
  login: (email: string, password: string) => Promise<void>
}

export const authStore = create<IAuthStore>((set) => ({
  isLoggedIn: false,
  userId: null,
  email: null,
  accessToken: null,
  isEmailVerified: false,
  setIsLoggedIn: (isLoggedIn: boolean) => set({ isLoggedIn }),
  setToken: (accessToken: string) => set({ accessToken }),
  setAuth: (userId: string, accessToken: string) =>
    set({ userId, accessToken, isLoggedIn: true }),
  clearAuth: () => set({ userId: null, accessToken: null, isLoggedIn: false }),
  login: async (email: string, password: string) => {
    try {
      const res = await axios.post('http://localhost:4000/api/v1/auth/login', {
        email: email.trim(),
        password: password.trim(),
      })
      console.log('Login response:', res.data)
      const { accessToken } = res.data
      if (!accessToken) {
        throw new Error('No access token received from server')
      }
      set({
        accessToken,
        isLoggedIn: true,
        userId: res.data.user.id,
        isEmailVerified: res.data.user.isEmailVerified,
        email: res.data.user.email,
      })
    } catch (err: any) {
      console.log('LoginError', err.response.data.errors)
      throw new Error('Login failed, Invalid Credentials.')
    }
  },
}))
