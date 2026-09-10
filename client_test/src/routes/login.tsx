import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useAuthStore } from '../stores/auth.store'
import { GoogleIcon, SvgArtworkSpiral } from '../components/icons'

export const Route = createFileRoute('/login')({
  component: LoginComponent,
})

function LoginComponent() {
  const navigate = useNavigate()
  const { login, resendVerification } = useAuthStore()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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
      navigate({ to: '/profile' })
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

  return (
    <div className="w-full max-w-5xl mx-auto my-4 border border-line bg-canvas shadow-xs grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] min-h-[640px] overflow-hidden">
      {/* ===================== BRAND PANEL ===================== */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-canvas-deep border-r border-line relative overflow-hidden select-none">
        <div className="font-serif italic text-2xl text-ink">Groovy</div>

        <div className="max-w-md my-auto relative z-10">
          <div className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-blue-deep mb-4">
            Serentiy · Curation · Preservation
          </div>
          <h1 className="font-serif italic text-4xl text-ink leading-[1.1] mb-4 font-normal">
            The Collective keeps a seat for you.
          </h1>
          <p className="font-sans text-sm leading-[1.7] text-ink-soft max-w-sm">
            A private catalog of unhurried, perfect music — kept, curated, and
            reserved for members. Sign in to pick up where the record left off.
          </p>
        </div>

        {/* Decorative Geometric Vinyl Record SVG Art */}
        <SvgArtworkSpiral />

        <div className="flex justify-between items-center font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft relative z-10">
          <span>© 2026 Groovy </span>
          <span>Est. MMXXVI</span>
        </div>
      </div>

      {/* ===================== FORM PANEL ===================== */}
      <div className="flex items-center justify-center p-8 sm:p-14">
        <div className="w-full max-w-90">
          {/* Navigation Tabs */}
          <div className="flex gap-7 mb-8 border-b border-line">
            <span className="font-mono text-xs uppercase tracking-[0.08em] pb-3 border-b-2 border-blue text-ink font-medium">
              Sign In
            </span>
            <Link
              to="/register"
              className="font-mono text-xs uppercase tracking-[0.08em] pb-3 border-b-2 border-transparent text-ink-soft hover:text-ink transition-colors"
            >
              Create Account
            </Link>
          </div>

          <h2 className="font-serif italic font-medium text-2xl text-ink mb-1.5">
            Welcome back
          </h2>
          <p className="text-xs text-ink-soft leading-relaxed mb-7">
            Enter your <span className="italic">groove</span> with the account
            you keep on file.
          </p>

          {/* Error Notice */}
          {error && (
            <div className="mb-6 p-4 border border-red-800/30 bg-red-900/10 text-xs text-red-600 dark:text-red-400">
              <p>{error}</p>
              {isUnverifiedError && (
                <div className="mt-3 pt-3 border-t border-red-800/20 flex items-center justify-between">
                  <span className="text-[11px] text-ink-soft">
                    Didn't receive the email?
                  </span>
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={isResending || cooldown > 0}
                    className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-blue hover:underline disabled:opacity-50 transition-colors"
                  >
                    {cooldown > 0
                      ? `Resend in ${cooldown}s`
                      : isResending
                        ? 'Sending...'
                        : 'Resend Link'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Resend Notice */}
          {resendNotice && (
            <div
              className={`mb-6 p-3 border text-xs ${
                resendNotice.type === 'success'
                  ? 'border-emerald-800/30 bg-emerald-900/10 text-emerald-600 dark:text-emerald-400'
                  : 'border-red-800/30 bg-red-900/10 text-red-600 dark:text-red-400'
              }`}
            >
              {resendNotice.text}
            </div>
          )}

          {/* Google OAuth Button */}
          <a
            href="/api/v1/auth/google"
            className="w-full flex items-center justify-center gap-2.5 border border-line bg-panel hover:bg-canvas-deep text-ink text-xs font-medium py-3 px-4 transition-all mb-6 cursor-pointer shadow-2xs"
          >
            <GoogleIcon />
            Continue with Google
          </a>

          {/* Divider */}
          <div className="flex items-center gap-3.5 mb-6 before:content-[''] before:flex-1 before:h-px before:bg-line after:content-[''] after:flex-1 after:h-px after:bg-line">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-soft">
              Or with email
            </span>
          </div>

          {/* Credentials Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="si-email"
                className="font-mono text-[9.5px] uppercase tracking-widest text-ink-soft"
              >
                Email Address
              </label>
              <input
                id="si-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@domain.com"
                className="w-full border-0 border-b border-line bg-transparent outline-none font-sans text-sm text-ink py-2 focus:border-ink placeholder:text-stone transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="si-password"
                className="font-mono text-[9.5px] uppercase tracking-widest text-ink-soft"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="si-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full border-0 border-b border-line bg-transparent outline-none font-sans text-sm text-ink py-2 pr-12 focus:border-ink placeholder:text-stone transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-0 top-2.5 font-mono text-[9px] uppercase tracking-[0.08em] text-ink-soft hover:text-ink cursor-pointer"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 w-full bg-ink text-canvas border border-ink py-3.5 px-4 font-mono text-[11px] uppercase tracking-[0.12em] font-medium transition-all hover:bg-canvas hover:text-ink disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? 'Entering...' : 'Enter the Maison'}
            </button>
          </form>

          <div className="font-sans text-xs text-ink-soft text-center mt-7">
            New here?{' '}
            <Link
              to="/register"
              className="text-blue hover:underline transition-colors"
            >
              Create an account
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
