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

export const useCreatePlaylistModalStore = create<IModal>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}))

export const useJamModalStore = create<IModal>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}))

interface IAddToPlaylistModal extends IModal {
  songId: string
  setSongId: (id: string) => void
}

export const useAddToPlaylistModalStore = create<IAddToPlaylistModal>(
  (set) => ({
    isOpen: false,
    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false }),
    songId: '',
    setSongId: (id: string) => set({ songId: id }),
  })
)
interface IAddAlbumToPlaylistModal extends IModal {
  albumId: string
  setAlbumId: (id: string) => void
}

export const useAddAlbumToPlaylistModalStore = create<IAddAlbumToPlaylistModal>(
  (set) => ({
    isOpen: false,
    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false }),
    albumId: '',
    setAlbumId: (id: string) => set({ albumId: id }),
  })
)
