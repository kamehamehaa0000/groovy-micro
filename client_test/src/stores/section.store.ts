import { create } from 'zustand'

export type MaisonSection = 'discover' | 'search' | 'playlists' | 'albums' | 'artists'

interface SectionState {
  activeSection: MaisonSection
  setSection: (section: MaisonSection) => void
}

export const useSectionStore = create<SectionState>((set) => ({
  activeSection: 'discover',
  setSection: (section) => set({ activeSection: section }),
}))
