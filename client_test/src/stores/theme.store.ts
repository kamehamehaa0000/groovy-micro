import { create } from 'zustand'

export type ThemeMode = 'light' | 'dark'

interface ThemeState {
  theme: ThemeMode
  toggleTheme: () => void
  setTheme: (theme: ThemeMode) => void
}

const getInitialTheme = (): ThemeMode => {
  if (typeof window === 'undefined') return 'dark'
  const saved = localStorage.getItem('groovy_theme') as ThemeMode | null
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: getInitialTheme(),
  toggleTheme: () =>
    set((state) => {
      const next = state.theme === 'dark' ? 'light' : 'dark'
      if (typeof window !== 'undefined') {
        localStorage.setItem('groovy_theme', next)
        if (next === 'dark') {
          document.documentElement.classList.add('dark')
        } else {
          document.documentElement.classList.remove('dark')
        }
      }
      return { theme: next }
    }),
  setTheme: (theme: ThemeMode) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('groovy_theme', theme)
      if (theme === 'dark') {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
    }
    set({ theme })
  },
}))
