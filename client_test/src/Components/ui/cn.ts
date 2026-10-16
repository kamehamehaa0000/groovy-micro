export type ClassValue = string | number | false | null | undefined

/**
 * Minimal class joiner — deliberately dependency-free.
 *
 * Foundation keeps this tiny; if class-override conflicts show up during the
 * call-site migration, swap this for `clsx` + `tailwind-merge` in one place.
 */
export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ')
}
