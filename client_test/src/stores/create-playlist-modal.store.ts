import { create } from 'zustand'

interface CreatePlaylistModalState {
  isOpen: boolean
  openModal: () => void
  closeModal: () => void
}

export const useCreatePlaylistModalStore = create<CreatePlaylistModalState>((set) => ({
  isOpen: false,
  openModal: () => set({ isOpen: true }),
  closeModal: () => set({ isOpen: false }),
}))
