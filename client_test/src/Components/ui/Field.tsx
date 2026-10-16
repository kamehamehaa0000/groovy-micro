import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { cn } from './cn'

const CONTROL =
  'w-full rounded-control border border-line bg-panel px-3 py-2 text-body text-ink transition-colors placeholder:text-ink-soft/50 focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50'

export type InputProps = InputHTMLAttributes<HTMLInputElement>

export function Input({ className, ...rest }: InputProps) {
  return <input className={cn(CONTROL, className)} {...rest} />
}

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

export function Textarea({ className, ...rest }: TextareaProps) {
  return <textarea className={cn(CONTROL, 'min-h-24 resize-y', className)} {...rest} />
}

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>

export function Select({ className, children, ...rest }: SelectProps) {
  return (
    <select className={cn(CONTROL, 'cursor-pointer', className)} {...rest}>
      {children}
    </select>
  )
}

export interface FieldProps {
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  htmlFor?: string
  children: ReactNode
  className?: string
}

/** Label + control + hint/error. Wraps Input / Textarea / Select. */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
}: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label ? (
        <label
          htmlFor={htmlFor}
          className="font-mono text-eyebrow font-medium uppercase text-ink-soft"
        >
          {label}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="text-caption text-danger">{error}</p>
      ) : hint ? (
        <p className="text-caption text-ink-soft">{hint}</p>
      ) : null}
    </div>
  )
}
