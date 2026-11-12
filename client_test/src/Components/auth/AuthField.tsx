import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '../ui/cn'

const UNDERLINE =
  'w-full border-0 border-b border-border bg-transparent outline-none font-sans text-body text-foreground py-2 focus:border-foreground placeholder:text-muted-foreground/60 transition-colors'

export interface AuthFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: ReactNode
  /** Rendered on the right of the label row (e.g. a "Forgot?" link). */
  action?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  wrapperClassName?: string
}

/**
 * A labelled field for the authentication screens.
 *
 * The label / hint / error arrangement used to be hand-written six times with
 * slightly different markup and, in three of them, without the `htmlFor` that
 * ties the label to the input.
 */
export function AuthField({
  label,
  action,
  hint,
  error,
  wrapperClassName,
  className,
  id,
  ...rest
}: AuthFieldProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const hintId = hint ? `${fieldId}-hint` : undefined
  const errorId = error ? `${fieldId}-error` : undefined

  return (
    <div className={cn('flex flex-col gap-1.5', wrapperClassName)}>
      <div className="flex items-center justify-between gap-3">
        <label
          htmlFor={fieldId}
          className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground"
        >
          {label}
        </label>
        {action}
      </div>
      <input
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId ?? hintId}
        className={cn(
          UNDERLINE,
          error ? 'border-destructive' : undefined,
          className,
        )}
        {...rest}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-caption text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-caption text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export interface PasswordInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode
  action?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  wrapperClassName?: string
}

/**
 * A password field with its own reveal toggle.
 *
 * The toggle used to be a bare text button with no accessible name, and three
 * screens each had their own copy of it.
 */
export function PasswordInput({
  label,
  action,
  hint,
  error,
  wrapperClassName,
  className,
  id,
  ...rest
}: PasswordInputProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const [revealed, setRevealed] = useState(false)

  return (
    <div className={cn('flex flex-col gap-1.5', wrapperClassName)}>
      <div className="flex items-center justify-between gap-3">
        <label
          htmlFor={fieldId}
          className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground"
        >
          {label}
        </label>
        {action}
      </div>
      <div className="relative">
        <input
          id={fieldId}
          type={revealed ? 'text' : 'password'}
          aria-invalid={error ? true : undefined}
          className={cn(
            UNDERLINE,
            'pr-14',
            error ? 'border-destructive' : undefined,
            className,
          )}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setRevealed((prev) => !prev)}
          aria-label={revealed ? 'Hide password' : 'Show password'}
          aria-pressed={revealed}
          className="absolute right-0 top-1.5 font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
        >
          {revealed ? 'Hide' : 'Show'}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-caption text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-caption text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}
