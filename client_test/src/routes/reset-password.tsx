import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'
import { useAuthStore } from '../stores/auth.store'

const searchSchema = z.object({
  token: z.string().optional(),
})

export const Route = createFileRoute('/reset-password')({
  validateSearch: (search) => searchSchema.parse(search),
  component: ResetPasswordComponent,
})

function ResetPasswordComponent() {
  const { token } = Route.useSearch()
  const navigate = useNavigate()
  const { resetPassword } = useAuthStore()

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Validation rules
  const hasMinLength = newPassword.length >= 8
  const hasUpperCase = /[A-Z]/.test(newPassword)
  const hasLowerCase = /[a-z]/.test(newPassword)
  const hasDigit = /\d/.test(newPassword)
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword
  const isFormValid =
    hasMinLength &&
    hasUpperCase &&
    hasLowerCase &&
    hasDigit &&
    passwordsMatch

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !isFormValid || isSubmitting) return

    setError(null)
    setSuccess(null)
    setIsSubmitting(true)

    try {
      const res = await resetPassword(token, newPassword)
      setSuccess(
        res.message ||
          'Your password has been successfully reset. Redirecting to sign in...',
      )
      setTimeout(() => {
        navigate({ to: '/login' })
      }, 2000)
    } catch (err: any) {
      setError(
        err.message ||
          'The reset link has expired or is invalid. Please request a new one.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="w-full max-w-[480px] mx-auto my-12 px-4 select-none">
      <div className="border border-border bg-background p-8 sm:p-10 shadow-xs">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <Link
            to="/"
            className="font-serif italic text-3xl tracking-[-0.03em] text-foreground hover:opacity-80 transition-opacity"
          >
            Groov<span className="not-italic text-primary font-serif">y</span>
          </Link>
          <div className="font-eyebrow text-[11px] uppercase tracking-widest text-primary mt-2">
            Security &nbsp;·&nbsp; Password Reset
          </div>
        </div>

        {!token ? (
          /* Missing Token State */
          <div className="text-center">
            <div className="mb-6 p-4 border border-red-800/30 bg-red-900/10 text-red-600 dark:text-red-400 text-xs leading-relaxed text-left">
              <strong className="block font-medium mb-1">Missing Reset Token</strong>
              A password reset link with a valid security token is required. Please check the link from your email or request a new one.
            </div>
            <Link
              to="/forgot-password"
              className="inline-block w-full bg-foreground text-background border border-foreground py-3.5 px-4 font-eyebrow text-[11px] uppercase tracking-wider font-medium transition-all hover:bg-background hover:text-foreground cursor-pointer"
            >
              Request New Link
            </Link>
          </div>
        ) : (
          /* Form State */
          <>
            <div className="text-center mb-6">
              <h1 className="font-serif text-2xl text-foreground font-normal mb-2">
                Choose a new password
              </h1>
              <p className="font-sans text-xs text-muted-foreground leading-relaxed max-w-sm mx-auto">
                Set a strong, unique password for your Groovy account. All other active sessions will be revoked for your security.
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-6 p-3.5 border border-red-800/30 bg-red-900/10 text-red-600 dark:text-red-400 text-xs leading-relaxed">
                <p>{error}</p>
                <Link
                  to="/forgot-password"
                  className="inline-block mt-2 font-eyebrow text-[11px] uppercase tracking-wider underline hover:opacity-80"
                >
                  Request a new reset link &rarr;
                </Link>
              </div>
            )}

            {/* Success Message */}
            {success && (
              <div className="mb-6 p-3.5 border border-emerald-800/30 bg-emerald-900/10 text-emerald-600 dark:text-emerald-400 text-xs leading-relaxed text-center">
                {success}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              {/* New Password */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="rp-password"
                    className="font-eyebrow text-[11px] uppercase tracking-widest text-muted-foreground"
                  >
                    New Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="font-eyebrow text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <input
                  id="rp-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full border-0 border-b border-border bg-transparent outline-none font-sans text-sm text-foreground py-2 focus:border-foreground placeholder:text-secondary transition-colors"
                />
              </div>

              {/* Confirm Password */}
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="rp-confirm-password"
                  className="font-eyebrow text-[11px] uppercase tracking-widest text-muted-foreground"
                >
                  Confirm New Password
                </label>
                <input
                  id="rp-confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full border-0 border-b border-border bg-transparent outline-none font-sans text-sm text-foreground py-2 focus:border-foreground placeholder:text-secondary transition-colors"
                />
              </div>

              {/* Strength Checklist */}
              <div className="p-3 bg-muted/60 border border-border/60 flex flex-col gap-1 text-[11px] font-sans">
                <div className="font-eyebrow text-[11px] uppercase tracking-widest text-muted-foreground mb-1">
                  Password Requirements:
                </div>
                <div
                  className={`flex items-center gap-2 ${
                    hasMinLength ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
                  }`}
                >
                  <span>{hasMinLength ? '✔' : '○'}</span>
                  <span>At least 8 characters</span>
                </div>
                <div
                  className={`flex items-center gap-2 ${
                    hasUpperCase && hasLowerCase
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-muted-foreground'
                  }`}
                >
                  <span>{hasUpperCase && hasLowerCase ? '✔' : '○'}</span>
                  <span>Uppercase & lowercase letters</span>
                </div>
                <div
                  className={`flex items-center gap-2 ${
                    hasDigit ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
                  }`}
                >
                  <span>{hasDigit ? '✔' : '○'}</span>
                  <span>At least one number</span>
                </div>
                <div
                  className={`flex items-center gap-2 ${
                    passwordsMatch
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-muted-foreground'
                  }`}
                >
                  <span>{passwordsMatch ? '✔' : '○'}</span>
                  <span>Passwords match</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={!isFormValid || isSubmitting || !!success}
                className="mt-2 w-full bg-foreground text-background border border-foreground py-3.5 px-4 font-eyebrow text-[11px] uppercase tracking-wider font-medium transition-all hover:bg-background hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSubmitting ? 'Resetting Password...' : 'Update Password'}
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-border/60 text-center font-sans text-xs text-muted-foreground">
              Remember your password?{' '}
              <Link to="/login" className="text-primary hover:underline">
                Sign In
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
