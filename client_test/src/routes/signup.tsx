import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuthStore } from '../stores/auth.store'

export const Route = createFileRoute('/signup')({
  beforeLoad: async () => {
    const { isLoading, checkAuth } = useAuthStore.getState()
    if (isLoading) {
      try {
        await checkAuth()
      } catch {
        // ignore
      }
    }
    if (useAuthStore.getState().isAuthenticated) {
      throw redirect({ to: '/' })
    }
    throw redirect({ to: '/register' })
  },
})
