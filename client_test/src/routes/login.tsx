import {
  createFileRoute,
  Link,
  useNavigate,
  redirect,
} from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { z } from 'zod'
import { useAuthStore } from '../stores/auth.store'
import { GoogleIcon } from '../Components/Icons'
import { AuthShell, AuthNotice } from '../Components/auth/AuthShell'
import { AuthField, PasswordInput } from '../Components/auth/AuthField'
import { Button } from '../Components/ui'
import { Tabs } from '../Components/ui/Tabs'
import {
  resolveRedirectTarget,
  saveAuthRedirect,
} from '../lib/auth-redirect'
import { H2 } from '../Components/ui/typography'

const loginSearchSchema = z.object({
  redirect: z.string().optional(),
})

export const Route = createFileRoute('/login')({
  validateSearch: (search) => loginSearchSchema.parse(search),
  beforeLoad: async ({ search }) => {
    const { isLoading, checkAuth } = useAuthStore.getState()
    if (isLoading) {
      try {
        await checkAuth()
      } catch {
        // ignore
      }
    }
    if (useAuthStore.getState().isAuthenticated) {
      throw redirect({ to: resolveRedirectTarget(search?.redirect) })
    }
  },
  component: LoginComponent,
})

function LoginComponent() {
  const { redirect: redirectParam } = Route.useSearch()
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)
  const resendVerification = useAuthStore((s) => s.resendVerification)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate({ to: resolveRedirectTarget(redirectParam), replace: true })
    }
  }, [isLoading, isAuthenticated, navigate, redirectParam])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Resend state for unverified accounts
  const [isResending, setIsResending] = useState(false)
  const [resendNotice, setResendNotice] = useState<{
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
    setError(null)
    setResendNotice(null)
    setIsSubmitting(true)

    try {
      await login(email, password)
      const destination = resolveRedirectTarget(redirectParam)
      navigate({ to: destination })
    } catch (err: any) {
      setError(err.message || 'Login failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleResend = async () => {
    if (!email || cooldown > 0) return
    setResendNotice(null)
    setIsResending(true)

    try {
      const res = await resendVerification(email)
      setResendNotice({
        text:
          res.message || 'Verification email sent! Please check your inbox.',
        type: 'success',
      })
      setCooldown(60)
    } catch (err: any) {
      setResendNotice({
        text: err.message || 'Failed to resend verification email.',
        type: 'error',
      })
    } finally {
      setIsResending(false)
    }
  }

  const isUnverifiedError =
    error &&
    (error.toLowerCase().includes('verify your email') ||
      error.toLowerCase().includes('verify'))

  if (!isLoading && isAuthenticated) {
    return null
  }

  return (
    <AuthShell>
      {/* Mobile Back to Home Navigation */}
      <div className="mb-6 lg:hidden">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
        >
          <span aria-hidden="true">&larr;</span>
          <span>Back to home</span>
        </Link>
      </div>

      <Tabs
        variant="underline"
        ariaLabel="Authentication"
        className="mb-7"
        value="signin"
        onChange={() => undefined}
        items={[
          { id: 'signin', label: 'Sign In' },
          {
            id: 'register',
            label: (
              <Link
                to="/register"
                search={redirectParam ? { redirect: redirectParam } : undefined}
                className="hover:underline"
              >
                Create Account
              </Link>
            ),
          },
        ]}
      />

      <H2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Welcome back</H2>
      <p className="mt-1.5 text-caption leading-relaxed text-muted-foreground">
        Enter your <span className="italic">groove</span> with the account you
        keep on file.
      </p>

      {/* Error Notice */}
      {error && (
        <AuthNotice tone="error" className="mt-6">
          <p>{error}</p>
          {isUnverifiedError && (
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-destructive/20 pt-3">
              <span className="font-eyebrow text-muted-foreground">
                Didn't receive the email?
              </span>
              <button
                type="button"
                onClick={handleResend}
                disabled={isResending || cooldown > 0}
                className="font-eyebrow text-eyebrow uppercase tracking-wider text-primary transition-colors hover:underline disabled:opacity-50"
              >
                {cooldown > 0
                  ? `Resend in ${cooldown}s`
                  : isResending
                    ? 'Sending...'
                    : 'Resend Link'}
              </button>
            </div>
          )}
        </AuthNotice>
      )}

      {/* Resend Notice */}
      {resendNotice && (
        <AuthNotice
          tone={resendNotice.type === 'success' ? 'success' : 'error'}
          className="mt-6"
        >
          {resendNotice.text}
        </AuthNotice>
      )}

      {/* Google OAuth Button */}
      <a
        href="/api/v1/auth/google"
        onClick={() => {
          const destination = resolveRedirectTarget(redirectParam)
          saveAuthRedirect(destination)
        }}
        className="mt-6 flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-control border border-border bg-card px-4 py-3 text-caption font-medium text-foreground shadow-raised transition-colors hover:bg-muted"
      >
        <GoogleIcon className="shrink-0" />
        Continue with Google
      </a>

      {/* Divider */}
      <div className="my-6 flex items-center gap-3.5 before:content-[''] before:h-px before:flex-1 before:bg-border after:content-[''] after:h-px after:flex-1 after:bg-border">
        <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground">
          Or with email
        </span>
      </div>

      {/* Credentials Form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <AuthField
          label="Email Address"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@domain.com"
        />

        <PasswordInput
          label="Password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          action={
            <Link
              to="/forgot-password"
              search={redirectParam ? { redirect: redirectParam } : undefined}
              className="font-eyebrow text-eyebrow uppercase tracking-widest text-primary hover:underline"
            >
              Forgot?
            </Link>
          }
        />

        <Button type="submit" disabled={isSubmitting} block className="mt-1">
          {isSubmitting ? 'Entering...' : 'Enter the Maison'}
        </Button>
      </form>
    </AuthShell>
  )
}
