import React, { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useAuthStore } from '../../store/auth-store'

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading, checkAuth, isInitialized } =
    useAuthStore()
  const location = useLocation()

  useEffect(() => {
    // Only run checkAuth if app is initialized
    if (isInitialized && !isAuthenticated) {
      checkAuth()
    }
  }, [checkAuth, isAuthenticated, isInitialized])

  // Show loading while checking auth (only after app is initialized)
  if (isInitialized && isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-700 mx-auto"></div>
          <p className="mt-4 text-gray-600">Checking authentication...</p>
        </div>
      </div>
    )
  }

  // Redirect to login if not authenticated
  if (isInitialized && !isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}

export default ProtectedRoute
