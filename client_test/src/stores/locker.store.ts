import { create } from "zustand";

interface LockerStoreState {
  isOpen: boolean;
  refreshTrigger: number;
  openLockerModal: () => void;
  closeLockerModal: () => void;
  triggerRefresh: () => void;
}

export const useLockerStore = create<LockerStoreState>((set) => ({
  isOpen: false,
  refreshTrigger: 0,
  openLockerModal: () => set({ isOpen: true }),
  closeLockerModal: () => set({ isOpen: false }),
  triggerRefresh: () => set((s) => ({ refreshTrigger: s.refreshTrigger + 1 })),
}));
