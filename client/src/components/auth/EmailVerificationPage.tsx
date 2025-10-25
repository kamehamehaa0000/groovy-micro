import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router'
import { useAuthStore } from '../../store/auth-store'
import { ArrowLeftCircle } from 'lucide-react'

export const EmailVerificationPage: React.FC = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(
    'loading'
  )
  const [message, setMessage] = useState('')

  const { verifyEmail, resendVerificationEmail, isLoading } = useAuthStore()

  const token = searchParams.get('token')
  const email = searchParams.get('email')

  useEffect(() => {
    if (token) {
      handleVerification()
    } else {
      setStatus('error')
      setMessage('Invalid verification link')
    }
  }, [token])

  const handleVerification = async () => {
    try {
      await verifyEmail(token!)
      setStatus('success')
      setMessage('Email verified successfully! You can now sign in.')
      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate('/login')
      }, 3000)
    } catch (error: any) {
      setStatus('error')
      setMessage(error.message ?? 'Verification failed')
    }
  }

  const handleResendVerification = async () => {
    if (!email) return

    try {
      await resendVerificationEmail(email)
      setMessage('Verification email sent! Please check your inbox.')
    } catch (error: any) {
      setMessage(error.message ?? 'Failed to resend verification email')
    }
  }

  return (
    <div className="min-h-screen bg-stone-100 dark:bg-stone-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white  dark:bg-stone-900 py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <div className="text-center">
            {status === 'loading' && (
              <>
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                <h3 className="mt-4 text-lg font-medium text-stone-900">
                  Verifying your email...
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
                <h3 className="mt-4 text-lg font-medium text-stone-900">
                  Email Verified!
                </h3>
                <p className="mt-2 text-sm text-stone-600">{message}</p>
                <p className="mt-2 text-xs text-stone-500">
                  Redirecting to login in 3 seconds...
                </p>
              </>
            )}

            {status === 'error' && (
              <>
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                  <svg
                    className="h-6 w-6 text-orange-600"
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
                <h3 className="mt-4 text-lg font-medium ">
                  Verification Failed
                </h3>
                <p className="mt-2 text-sm text-stone-600">{message}</p>

                {email && (
                  <button
                    onClick={handleResendVerification}
                    disabled={isLoading}
                    className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                  >
                    {isLoading ? 'Sending...' : 'Resend verification email'}
                  </button>
                )}
              </>
            )}
          </div>

          <div className="mt-6 text-center">
            <Link
              to="/login"
              className="text-sm text-orange-600 hover:text-orange-500 flex items-center justify-center mt-4 gap-2"
            >
              <ArrowLeftCircle /> Back to login
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
