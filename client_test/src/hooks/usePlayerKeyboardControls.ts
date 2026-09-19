import { useEffect } from "react";
import { usePlayerStore } from "../stores/player.store";
import { useLikesStore } from "../stores/likes.store";
import { useAuthStore } from "../stores/auth.store";
import { useAuthModalStore } from "../stores/auth-modal.store";

/**
 * Detects whether the current keyboard event target is an active typing or editable context.
 * When true, global playback shortcuts must be skipped to avoid hijacking text input.
 */
export function isTypingContext(target: EventTarget | null): boolean {
  if (!target) return false;
  if (typeof HTMLElement !== "undefined" && !(target instanceof HTMLElement)) {
    return false;
  }

  const el = target as HTMLElement;

  // 1. Direct editable form inputs
  const tagName = el.tagName;
  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
    return true;
  }

  // 2. Direct or ancestor contentEditable container
  if (el.isContentEditable || el.closest?.('[contenteditable="true"]')) {
    return true;
  }

  // 3. ARIA interactive input roles
  const role = el.getAttribute?.("role");
  if (role === "textbox" || role === "searchbox" || role === "combobox") {
    return true;
  }

  // 4. If focus is inside an open modal dialog, avoid hijacking keys like Space or Arrows
  if (el.closest?.('[role="dialog"]') || el.closest?.('[aria-modal="true"]')) {
    return true;
  }

  return false;
}

/**
 * High-Efficiency Player Keyboard Controls Hook.
 *
 * Implements:
 * - Playback: Space (Play/Pause), ← / → (Seek ±5s), Shift + ← / → (Previous / Next)
 * - Audio: ↑ / ↓ (Volume ±5%), M (Mute / Unmute)
 * - Library: L (Like), S (Shuffle), R (Repeat)
 *
 * Performance Characteristics:
 * - Reads directly from Zustand (`getState()`) on-demand: Zero reactive subscriptions
 * - Zero React re-renders caused by listener attachment or playback ticks
 * - Attached once on mount and cleanly removed on unmount
 * - Strictly ignores modifier combinations (Ctrl/Meta/Alt) to respect OS/browser defaults
 */
export function usePlayerKeyboardControls() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Guard against typing contexts and modal dialogs
      if (isTypingContext(e.target)) return;

      // 2. Disallow Ctrl / Meta / Alt modifications to avoid colliding with OS/browser shortcuts
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const code = e.code;
      const key = e.key;

      // ==========================================
      // PLAYBACK CONTROLS
      // ==========================================

      // Space: Play / Pause
      if ((code === "Space" || key === " ") && !e.shiftKey) {
        e.preventDefault();
        const { currentTrack, togglePlay } = usePlayerStore.getState();
        if (currentTrack) {
          togglePlay();
        }
        return;
      }

      // Shift + ArrowLeft: Previous Track
      if (key === "ArrowLeft" && e.shiftKey) {
        e.preventDefault();
        const { currentTrack, previous } = usePlayerStore.getState();
        if (currentTrack) {
          previous();
        }
        return;
      }

      // Shift + ArrowRight: Next Track
      if (key === "ArrowRight" && e.shiftKey) {
        e.preventDefault();
        const { currentTrack, next } = usePlayerStore.getState();
        if (currentTrack) {
          next();
        }
        return;
      }

      // ArrowLeft: Seek Backward (-5s)
      if (key === "ArrowLeft" && !e.shiftKey) {
        e.preventDefault();
        const { currentTrack, currentTime, seek } = usePlayerStore.getState();
        if (currentTrack) {
          seek(Math.max(0, currentTime - 5));
        }
        return;
      }

      // ArrowRight: Seek Forward (+5s)
      if (key === "ArrowRight" && !e.shiftKey) {
        e.preventDefault();
        const { currentTrack, currentTime, duration, seek } = usePlayerStore.getState();
        if (currentTrack) {
          seek(Math.min(duration || Infinity, currentTime + 5));
        }
        return;
      }

      // ==========================================
      // AUDIO CONTROLS
      // ==========================================

      // ArrowUp: Volume Up (+5%)
      if (key === "ArrowUp" && !e.shiftKey) {
        e.preventDefault();
        const { volume, setVolume } = usePlayerStore.getState();
        const nextVol = Math.min(1, Math.round((volume + 0.05) * 100) / 100);
        setVolume(nextVol);
        return;
      }

      // ArrowDown: Volume Down (-5%)
      if (key === "ArrowDown" && !e.shiftKey) {
        e.preventDefault();
        const { volume, setVolume } = usePlayerStore.getState();
        const nextVol = Math.max(0, Math.round((volume - 0.05) * 100) / 100);
        setVolume(nextVol);
        return;
      }

      // M: Mute / Unmute
      if (key.toLowerCase() === "m" && !e.shiftKey) {
        e.preventDefault();
        usePlayerStore.getState().toggleMute();
        return;
      }

      // ==========================================
      // LIBRARY CONTROLS
      // ==========================================

      // L: Like Song
      if (key.toLowerCase() === "l" && !e.shiftKey) {
        e.preventDefault();
        const { currentTrack } = usePlayerStore.getState();
        if (!currentTrack) return;

        const { isAuthenticated } = useAuthStore.getState();
        if (!isAuthenticated) {
          useAuthModalStore.getState().openAuthModal({
            category: "Favorites & Library",
            subtitle: "Library",
            title: "Save to your library.",
            description:
              "Sign in or create an account to like tracks, build custom playlists, and sync your music across devices.",
          });
          return;
        }

        useLikesStore.getState().toggleSongLike(currentTrack.id).catch((err) => {
          console.error("Failed to toggle song like via shortcut:", err);
        });
        return;
      }

      // S: Shuffle
      if (key.toLowerCase() === "s" && !e.shiftKey) {
        e.preventDefault();
        usePlayerStore.getState().toggleShuffle();
        return;
      }

      // R: Repeat
      if (key.toLowerCase() === "r" && !e.shiftKey) {
        e.preventDefault();
        usePlayerStore.getState().toggleRepeat();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
