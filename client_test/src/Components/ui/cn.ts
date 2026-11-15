import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

export type { ClassValue }

const customTwMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        { text: ['display', 'heading', 'title', 'body', 'caption', 'eyebrow'] },
      ],
      'font-family': [{ font: ['eyebrow', 'sans', 'mono', 'serif'] }],
      'text-color': [
        {
          text: [
            'background',
            'foreground',
            'card',
            'card-foreground',
            'popover',
            'popover-foreground',
            'primary',
            'primary-strong',
            'primary-foreground',
            'secondary',
            'secondary-foreground',
            'muted',
            'muted-foreground',
            'accent',
            'accent-foreground',
            'destructive',
            'destructive-soft',
            'destructive-foreground',
            'border',
            'border-soft',
            'input',
            'ring',
            'success',
            'success-foreground',
            'success-soft',
            'warning',
            'warning-soft',
            'info',
            'info-foreground',
            'info-soft',
            'scrim',
          ],
        },
      ],
      'bg-color': [
        {
          bg: [
            'background',
            'foreground',
            'card',
            'card-foreground',
            'popover',
            'popover-foreground',
            'primary',
            'primary-strong',
            'primary-foreground',
            'secondary',
            'secondary-foreground',
            'muted',
            'muted-foreground',
            'accent',
            'accent-foreground',
            'destructive',
            'destructive-soft',
            'destructive-foreground',
            'border',
            'border-soft',
            'input',
            'ring',
            'success',
            'success-foreground',
            'success-soft',
            'warning',
            'warning-soft',
            'info',
            'info-foreground',
            'info-soft',
            'scrim',
          ],
        },
      ],
      'border-color': [
        {
          border: [
            'background',
            'foreground',
            'card',
            'card-foreground',
            'popover',
            'popover-foreground',
            'primary',
            'primary-strong',
            'primary-foreground',
            'secondary',
            'secondary-foreground',
            'muted',
            'muted-foreground',
            'accent',
            'accent-foreground',
            'destructive',
            'destructive-soft',
            'destructive-foreground',
            'border',
            'border-soft',
            'input',
            'ring',
            'success',
            'success-foreground',
            'success-soft',
            'warning',
            'warning-soft',
            'info',
            'info-foreground',
            'info-soft',
          ],
        },
      ],
      rounded: [{ rounded: ['control', 'inset', 'surface'] }],
      shadow: [{ shadow: ['raised', 'floating'] }],
    },
  },
})

/**
 * Standard class merger using `clsx` and customized `tailwind-merge`.
 * Aware of Groovy's custom typography roles (`text-caption`, `text-eyebrow`, `text-body`)
 * and semantic color tokens, so font sizes and text colors never conflict or strip each other.
 */
export function cn(...inputs: ClassValue[]): string {
  return customTwMerge(clsx(inputs))
}
