import { create } from 'zustand'

interface CreatePlaylistModalState {
  isOpen: boolean
  initialTrackIds: string[]
  openModal: (initialTrackIds?: string[]) => void
  closeModal: () => void
}

export const useCreatePlaylistModalStore = create<CreatePlaylistModalState>((set) => ({
  isOpen: false,
  initialTrackIds: [],
  openModal: (initialTrackIds = []) => set({ isOpen: true, initialTrackIds }),
  closeModal: () => set({ isOpen: false, initialTrackIds: [] }),
}))
