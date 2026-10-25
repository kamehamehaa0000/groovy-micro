import { create } from 'zustand'

export interface CreatePlaylistPrefill {
  title?: string
  description?: string
}

interface CreatePlaylistModalState {
  isOpen: boolean
  initialTrackIds: string[]
  initialTitle: string
  initialDescription: string
  openModal: (
    initialTrackIds?: string[],
    prefill?: CreatePlaylistPrefill
  ) => void
  closeModal: () => void
}

export const useCreatePlaylistModalStore = create<CreatePlaylistModalState>(
  (set) => ({
    isOpen: false,
    initialTrackIds: [],
    initialTitle: '',
    initialDescription: '',
    openModal: (initialTrackIds = [], prefill = {}) =>
      set({
        isOpen: true,
        initialTrackIds,
        initialTitle: prefill.title ?? '',
        initialDescription: prefill.description ?? '',
      }),
    closeModal: () =>
      set({
        isOpen: false,
        initialTrackIds: [],
        initialTitle: '',
        initialDescription: '',
      }),
  })
)
