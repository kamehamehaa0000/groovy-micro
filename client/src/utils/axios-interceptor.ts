import axios from 'axios'
import { authStore } from '../store/auth-store'
import toast from 'react-hot-toast'

const axiosInstance = axios.create({
  withCredentials: true,
})

// Request interceptor to add access token
axiosInstance.interceptors.request.use(
  (config) => {
    const { accessToken } = authStore.getState()
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor for automatic token refresh
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      try {
        const { refreshToken } = authStore.getState()
        await refreshToken()

        const { accessToken } = authStore.getState()
        if (accessToken) {
          originalRequest.headers.Authorization = `Bearer ${accessToken}`
          return axiosInstance(originalRequest)
        }
      } catch (refreshError) {
        authStore.getState().logout()
        toast.error('Session expired. Please log in again.')
        window.location.href = '/login' // LATER: Remove if not needed
        return Promise.reject(refreshError)
      }
    }
    return Promise.reject(error)
  }
)

export default axiosInstance
