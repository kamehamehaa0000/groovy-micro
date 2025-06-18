import axios from 'axios'
import React, { useState, useEffect } from 'react'

import { authStore } from '../store/auth-store'
import { useNavigate } from 'react-router'

type VerificationStatus =
  | 'loading'
  | 'success'
  | 'error'
  | 'expired'
  | 'invalid'

const VerifyMagicLink: React.FC = () => {
  const [status, setStatus] = useState<VerificationStatus>('loading')
  const [message, setMessage] = useState<string>('Verifying your login link...')
  const [countdown, setCountdown] = useState<number>(3)
  const navigate = useNavigate()
  const { setAuth, isLoggedIn } = authStore()

  useEffect(() => {
    const verifyToken = async () => {
      // Get token from URL
      const urlParams = new URLSearchParams(window.location.search)
      const token = urlParams.get('token')

      // Clear token from URL for security

      if (!token) {
        setStatus('invalid')
        setMessage('Invalid login link. No token provided.')
        return
      }

      try {
        // Send verification request
        const res = await axios.post(
          'http://localhost:4000/api/v1/auth/magic-link/verify',
          { token },
          {
            withCredentials: true,
          }
        )

        // Authentication successful
        if (res.data.accessToken) {
          setAuth(res.data.user?.id, res.data.accessToken)
          setStatus('success')
          setMessage('Login successful! Redirecting to dashboard...')

          // Redirect countdown
          const timer = setInterval(() => {
            setCountdown((prev) => {
              if (prev <= 1) {
                clearInterval(timer)
                navigate('/') // Redirect after countdown
                window.history.replaceState(
                  {},
                  document.title,
                  '/auth/magic-link'
                )

                return 0
              }
              return prev - 1
            })
          }, 1000)

          return () => clearInterval(timer)
        } else {
          throw new Error('No access token received')
        }
      } catch (error: any) {
        console.error('Magic link verification error:', error)

        // Handle different error types
        if (error.response?.status === 401) {
          if (error.response.data?.message?.includes('expired')) {
            setStatus('expired')
            setMessage('Your login link has expired. Please request a new one.')
          } else {
            setStatus('invalid')
            setMessage('Invalid login link. Please request a new one.')
          }
        } else {
          setStatus('error')
          setMessage(
            error.response?.data?.message ||
              error.response?.data?.errors?.[0]?.message ||
              'An error occurred during verification'
          )
        }
      }
    }

    // Skip verification if already authenticated
    if (isLoggedIn) {
      setStatus('success')
      setMessage('You are already logged in!')
      const timer = setTimeout(() => navigate('/dashboard'), 2000)
      return () => clearTimeout(timer)
    }

    verifyToken()
  }, []) // Empty dependency array ensures this runs once

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (isLoggedIn && status !== 'success') {
      navigate('/dashboard')
    }
  }, [isLoggedIn, navigate, status])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen w-full bg-zinc-900 text-white p-4">
      <div className="max-w-md w-full bg-zinc-800 rounded-lg shadow-lg p-8 text-center">
        {status === 'loading' && (
          <div className="space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
            <h2 className="text-2xl font-bold text-white">{message}</h2>
            <p className="text-zinc-400">
              Please wait while we verify your login link...
            </p>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-4">
            <div className="text-6xl mx-auto">✅</div>
            <h2 className="text-2xl font-bold text-green-500">{message}</h2>
            <p className="text-zinc-400">
              Redirecting in {countdown} seconds...
            </p>
            <div className="mt-4">
              <button
                onClick={() => navigate('/dashboard')}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-8 rounded"
              >
                Go to Dashboard Now
              </button>
            </div>
          </div>
        )}

        {status === 'expired' && (
          <div className="space-y-4">
            <div className="text-6xl mx-auto">⏱️</div>
            <h2 className="text-2xl font-bold text-amber-500">Link Expired</h2>
            <p className="text-zinc-300">{message}</p>
            <div className="mt-6 space-y-3">
              <button
                onClick={() => navigate('/login/magic-link')}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
              >
                Request New Link
              </button>
              <button
                onClick={() => navigate('/login')}
                className="w-full bg-zinc-700 hover:bg-zinc-600 text-white font-bold py-2 px-4 rounded"
              >
                Return to Login
              </button>
            </div>
          </div>
        )}

        {status === 'invalid' && (
          <div className="space-y-4">
            <div className="text-6xl mx-auto">❌</div>
            <h2 className="text-2xl font-bold text-red-500">Invalid Link</h2>
            <p className="text-zinc-300">{message}</p>
            <div className="mt-6 space-y-3">
              <button
                onClick={() => navigate('/login/magic-link')}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
              >
                Request New Link
              </button>
              <button
                onClick={() => navigate('/login')}
                className="w-full bg-zinc-700 hover:bg-zinc-600 text-white font-bold py-2 px-4 rounded"
              >
                Return to Login
              </button>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-4">
            <div className="text-6xl mx-auto">⚠️</div>
            <h2 className="text-2xl font-bold text-red-500">
              Verification Failed
            </h2>
            <p className="text-zinc-300">{message}</p>
            <div className="mt-6 space-y-3">
              <button
                onClick={() => navigate('/login')}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
              >
                Return to Login
              </button>
              <button
                onClick={() => navigate('/')}
                className="w-full bg-zinc-700 hover:bg-zinc-600 text-white font-bold py-2 px-4 rounded"
              >
                Go to Home
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default VerifyMagicLink
