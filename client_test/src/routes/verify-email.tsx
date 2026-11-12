import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState, useRef } from 'react'
import { z } from 'zod'
import { useAuthStore } from '../stores/auth.store'
import { AuthShell, AuthNotice } from '../Components/auth/AuthShell'
import { AuthField } from '../Components/auth/AuthField'
import { Button } from '../Components/ui'

const searchSchema = z.object({
  token: z.string().optional(),
})

export const Route = createFileRoute('/verify-email')({
  validateSearch: (search) => searchSchema.parse(search),
  component: VerifyEmailComponent,
})

function VerifyEmailComponent() {
  const { token } = Route.useSearch()
  const navigate = useNavigate()
  const { verifyEmail, resendVerification } = useAuthStore()

  const [status, setStatus] = useState<
    'verifying' | 'success' | 'error' | 'idle'
  >(token ? 'verifying' : 'idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Resend form state
  const [email, setEmail] = useState('')
  const [isResending, setIsResending] = useState(false)
  const [resendNotice, setResendNotice] = useState<{
    text: string
    type: 'success' | 'error'
  } | null>(null)
  const [cooldown, setCooldown] = useState(0)

  const verificationAttemptedRef = useRef(false)

  // Auto-verify if token is in query params
  useEffect(() => {
    if (!token || verificationAttemptedRef.current) {
      return
    }

    verificationAttemptedRef.current = true
    setStatus('verifying')

    verifyEmail(token)
      .then(() => {
        setStatus('success')
        setTimeout(() => {
          navigate({ to: '/profile' })
        }, 2200)
      })
      .catch((err: any) => {
        setStatus('error')
        setErrorMessage(
          err.message ||
            'The verification link has expired or has already been used. Please request a new one below.',
        )
      })
  }, [token, verifyEmail, navigate])

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldown <= 0) return
    const interval = setInterval(() => {
      setCooldown((prev) => prev - 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [cooldown])

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || cooldown > 0) return

    setResendNotice(null)
    setIsResending(true)

    try {
      const res = await resendVerification(email)
      setResendNotice({
        text: res.message || 'Verification link dispatched! Check your inbox.',
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

  return (
    <AuthShell variant="narrow">
      <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground block text-center">
        Sound Atelier
      </span>

      {/* ================= STATE: VERIFYING ================= */}
      {status === 'verifying' && (
        <div className="py-8 text-center">
          <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center text-primary">
            <svg
              className="h-8 w-8 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
              <path d="M12 2a10 10 0 0 1 10 10" />
            </svg>
          </div>

          <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-primary block mb-2">
            Correspondence · Cryptographic Check
          </span>
          <h1 className="font-serif text-2xl leading-tight text-foreground">
            Authenticating token...
          </h1>
          <p className="mt-2 text-caption leading-relaxed text-muted-foreground">
            Please wait while the Maison validates your token and activates
            your member privileges.
          </p>
        </div>
      )}

      {/* ================= STATE: SUCCESS ================= */}
      {status === 'success' && (
        <div className="py-8 text-center">
          <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-success block mb-2">
            Membership Confirmed
          </span>
          <h1 className="font-serif text-2xl leading-tight text-foreground">
            Account verified.
          </h1>
          <p className="mt-2 text-caption leading-relaxed text-muted-foreground">
            Welcome to Groovy. Your account has been authenticated.
          </p>
          <Link
            to="/profile"
            className="mt-6 inline-block w-full bg-foreground text-background border border-foreground py-3.5 px-4 font-eyebrow text-eyebrow uppercase tracking-wider font-medium transition-opacity hover:opacity-90 text-center"
          >
            Enter the Maison &rarr;
          </Link>
        </div>
      )}

      {/* ================= STATE: ERROR ================= */}
      {status === 'error' && (
        <div className="py-8">
          <div className="text-center">
            <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-destructive block mb-2">
              Correspondence · Security Notice
            </span>
            <h1 className="font-serif text-2xl leading-tight text-foreground">
              Token expired.
            </h1>
            <p className="mt-2 text-caption leading-relaxed text-muted-foreground">
              {errorMessage}
            </p>
          </div>

          {resendNotice && (
            <AuthNotice
              tone={resendNotice.type === 'success' ? 'success' : 'error'}
              className="mt-5"
            >
              {resendNotice.text}
            </AuthNotice>
          )}

          <form onSubmit={handleResend} className="flex flex-col gap-4">
            <AuthField
              label="Account Email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@domain.com"
            />

            <Button
              type="submit"
              disabled={isResending || cooldown > 0}
              block
            >
              {cooldown > 0
                ? `Resend in ${cooldown}s`
                : isResending
                  ? 'Dispatching...'
                  : 'Request New Verification Link'}
            </Button>
          </form>
        </div>
      )}

      {/* ================= STATE: IDLE ================= */}
      {status === 'idle' && (
        <div className="py-8">
          <div className="text-center">
            <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-primary block mb-2">
              Correspondence · Dispatch
            </span>
            <h1 className="font-serif text-2xl leading-tight text-foreground">
              Verify your email
            </h1>
            <p className="mt-2 text-caption leading-relaxed text-muted-foreground">
              Provide the email address associated with your Maison membership
              to receive an authentication correspondence.
            </p>
          </div>

          {resendNotice && (
            <AuthNotice
              tone={resendNotice.type === 'success' ? 'success' : 'error'}
              className="mt-5"
            >
              {resendNotice.text}
            </AuthNotice>
          )}

          <form onSubmit={handleResend} className="flex flex-col gap-4">
            <AuthField
              label="Account Email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@domain.com"
            />

            <Button
              type="submit"
              disabled={isResending || cooldown > 0}
              block
            >
              {cooldown > 0
                ? `Resend in ${cooldown}s`
                : isResending
                  ? 'Dispatching...'
                  : 'Send Verification Link'}
            </Button>
          </form>

          <div className="mt-7 text-center text-caption text-muted-foreground">
            Already verified?{' '}
            <Link
              to="/login"
              className="text-primary hover:underline transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>
      )}
    </AuthShell>
  )
}
