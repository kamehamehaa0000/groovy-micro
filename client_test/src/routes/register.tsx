import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useAuthStore } from '../stores/auth.store'
import { GoogleIcon, SvgArtworkSpiral } from '../components/icons'

export const Route = createFileRoute('/register')({
  component: RegisterComponent,
})

function RegisterComponent() {
  const { register, resendVerification } = useAuthStore()

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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

  return (
    <div className="w-full max-w-5xl mx-auto my-4 border border-line bg-canvas shadow-xs grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] min-h-[640px] overflow-hidden">
      {/* ===================== BRAND PANEL ===================== */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-canvas-deep border-r border-line relative overflow-hidden select-none">
        <div className="flex items-center justify-between z-10">
          <Link to="/" className="font-serif italic text-2xl text-ink hover:opacity-80 transition-opacity">
            Groovy
          </Link>
          <Link
            to="/"
            className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-soft hover:text-ink transition-colors flex items-center gap-1.5 group"
          >
            <span className="transition-transform duration-200 group-hover:-translate-x-1">&larr;</span>
            <span>Back to home</span>
          </Link>
        </div>

        <div className="max-w-md my-auto relative z-10">
          <div className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-blue-deep mb-4">
            Serentiy · Curation · Preservation
          </div>
          <h1 className="font-serif italic text-4xl text-ink leading-[1.1] mb-4 font-normal">
            A quiet space in the catalog.
          </h1>
          <p className="font-sans text-sm leading-[1.7] text-ink-soft max-w-sm">
            Join the collective to access our full fidelity catalog, preserved
            experience, and dedicated personal archives.
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
          {/* Mobile Back to Home Navigation */}
          <div className="lg:hidden mb-6">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft hover:text-ink transition-colors group"
            >
              <span className="transition-transform duration-200 group-hover:-translate-x-1">&larr;</span>
              <span>Back to home</span>
            </Link>
          </div>

          {registeredEmail ? (
            /* Check Your Inbox View */
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => setRegisteredEmail(null)}
                className="self-start font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft hover:text-ink transition-colors mb-6 cursor-pointer"
              >
                &larr; Back to form
              </button>

              <div className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-blue-deep mb-2">
                Correspondence · Account
              </div>
              <h2 className="font-serif italic font-medium text-3xl text-ink mb-3 leading-tight">
                Check your inbox
              </h2>
              <p className="text-xs text-ink-soft leading-relaxed mb-6">
                We've dispatched a verification link to{' '}
                <strong className="text-ink font-mono text-[11px] block mt-1.5 p-2 bg-canvas-deep border border-line">
                  {registeredEmail}
                </strong>
              </p>
              <p className="text-xs text-ink-soft leading-relaxed mb-6">
                Please follow the correspondence link in your message to
                activate your membership before entering the Maison.
              </p>

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

              <div className="flex flex-col gap-3 pt-4 border-t border-line">
                <Link
                  to="/login"
                  className="w-full text-center bg-ink text-canvas border border-ink py-3.5 px-4 font-mono text-[11px] uppercase tracking-[0.12em] font-medium transition-all hover:bg-canvas hover:text-ink"
                >
                  Go to Sign In &rarr;
                </Link>

                <button
                  type="button"
                  onClick={handleResend}
                  disabled={isResending || cooldown > 0}
                  className="w-full border border-line bg-panel hover:bg-canvas-deep py-2.5 px-4 font-mono text-[10px] uppercase tracking-widest text-ink transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {cooldown > 0
                    ? `Resend available in ${cooldown}s`
                    : isResending
                      ? 'Dispatching...'
                      : 'Resend Verification Link'}
                </button>
              </div>

              <div className="font-mono text-[9.5px] uppercase tracking-[0.06em] text-ink-soft text-center mt-6">
                Wrong address?{' '}
                <button
                  type="button"
                  onClick={() => setRegisteredEmail(null)}
                  className="text-blue underline cursor-pointer"
                >
                  Edit and resend
                </button>
              </div>
            </div>
          ) : (
            /* Register Form View */
            <div className="flex flex-col">
              {/* Navigation Tabs */}
              <div className="flex gap-7 mb-8 border-b border-line">
                <Link
                  to="/login"
                  className="font-mono text-xs uppercase tracking-[0.08em] pb-3 border-b-2 border-transparent text-ink-soft hover:text-ink transition-colors"
                >
                  Sign In
                </Link>
                <span className="font-mono text-xs uppercase tracking-[0.08em] pb-3 border-b-2 border-blue text-ink font-medium">
                  Create Account
                </span>
              </div>

              <h2 className="font-serif italic font-medium text-2xl text-ink mb-1.5">
                Join the Maison
              </h2>
              <p className="text-xs text-ink-soft leading-relaxed mb-7">
                A quiet, curated corner of the catalog — reserved once you're
                in.
              </p>

              {/* Error Notice */}
              {error && (
                <div className="mb-6 p-3.5 border border-red-800/30 bg-red-900/10 text-xs text-red-600 dark:text-red-400">
                  {error}
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
                  Or with credentials
                </span>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="su-name"
                    className="font-mono text-[9.5px] uppercase tracking-widest text-ink-soft"
                  >
                    Display Name
                  </label>
                  <input
                    id="su-name"
                    type="text"
                    required
                    autoComplete="name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="How should we address you"
                    className="w-full border-0 border-b border-line bg-transparent outline-none font-sans text-sm text-ink py-2 focus:border-ink placeholder:text-stone transition-colors"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="su-email"
                    className="font-mono text-[9.5px] uppercase tracking-widest text-ink-soft"
                  >
                    Email Address
                  </label>
                  <input
                    id="su-email"
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
                    htmlFor="su-password"
                    className="font-mono text-[9.5px] uppercase tracking-widest text-ink-soft"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="su-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
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
                  <p className="text-[10.5px] text-ink-soft mt-1">
                    Require 1 uppercase, 1 lowercase, 1 number, min 8 chars.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="mt-2 w-full bg-ink text-canvas border border-ink py-3.5 px-4 font-mono text-[11px] uppercase tracking-[0.12em] font-medium transition-all hover:bg-canvas hover:text-ink disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? 'Creating...' : 'Create Account'}
                </button>
              </form>

              <div className="font-sans text-xs text-ink-soft text-center mt-7">
                Already a member?{' '}
                <Link
                  to="/login"
                  className="text-blue hover:underline transition-colors"
                >
                  Sign in
                </Link>
              </div>

              <p className="font-sans text-[11px] text-ink-soft/80 text-center mt-5 leading-relaxed">
                By creating an account, you agree to the Maison terms of access
                and privacy charter.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
