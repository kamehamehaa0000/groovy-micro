import { create } from "zustand";
import type { PlayerTrack } from "../types/player";

interface AddToPlaylistModalState {
  isOpen: boolean;
  tracks: PlayerTrack[];
  contextLabel: string | null;
  openModal: (track: PlayerTrack) => void;
  openModalForTracks: (tracks: PlayerTrack[], contextLabel?: string) => void;
  closeModal: () => void;
}

export const useAddToPlaylistModalStore = create<AddToPlaylistModalState>((set) => ({
  isOpen: false,
  tracks: [],
  contextLabel: null,
  openModal: (track) =>
    set({ isOpen: true, tracks: [track], contextLabel: null }),
  openModalForTracks: (tracks, contextLabel) =>
    set({ isOpen: true, tracks, contextLabel: contextLabel ?? null }),
  closeModal: () => set({ isOpen: false, tracks: [], contextLabel: null }),
}));
