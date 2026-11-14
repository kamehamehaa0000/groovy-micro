import { useRouter } from '@tanstack/react-router'
import { cn } from './cn'
import { Button } from './Button'

export interface RouteErrorProps {
  error?: unknown
  reset?: () => void
  className?: string
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  return 'Something went wrong while loading this page.'
}

/**
 * The page shown when a route fails to render or load.
 *
 * Without it, a thrown error blanks the whole app — the header, the player and
 * the navigation all disappear and the user is left with a white page.
 */
export function RouteError({ error, reset, className }: RouteErrorProps) {
  const router = useRouter()

  return (
    <div
      className={cn(
        'mx-auto flex max-w-xl flex-col items-center px-6 py-24 text-center',
        className,
      )}
    >
      <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-destructive">
            This page could not be loaded
      </span>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        Something went wrong
      </h1>
      <p className="mt-2 max-w-md text-caption leading-relaxed text-muted-foreground">
        {messageOf(error)}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button
          onClick={() => {
            if (reset) reset()
            else router.invalidate()
          }}
        >
          Try again
        </Button>
        <Button variant="outline" onClick={() => router.navigate({ to: '/' })}>
          Back to catalog
        </Button>
      </div>
    </div>
  )
}
