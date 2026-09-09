import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState, useRef } from 'react'
import { z } from 'zod'
import { useAuthStore } from '../stores/auth.store'

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
    <div className="w-full max-w-[460px] mx-auto my-6 border border-line bg-canvas p-8 sm:p-12 shadow-xs">
      {/* Brand Header */}
      <div className="text-center mb-8 select-none">
        <div className="font-serif italic text-3xl tracking-[-0.03em] text-ink">
          Groov<span className="not-italic text-blue font-serif">y</span>
        </div>
        <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-ink-soft mt-1.5">
          Sound Atelier
        </div>
      </div>

      {/* ================= STATE: VERIFYING ================= */}
      {status === 'verifying' && (
        <div className="border-y border-line py-8 text-center">
          <div className="mx-auto w-12 h-12 mb-6 text-blue flex items-center justify-center">
            <svg
              className="animate-spin w-8 h-8"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
              <path d="M12 2a10 10 0 0 1 10 10" />
            </svg>
          </div>

          <div className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-blue-deep mb-2">
            Correspondence · Cryptographic Check
          </div>
          <h1 className="font-serif italic font-normal text-3xl text-ink leading-tight mb-3">
            Authenticating token...
          </h1>
          <p className="font-sans text-xs text-ink-soft leading-relaxed max-w-sm mx-auto">
            Please wait while the Maison cryptographic engine validates your
            token and activates your member privileges.
          </p>
        </div>
      )}

      {/* ================= STATE: SUCCESS ================= */}
      {status === 'success' && (
        <div className="border-y border-line py-8 text-center">
          <div className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400 mb-2">
            Membership Confirmed · Est. MMXXVI
          </div>
          <h1 className="font-serif italic font-normal text-3xl text-ink leading-tight mb-3">
            Account verified.
          </h1>
          <p className="font-sans text-xs text-ink-soft leading-relaxed mb-6 max-w-sm mx-auto">
            Welcome to Groovy. Your account has been authenticated. Redirecting
            you to your private atelier profile...
          </p>
          <Link
            to="/profile"
            className="inline-block w-full bg-ink text-canvas border border-ink py-3.5 px-4 font-mono text-[11px] uppercase tracking-[0.12em] font-medium transition-all hover:bg-canvas hover:text-ink text-center"
          >
            Enter the Maison &rarr;
          </Link>
        </div>
      )}

      {/* ================= STATE: ERROR ================= */}
      {status === 'error' && (
        <div className="border-y border-line py-8">
          <div className="text-center mb-6">
            <div className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-red-600 dark:text-red-400 mb-2">
              Correspondence · Security Notice
            </div>
            <h1 className="font-serif italic font-normal text-3xl text-ink leading-tight mb-3">
              Token expired.
            </h1>
            <p className="font-sans text-xs text-ink-soft leading-relaxed max-w-sm mx-auto">
              {errorMessage}
            </p>
          </div>

          {resendNotice && (
            <div
              className={`mb-5 p-3 border text-xs ${
                resendNotice.type === 'success'
                  ? 'border-emerald-800/30 bg-emerald-900/10 text-emerald-600 dark:text-emerald-400'
                  : 'border-red-800/30 bg-red-900/10 text-red-600 dark:text-red-400'
              }`}
            >
              {resendNotice.text}
            </div>
          )}

          <form onSubmit={handleResend} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="resend-email"
                className="font-mono text-[9.5px] uppercase tracking-widest text-ink-soft"
              >
                Account Email
              </label>
              <input
                id="resend-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@domain.com"
                className="w-full border-0 border-b border-line bg-transparent outline-none font-sans text-sm text-ink py-2 focus:border-ink placeholder:text-stone transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={isResending || cooldown > 0}
              className="mt-2 w-full bg-ink text-canvas border border-ink py-3.5 px-4 font-mono text-[11px] uppercase tracking-[0.12em] font-medium transition-all hover:bg-canvas hover:text-ink disabled:opacity-50 cursor-pointer"
            >
              {cooldown > 0
                ? `Resend in ${cooldown}s`
                : isResending
                  ? 'Dispatching...'
                  : 'Request New Verification Link'}
            </button>
          </form>
        </div>
      )}

      {/* ================= STATE: IDLE ================= */}
      {status === 'idle' && (
        <div className="border-y border-line py-8">
          <div className="text-center mb-6">
            <div className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-blue-deep mb-2">
              Correspondence · Dispatch
            </div>
            <h1 className="font-serif italic font-normal text-3xl text-ink leading-tight mb-3">
              Verify your email
            </h1>
            <p className="font-sans text-xs text-ink-soft leading-relaxed max-w-sm mx-auto">
              Provide the email address associated with your Maison membership
              to receive an authentication correspondence.
            </p>
          </div>

          {resendNotice && (
            <div
              className={`mb-5 p-3 border text-xs ${
                resendNotice.type === 'success'
                  ? 'border-emerald-800/30 bg-emerald-900/10 text-emerald-600 dark:text-emerald-400'
                  : 'border-red-800/30 bg-red-900/10 text-red-600 dark:text-red-400'
              }`}
            >
              {resendNotice.text}
            </div>
          )}

          <form onSubmit={handleResend} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="idle-email"
                className="font-mono text-[9.5px] uppercase tracking-widest text-ink-soft"
              >
                Account Email
              </label>
              <input
                id="idle-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@domain.com"
                className="w-full border-0 border-b border-line bg-transparent outline-none font-sans text-sm text-ink py-2 focus:border-ink placeholder:text-stone transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={isResending || cooldown > 0}
              className="mt-2 w-full bg-ink text-canvas border border-ink py-3.5 px-4 font-mono text-[11px] uppercase tracking-[0.12em] font-medium transition-all hover:bg-canvas hover:text-ink disabled:opacity-50 cursor-pointer"
            >
              {cooldown > 0
                ? `Resend in ${cooldown}s`
                : isResending
                  ? 'Dispatching...'
                  : 'Send Verification Link'}
            </button>
          </form>

          <div className="font-sans text-xs text-ink-soft text-center mt-7">
            Already verified?{' '}
            <Link
              to="/login"
              className="text-blue hover:underline transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>
      )}

      {/* Footer Info */}
      <div className="mt-8 text-center">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-soft/70">
          Maison Édition MMXXVI · Security & Correspondence
        </span>
      </div>
    </div>
  )
}
