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
import { resolveRedirectTarget, saveAuthRedirect } from '../lib/auth-redirect'
import { H1, H2 } from '../Components/ui/typography'

const registerSearchSchema = z.object({
  redirect: z.string().optional(),
})

export const Route = createFileRoute('/register')({
  validateSearch: (search) => registerSearchSchema.parse(search),
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
  component: RegisterComponent,
})

function RegisterComponent() {
  const { redirect: redirectParam } = Route.useSearch()
  const navigate = useNavigate()
  const { register, resendVerification, isAuthenticated, isLoading } =
    useAuthStore()

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate({ to: resolveRedirectTarget(redirectParam), replace: true })
    }
  }, [isLoading, isAuthenticated, navigate, redirectParam])

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Verification prompt state
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const [resendNotice, setResendNotice] = useState<{
    text: string
    type: 'success' | 'error'
  } | null>(null)
  const [isResending, setIsResending] = useState(false)

  // Cooldown countdown timer
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
    setIsSubmitting(true)

    try {
      const result = await register(email, password, displayName)
      setRegisteredEmail(result.email)
    } catch (err: any) {
      setError(err.message || 'Registration failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleResend = async () => {
    if (!registeredEmail || cooldown > 0) return
    setResendNotice(null)
    setIsResending(true)

    try {
      const res = await resendVerification(registeredEmail)
      setResendNotice({
        text: res.message || 'Verification email sent! Check your inbox.',
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

  if (!isLoading && isAuthenticated) {
    return null
  }

  return (
    <AuthShell>
      {registeredEmail ? (
        /* Check Your Inbox View */
        <div className="flex flex-col">
          <button
            type="button"
            onClick={() => setRegisteredEmail(null)}
            className="mb-6 self-start font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
          >
            &larr; Back to form
          </button>

          <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-primary block mb-2">
            Correspondence · Account
          </span>
          <H1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Check your inbox
          </H1>
          <p className="mt-3 text-caption leading-relaxed text-muted-foreground">
            We dispatched a verification link to
          </p>
          <strong className="mt-1.5 block border border-border bg-muted p-2 font-mono text-eyebrow text-foreground">
            {registeredEmail}
          </strong>
          <p className="mt-3 text-caption leading-relaxed text-muted-foreground">
            Follow the link in that message to activate your membership before
            entering the Maison.
          </p>

          {resendNotice && (
            <AuthNotice
              tone={resendNotice.type === 'success' ? 'success' : 'error'}
              className="mt-5"
            >
              {resendNotice.text}
            </AuthNotice>
          )}

          <div className="mt-6 flex flex-col gap-3 border-t border-border pt-4">
            <Link
              to="/login"
              search={redirectParam ? { redirect: redirectParam } : undefined}
              className="w-full text-center bg-foreground text-background border border-foreground py-3.5 px-4 font-eyebrow text-eyebrow uppercase tracking-wider font-medium transition-opacity hover:opacity-90"
            >
              Go to Sign In &rarr;
            </Link>

            <button
              type="button"
              onClick={handleResend}
              disabled={isResending || cooldown > 0}
              className="w-full border border-border bg-card hover:bg-muted py-2.5 px-4 font-eyebrow text-eyebrow uppercase tracking-widest text-foreground transition-colors disabled:opacity-50 cursor-pointer"
            >
              {cooldown > 0
                ? `Resend available in ${cooldown}s`
                : isResending
                  ? 'Dispatching...'
                  : 'Resend Verification Link'}
            </button>
          </div>

          <p className="mt-6 text-center font-eyebrow text-muted-foreground/80">
            Wrong address?{' '}
            <button
              type="button"
              onClick={() => setRegisteredEmail(null)}
              className="text-primary underline cursor-pointer"
            >
              Edit and resend
            </button>
          </p>
        </div>
      ) : (
        /* Register Form View */
        <div className="flex flex-col">
          <Tabs
            variant="underline"
            ariaLabel="Authentication"
            className="mb-7"
            value="register"
            onChange={() => undefined}
            items={[
              {
                id: 'login',
                label: (
                  <Link
                    to="/login"
                    search={redirectParam ? { redirect: redirectParam } : undefined}
                    className="hover:underline"
                  >
                    Sign In
                  </Link>
                ),
              },
              { id: 'register', label: 'Create Account' },
            ]}
          />

          <H2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Join the Maison</H2>
          <p className="mt-1.5 text-caption leading-relaxed text-muted-foreground">
            A quiet, curated corner of the catalog — reserved once you're in.
          </p>

          {error && (
            <AuthNotice tone="error" className="mt-6">
              {error}
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
              Or with credentials
            </span>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <AuthField
              label="Display Name"
              type="text"
              required
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="How should we address you"
            />

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
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              hint="Require 1 uppercase, 1 lowercase, 1 number, min 8 chars."
            />

            <Button type="submit" disabled={isSubmitting} block className="mt-1">
              {isSubmitting ? 'Creating...' : 'Create Account'}
            </Button>
          </form>

          <p className="mt-5 text-center font-eyebrow leading-relaxed text-muted-foreground/80">
            By creating an account, you agree to the Maison terms of access and
            privacy charter.
          </p>
        </div>
      )}
    </AuthShell>
  )
}
