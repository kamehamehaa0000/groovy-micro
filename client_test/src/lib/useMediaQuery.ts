import { useEffect, useState } from 'react'

/**
 * Minimal matchMedia subscription used to switch overlay placement.
 * Initializes synchronously so a bottom sheet never flashes as a dialog.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    const mediaQuery = window.matchMedia(query)
    const onChange = () => setMatches(mediaQuery.matches)

    onChange()
    mediaQuery.addEventListener('change', onChange)
    return () => mediaQuery.removeEventListener('change', onChange)
  }, [query])

  return matches
}
