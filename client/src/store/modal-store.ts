import { create } from 'zustand'

interface IModal {
  isOpen: boolean
  open: () => void
  close: () => void
}

export const useSigninPromptModalStore = create<IModal>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}))
