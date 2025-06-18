import { create } from 'zustand'

interface IModal {
  isOpen: boolean
  method?: 'password' | 'passwordless'
  toggleMethod?: () => void
  open: () => void
  close: () => void
}

export const SigninModal = create<IModal>((set) => ({
  isOpen: false,
  method: 'password',
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggleMethod: () =>
    set((state) => ({
      method: state.method === 'password' ? 'passwordless' : 'password',
    })),
}))
export const SignupModal = create<IModal>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}))

export const useForgotPasswordModal = create<IModal>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}))
