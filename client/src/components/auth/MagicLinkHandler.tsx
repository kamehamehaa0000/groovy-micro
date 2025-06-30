import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router'
import { useAuthStore } from '../../store/auth-store'

export const MagicLinkHandler: React.FC = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(
    'loading'
  )
  const [message, setMessage] = useState('')

  const { verifyMagicLink } = useAuthStore()

  const token = searchParams.get('token')

  useEffect(() => {
    if (token) {
      handleMagicLink()
    } else {
      setStatus('error')
      setMessage('Invalid magic link')
    }
  }, [token])

  const handleMagicLink = async () => {
    try {
      await verifyMagicLink(token!)
      setStatus('success')
      setMessage('Successfully signed in!')
      // Redirect to home after 2 seconds
      setTimeout(() => {
        navigate('/')
      }, 2000)
    } catch (error: any) {
      setStatus('error')
      setMessage(
        error.response.data.message ?? 'Magic link verification failed'
      )
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
                  Processing magic link...
                </h3>
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
                  Welcome back!
                </h3>
                <p className="mt-2 text-sm text-gray-600">{message}</p>
                <p className="mt-2 text-xs text-gray-500">
                  Redirecting in 2 seconds...
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
                  Sign In Failed
                </h3>
                <p className="mt-2 text-sm text-gray-600">{message}</p>
                <button
                  onClick={() => navigate('/login')}
                  className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Back to login
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
