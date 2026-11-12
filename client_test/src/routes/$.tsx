import { createFileRoute, Link } from '@tanstack/react-router'
import { Button } from '../Components/ui/Button'

/**
 * The catch-all route.
 *
 * An unknown URL used to render an empty page; now it says what happened and
 * offers a way back.
 */
export const Route = createFileRoute('/$')({
  component: NotFoundPage,
})

function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-6 py-24 text-center">
      <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-primary">
        404 · Nothing here
      </span>
      <h1 className="mt-3 font-serif text-3xl text-foreground">
        That page is not in the catalogue
      </h1>
      <p className="mt-2 max-w-md text-caption leading-relaxed text-muted-foreground">
        The link may be old, or the release may have been pulled. Everything
        still playable is one click away.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/"
          className="inline-flex items-center rounded-control bg-foreground px-5 py-2.5 font-eyebrow text-eyebrow uppercase tracking-wider font-semibold text-background transition-opacity hover:opacity-90 no-underline"
        >
          Back to catalog
        </Link>
        <Link
          to="/search"
          className="inline-flex items-center rounded-control border border-border px-5 py-2.5 font-eyebrow text-eyebrow uppercase tracking-wider text-foreground transition-colors hover:border-foreground no-underline"
        >
          Search the archive
        </Link>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="mt-4"
        onClick={() => window.history.back()}
      >
        Go back
      </Button>
    </div>
  )
}
