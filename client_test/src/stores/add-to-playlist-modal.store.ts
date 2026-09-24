import { create } from "zustand";
import type { PlayerTrack } from "../types/player";

interface AddToPlaylistModalState {
  isOpen: boolean;
  track: PlayerTrack | null;
  openModal: (track: PlayerTrack) => void;
  closeModal: () => void;
}

export const useAddToPlaylistModalStore = create<AddToPlaylistModalState>((set) => ({
  isOpen: false,
  track: null,
  openModal: (track) => set({ isOpen: true, track }),
  closeModal: () => set({ isOpen: false, track: null }),
}));
