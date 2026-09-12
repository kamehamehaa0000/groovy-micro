import { create } from "zustand";
import type { ReactNode } from "react";

export interface AuthModalOptions {
  title?: ReactNode;
  description?: string;
  category?: string;
  subtitle?: string;
}

interface AuthModalState {
  isOpen: boolean;
  options: AuthModalOptions;
  openAuthModal: (options?: AuthModalOptions) => void;
  closeAuthModal: () => void;
}

const DEFAULT_OPTIONS: AuthModalOptions = {
  title: null,
  description:
    "Sign in or create an account to continue listening, save music, and make Groovy yours.",
  category: "Member Access",
  subtitle: "Account",
};

export const useAuthModalStore = create<AuthModalState>((set) => ({
  isOpen: false,
  options: DEFAULT_OPTIONS,
  openAuthModal: (options) =>
    set({
      isOpen: true,
      options: { ...DEFAULT_OPTIONS, ...options },
    }),
  closeAuthModal: () => set({ isOpen: false }),
}));
