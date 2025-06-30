import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router'
import { useAuthStore } from '../../store/auth-store'

export const LoginSuccessHandler: React.FC = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(
    'loading'
  )
  const [message, setMessage] = useState('')

  const token = searchParams.get('token')
  const from = searchParams.get('from') ?? '/'

  useEffect(() => {
    if (token) {
      console.log('Google auth token:', token)
      handleGoogleAuthSuccess()
    } else {
      setStatus('error')
      setMessage('No authentication token found')
    }
  }, [token])
  const { refreshToken } = useAuthStore()
  const handleGoogleAuthSuccess = async () => {
    try {
      const data = await refreshToken()
      console.log('Google auth data:', data)
      setStatus('success')
      setMessage('Successfully signed in with Google!')

      // Redirect after a short delay
      setTimeout(() => {
        navigate(from, { replace: true })
      }, 2000)
    } catch (error) {
      console.error('Google auth success handler error:', error)
      setStatus('error')
      setMessage(
        'Authentication verification failed. Please try signing in again.'
      )

      // Redirect to login page after error
      setTimeout(() => {
        navigate('/login', { replace: true })
      }, 3000)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <div className="text-center">
            {status === 'loading' && (
              <>
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                <h3 className="mt-4 text-lg font-medium text-gray-900">
                  Completing Google sign in...
                </h3>
                <p className="mt-2 text-sm text-gray-600">
                  Please wait while we verify your authentication.
                </p>
              </>
            )}

            {status === 'success' && (
              <>
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
                  <svg
                    className="h-6 w-6 text-green-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <h3 className="mt-4 text-lg font-medium text-gray-900">
                  Welcome to Groovy!
                </h3>
                <p className="mt-2 text-sm text-gray-600">{message}</p>
                <p className="mt-2 text-xs text-gray-500">
                  Redirecting you now...
                </p>
              </>
            )}

            {status === 'error' && (
              <>
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                  <svg
                    className="h-6 w-6 text-red-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </div>
                <h3 className="mt-4 text-lg font-medium text-gray-900">
                  Authentication Error
                </h3>
                <p className="mt-2 text-sm text-gray-600">{message}</p>
                <p className="mt-2 text-xs text-gray-500">
                  Redirecting to login page...
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
