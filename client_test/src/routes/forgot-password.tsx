import {
  createFileRoute,
  Link,
  useNavigate,
  redirect,
} from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useAuthStore } from '../stores/auth.store'
import { AuthShell, AuthNotice } from '../Components/auth/AuthShell'
import { AuthField } from '../Components/auth/AuthField'
import { Button } from '../Components/ui'

export const Route = createFileRoute('/forgot-password')({
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
  },
  component: ForgotPasswordComponent,
})

function ForgotPasswordComponent() {
  const navigate = useNavigate()
  const forgotPassword = useAuthStore((s) => s.forgotPassword)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate({ to: '/', replace: true })
    }
  }, [isLoading, isAuthenticated, navigate])

  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [notice, setNotice] = useState<{
    text: string
    type: 'success' | 'error'
  } | null>(null)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const interval = setInterval(() => {
      setCooldown((prev) => prev - 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [cooldown])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || cooldown > 0) return

    setNotice(null)
    setIsSubmitting(true)

    try {
      const res = await forgotPassword(email)
      setNotice({
        text:
          res.message ||
          'If an account with that email exists, password reset instructions have been sent.',
        type: 'success',
      })
      setCooldown(60)
    } catch (err: any) {
      setNotice({
        text:
          err.message ||
          'Failed to dispatch password reset email. Please try again.',
        type: 'error',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isLoading && isAuthenticated) {
    return null
  }

  return (
    <AuthShell variant="narrow">
      <div className="text-center">
        <h1 className="font-serif text-2xl tracking-tight text-foreground">
          Forgot your password?
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-caption leading-relaxed text-muted-foreground">
          Enter the email address associated with your account, and we will
          dispatch a link to reset your credentials.
        </p>
      </div>

      {/* Status Notice */}
      {notice && (
        <AuthNotice
          tone={notice.type === 'success' ? 'success' : 'error'}
          className="mt-6"
        >
          {notice.text}
        </AuthNotice>
      )}

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5">
        <AuthField
          label="Email Address"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@domain.com"
        />

        <Button
          type="submit"
          disabled={isSubmitting || cooldown > 0 || !email}
          block
          className="mt-1"
        >
          {isSubmitting
            ? 'Dispatching...'
            : cooldown > 0
              ? `Resend available in ${cooldown}s`
              : 'Send Reset Link'}
        </Button>
      </form>

      <div className="mt-8 flex flex-col items-center gap-2 border-t border-border-soft pt-6 text-caption text-muted-foreground">
        <div>
          Remember your credentials?{' '}
          <Link to="/login" className="text-primary hover:underline">
            Sign In
          </Link>
        </div>
        <div>
          Don't have an account?{' '}
          <Link to="/register" className="text-primary hover:underline">
            Create an account
          </Link>
        </div>
      </div>
    </AuthShell>
  )
}
