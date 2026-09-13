import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useAuthStore } from '../stores/auth.store'

export const Route = createFileRoute('/forgot-password')({
  component: ForgotPasswordComponent,
})

function ForgotPasswordComponent() {
  const { forgotPassword } = useAuthStore()

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
        text: err.message || 'Failed to dispatch password reset email. Please try again.',
        type: 'error',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="w-full max-w-[480px] mx-auto my-12 px-4 select-none">
      <div className="border border-line bg-canvas p-8 sm:p-10 shadow-xs">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <Link
            to="/"
            className="font-serif italic text-3xl tracking-[-0.03em] text-ink hover:opacity-80 transition-opacity"
          >
            Groov<span className="not-italic text-blue font-serif">y</span>
          </Link>
          <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-blue-deep dark:text-blue-400 mt-2">
            Security &nbsp;·&nbsp; Password Recovery
          </div>
        </div>

        <div className="text-center mb-6">
          <h1 className="font-serif text-2xl text-ink font-normal mb-2">
            Forgot your password?
          </h1>
          <p className="font-sans text-xs text-ink-soft leading-relaxed max-w-sm mx-auto">
            Enter the email address associated with your account, and we will dispatch a link to reset your credentials.
          </p>
        </div>

        {/* Status Notice */}
        {notice && (
          <div
            className={`mb-6 p-3.5 border text-xs leading-relaxed ${
              notice.type === 'success'
                ? 'border-emerald-800/30 bg-emerald-900/10 text-emerald-600 dark:text-emerald-400'
                : 'border-red-800/30 bg-red-900/10 text-red-600 dark:text-red-400'
            }`}
          >
            {notice.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="fp-email"
              className="font-mono text-[9.5px] uppercase tracking-widest text-ink-soft"
            >
              Email Address
            </label>
            <input
              id="fp-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@domain.com"
              className="w-full border-0 border-b border-line bg-transparent outline-none font-sans text-sm text-ink py-2 focus:border-ink placeholder:text-stone transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting || cooldown > 0 || !email}
            className="mt-2 w-full bg-ink text-canvas border border-ink py-3.5 px-4 font-mono text-[11px] uppercase tracking-[0.12em] font-medium transition-all hover:bg-canvas hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {isSubmitting
              ? 'Dispatching...'
              : cooldown > 0
                ? `Resend available in ${cooldown}s`
                : 'Send Reset Link'}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-line/60 flex flex-col items-center gap-2 font-sans text-xs text-ink-soft">
          <div>
            Remember your credentials?{' '}
            <Link to="/login" className="text-blue hover:underline">
              Sign In
            </Link>
          </div>
          <div>
            Don't have an account?{' '}
            <Link to="/register" className="text-blue hover:underline">
              Create an account
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
