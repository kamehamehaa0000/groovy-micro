import axios from 'axios'
import { useAuthStore } from '../store/auth-store'
import toast from 'react-hot-toast'

const axiosInstance = axios.create({
  withCredentials: true,
})

axiosInstance.interceptors.request.use(
  (config) => {
    const { accessToken } = useAuthStore.getState()
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      try {
        const { refreshToken } = useAuthStore.getState()
        await refreshToken()

        const { accessToken } = useAuthStore.getState()
        if (accessToken) {
          originalRequest.headers.Authorization = `Bearer ${accessToken}`
          return axiosInstance(originalRequest)
        }
      } catch (refreshError) {
        useAuthStore.getState().logout()
        toast.error('Session expired. Please log in again.')
        return Promise.reject(refreshError)
      }
    }
    return Promise.reject(error)
  }
)

export default axiosInstance
