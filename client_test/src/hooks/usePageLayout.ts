import { useMatches } from '@tanstack/react-router'
import type { ContainerWidth } from '../Components/layout/Container'

const LAYOUTS: ContainerWidth[] = ['content', 'default', 'wide', 'full']

/**
 * Reads the layout the active route asked for.
 *
 * A route declares it once, next to its component:
 *
 *   export const Route = createFileRoute('/studio')({
 *     staticData: { layout: 'full' },
 *     component: StudioComponent,
 *   })
 *
 * The shell then renders the page inside the matching container, so nobody
 * has to re-declare gutters or a max-width inside a page.
 */
export function usePageLayout(): ContainerWidth {
  const matches = useMatches()
  // `staticData` is typed as an empty interface by the router, so the declared
  // layout is read through a record.
  const declared = (matches[matches.length - 1]?.staticData as
    | Record<string, unknown>
    | undefined)?.layout
  return LAYOUTS.includes(declared as ContainerWidth)
    ? (declared as ContainerWidth)
    : 'default'
}
