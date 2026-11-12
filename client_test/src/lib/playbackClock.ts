/**
 * Playback clock — the live position of the player, read at animation-frame
 * resolution instead of the ~4 Hz the media element's `timeupdate` event
 * provides.
 *
 * Why this exists:
 * `timeupdate` fires roughly every 250 ms, so a progress bar driven from it
 * advances in visible steps. Every production player (Spotify, Apple Music,
 * YouTube) instead samples the media element on every frame and paints the
 * result straight to the DOM, which keeps React out of the hot path entirely:
 * a 60 fps bar costs zero component re-renders.
 *
 * The clock is deliberately framework-free. It knows nothing about React, and
 * it learns the fallback position (a Remote mirroring the Speaker's needle, a
 * Live Jam room) through an injected reader so this module never imports the
 * store — that would make the store import this module for `applySeek` and
 * create a cycle.
 *
 * A single rAF loop serves every subscriber. It only runs while somebody is
 * listening, and it only notifies when the position actually moved, so a
 * paused player costs nothing.
 */

export interface PlaybackClockReading {
  /** Current playback position in seconds. */
  position: number;
  /** Track length in seconds (0 when unknown). */
  duration: number;
}

export type PlaybackClockListener = (reading: PlaybackClockReading) => void;

export type PlaybackClockFallback = () => PlaybackClockReading;

const EMPTY_READING: PlaybackClockReading = { position: 0, duration: 0 };

/** Positions closer than this are treated as "unchanged" (no DOM write). */
const EPSILON = 0.01;

class PlaybackClock {
  private audio: HTMLAudioElement | null = null;
  private listeners = new Set<PlaybackClockListener>();
  private frame: number | null = null;
  private lastPosition = Number.NaN;
  private lastDuration = Number.NaN;
  private fallback: PlaybackClockFallback = () => EMPTY_READING;

  /**
   * Registers the media element that owns the real playback position. The
   * engine calls this once on mount and `detach()` on unmount.
   */
  attach(audio: HTMLAudioElement | null): void {
    this.audio = audio;
    this.lastPosition = Number.NaN;
    this.lastDuration = Number.NaN;
    this.ensureLoop();
  }

  detach(): void {
    this.audio = null;
    this.lastPosition = Number.NaN;
    this.lastDuration = Number.NaN;
  }

  /**
   * The reader used when this device is not the one playing (a Remote
   * mirroring the Speaker, or a Live Jam room). Injected so this module stays
   * free of store imports.
   */
  setFallback(reader: PlaybackClockFallback): void {
    this.fallback = reader;
  }

  /**
   * Subscribes to position updates. The listener is called once immediately
   * with the current reading so a freshly mounted scrubber is never blank.
   */
  subscribe(listener: PlaybackClockListener): () => void {
    this.listeners.add(listener);
    this.ensureLoop();
    listener(this.read());
    return () => {
      this.listeners.delete(listener);
      this.stopLoopIfIdle();
    };
  }

  /**
   * The current reading. The live media element wins whenever it has a source
   * and metadata; otherwise the injected fallback describes the position.
   */
  read(): PlaybackClockReading {
    const audio = this.audio;
    if (
      audio &&
      audio.src &&
      audio.readyState >= 1 /* HAVE_METADATA */ &&
      Number.isFinite(audio.duration)
    ) {
      return {
        position: audio.currentTime || 0,
        duration: audio.duration || 0,
      };
    }
    return this.fallback();
  }

  /**
   * Moves the live media element to `seconds`.
   *
   * The engine only corrected positions that drifted by more than 1.2 s, so a
   * small scrub updated the UI and was then dragged back by the next
   * `timeupdate`. Seeking the element directly makes every scrub land exactly
   * where the user let go.
   *
   * Returns false when the element is not ready yet — the engine keeps its
   * pending-seek path for that case.
   */
  applySeek(seconds: number): boolean {
    const audio = this.audio;
    if (
      !audio ||
      !audio.src ||
      audio.readyState < 1 ||
      !Number.isFinite(audio.duration)
    ) {
      return false;
    }
    audio.currentTime = Math.min(Math.max(0, seconds), audio.duration);
    return true;
  }

  private ensureLoop(): void {
    if (this.frame !== null || this.listeners.size === 0) return;

    const tick = () => {
      this.frame = null;

      const reading = this.read();
      // `NaN` means "nothing reported yet" — the first frame always notifies.
      const moved =
        Number.isNaN(this.lastPosition) ||
        Number.isNaN(this.lastDuration) ||
        Math.abs(reading.position - this.lastPosition) >= EPSILON ||
        Math.abs(reading.duration - this.lastDuration) >= EPSILON;
      if (moved) {
        this.lastPosition = reading.position;
        this.lastDuration = reading.duration;
        for (const listener of this.listeners) listener(reading);
      }

      if (this.listeners.size > 0) {
        this.frame = requestAnimationFrame(tick);
      }
    };

    this.frame = requestAnimationFrame(tick);
  }

  private stopLoopIfIdle(): void {
    if (this.listeners.size === 0 && this.frame !== null) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }
  }
}

export const playbackClock = new PlaybackClock();
