import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'
import { useAuthStore } from '../stores/auth.store'
import { AuthShell, AuthNotice } from '../Components/auth/AuthShell'
import { PasswordInput } from '../Components/auth/AuthField'
import { Button } from '../Components/ui'

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
    <AuthShell variant="narrow">
      <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-primary block text-center">
        Security · Password Reset
      </span>

      {!token ? (
        /* Missing Token State */
        <div className="text-center">
          <AuthNotice tone="error" className="text-left">
            <strong className="block font-medium mb-1">Missing Reset Token</strong>
            A password reset link with a valid security token is required.
            Please check the link from your email or request a new one.
          </AuthNotice>
          <Link
            to="/forgot-password"
            className="mt-6 inline-block w-full bg-foreground text-background border border-foreground py-3.5 px-4 font-eyebrow text-eyebrow uppercase tracking-wider font-medium transition-opacity hover:opacity-90 cursor-pointer"
          >
            Request New Link
          </Link>
        </div>
      ) : (
        /* Form State */
        <>
          <div className="text-center">
            <h1 className="font-serif text-2xl text-foreground">
              Choose a new password
            </h1>
            <p className="mt-2 text-caption leading-relaxed text-muted-foreground">
              Set a strong, unique password for your Groovy account. All other
              active sessions will be revoked for your security.
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <AuthNotice tone="error" className="mt-6">
              <p>{error}</p>
              <Link
                to="/forgot-password"
                className="mt-2 inline-block font-eyebrow text-eyebrow uppercase tracking-wider underline hover:opacity-80"
              >
                Request a new reset link &rarr;
              </Link>
            </AuthNotice>
          )}

          {/* Success Message */}
          {success && (
            <AuthNotice tone="success" className="mt-6 text-center">
              {success}
            </AuthNotice>
          )}

          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5">
            <PasswordInput
              label="New Password"
              required
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
            />

            <PasswordInput
              label="Confirm New Password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
            />

            {/* Strength Checklist */}
            <div
              className="flex flex-col gap-1 border border-border/60 bg-muted/60 p-3 text-eyebrow font-sans"
              aria-live="polite"
            >
              <div className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground mb-1">
                Password Requirements:
              </div>
              <div
                className={`flex items-center gap-2 ${
                  hasMinLength ? 'text-success' : 'text-muted-foreground'
                }`}
              >
                <span aria-hidden="true">{hasMinLength ? '✔' : '○'}</span>
                <span>At least 8 characters</span>
              </div>
              <div
                className={`flex items-center gap-2 ${
                  hasUpperCase && hasLowerCase
                    ? 'text-success'
                    : 'text-muted-foreground'
                }`}
              >
                <span aria-hidden="true">
                  {hasUpperCase && hasLowerCase ? '✔' : '○'}
                </span>
                <span>Uppercase &amp; lowercase letters</span>
              </div>
              <div
                className={`flex items-center gap-2 ${
                  hasDigit ? 'text-success' : 'text-muted-foreground'
                }`}
              >
                <span aria-hidden="true">{hasDigit ? '✔' : '○'}</span>
                <span>At least one number</span>
              </div>
              <div
                className={`flex items-center gap-2 ${
                  passwordsMatch ? 'text-success' : 'text-muted-foreground'
                }`}
              >
                <span aria-hidden="true">{passwordsMatch ? '✔' : '○'}</span>
                <span>Passwords match</span>
              </div>
            </div>

            <Button
              type="submit"
              disabled={!isFormValid || isSubmitting || !!success}
              block
            >
              {isSubmitting ? 'Resetting Password...' : 'Update Password'}
            </Button>
          </form>

          <div className="mt-8 border-t border-border-soft pt-6 text-center text-caption text-muted-foreground">
            Remember your password?{' '}
            <Link to="/login" className="text-primary hover:underline">
              Sign In
            </Link>
          </div>
        </>
      )}
    </AuthShell>
  )
}
