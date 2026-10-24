import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ListMusic, Loader2, Lock, Plus, X } from "lucide-react";
import { useAddToPlaylistModalStore } from "../../stores/add-to-playlist-modal.store";
import { useCreatePlaylistModalStore } from "../../stores/create-playlist-modal.store";
import { useLibraryStore } from "../../stores/library.store";
import { useAuthStore } from "../../stores/auth.store";
import { useAuthModalStore } from "../../stores/auth-modal.store";
import { playlistsApi } from "../../lib/playlists.api";
import { notify } from "../../lib/toast";
import { Button, IconButton } from "../ui";
import { cn } from "../ui/cn";
import type { Playlist } from "../../types/playlist";

export function AddToPlaylistModal() {
  const { isOpen, tracks, contextLabel, closeModal } = useAddToPlaylistModalStore();
  const openCreatePlaylistModal = useCreatePlaylistModalStore((s) => s.openModal);
  const { isAuthenticated } = useAuthStore();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const flashTimers = useRef<Map<string, number>>(new Map());

  const trackCount = tracks.length;
  const trackIds = useMemo(() => tracks.map((track) => track.id), [tracks]);
  const isSingleTrack = trackCount === 1;

  const [userPlaylists, setUserPlaylists] = useState<Playlist[]>([]);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);
  const [pending, setPending] = useState<Map<string, "add" | "remove">>(new Map());
  const [flashed, setFlashed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen || trackIds.length === 0) return;

    if (!isAuthenticated) {
      closeModal();
      useAuthModalStore.getState().openAuthModal({
        category: "Playlist Curation",
        subtitle: "Playlists",
        title: (
          <>
            Build your
            <br />
            playlists.
          </>
        ),
        description:
          "Sign in or create an account to save tracks to custom playlists and keep your library organized.",
      });
      return;
    }

    let isMounted = true;
    setPending(new Map());
    setUserPlaylists([]);
    setIsLoadingPlaylists(true);
    setFlashed(new Set());
    flashTimers.current.forEach((timer) => window.clearTimeout(timer));
    flashTimers.current.clear();
    playlistsApi
      .getUserPlaylists(trackIds)
      .then((res) => {
        if (isMounted) setUserPlaylists(res.playlists || []);
      })
      .catch(() => {
        if (isMounted) setUserPlaylists([]);
      })
      .finally(() => {
        if (isMounted) setIsLoadingPlaylists(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, trackIds, isAuthenticated, closeModal]);

  // Escape to close, focus into the panel, lock body scroll, trap Tab.
  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const panel = panelRef.current;
    panel?.focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeModal();
        return;
      }
      if (event.key !== "Tab" || !panel) return;

      const focusable = panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [isOpen, closeModal]);

  useEffect(() => {
    const timers = flashTimers.current;
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
  }, []);

  if (!isOpen || trackCount === 0) return null;

  /**
   * `allowDuplicates` playlists never reach a permanent "added" state, so
   * acknowledge the add briefly and then fall back to "Add".
   */
  const flashAdded = (playlistId: string) => {
    setFlashed((prev) => new Set(prev).add(playlistId));
    const existing = flashTimers.current.get(playlistId);
    if (existing) window.clearTimeout(existing);
    const timer = window.setTimeout(() => {
      flashTimers.current.delete(playlistId);
      setFlashed((prev) => {
        const next = new Set(prev);
        next.delete(playlistId);
        return next;
      });
    }, 1600);
    flashTimers.current.set(playlistId, timer);
  };

  const isPersonalCut = tracks.some((track) => track.scope === "PERSONAL");

  /**
   * `allowDuplicates` playlists never settle into an "already added" state,
   * so they stay add-only.
   */
  const isFullyAdded = (playlist: Playlist) =>
    !playlist.allowDuplicates && playlist.containsAll === true;

  /**
   * The toggle is a song-level affordance, not a release-level one: only a
   * single track can be removed from here, so a click can never delete a
   * whole batch.
   */
  const canToggleOff = (playlist: Playlist) =>
    isSingleTrack && isFullyAdded(playlist);

  const missingCountFor = (playlist: Playlist) =>
    typeof playlist.containsCount === "number"
      ? Math.max(trackCount - playlist.containsCount, 0)
      : trackCount;

  const handleAdd = async (playlist: Playlist) => {
    if (isFullyAdded(playlist)) return;

    if (isPersonalCut && (playlist.visibility !== "PRIVATE" || playlist.isCollaborative)) {
      notify.error("Personal cuts can only be added to private playlists");
      return;
    }

    setPending((prev) => new Map(prev).set(playlist.id, "add"));
    try {
      const result = await playlistsApi.addTracks(playlist.id, trackIds);
      const addedCount = result.addedCount ?? 0;
      const skippedCount = result.skippedCount ?? 0;
      const nowComplete =
        !playlist.allowDuplicates && addedCount + skippedCount >= trackCount;

      if (addedCount > 0) {
        useLibraryStore.getState().updatePlaylistTracksCount(playlist.id, addedCount);
        useLibraryStore.getState().invalidate();
      }

      setUserPlaylists((prev) =>
        prev.map((item) =>
          item.id === playlist.id
            ? {
                ...item,
                tracksCount: (item.tracksCount ?? 0) + addedCount,
                containsCount: nowComplete
                  ? trackCount
                  : Math.min(trackCount, (item.containsCount ?? 0) + addedCount),
                containsAll: nowComplete,
              }
            : item,
        ),
      );

      if (addedCount > 0 && !nowComplete) flashAdded(playlist.id);
    } catch (err) {
      notify.error(
        err instanceof Error ? err.message : "Could not add tracks to playlist",
      );
    } finally {
      setPending((prev) => {
        const next = new Map(prev);
        next.delete(playlist.id);
        return next;
      });
    }
  };

  const handleRemove = async (playlist: Playlist) => {
    setPending((prev) => new Map(prev).set(playlist.id, "remove"));

    // Flip the row immediately; restore the snapshot if the request fails.
    setUserPlaylists((prev) =>
      prev.map((item) =>
        item.id === playlist.id
          ? {
              ...item,
              tracksCount: Math.max((item.tracksCount ?? 0) - trackCount, 0),
              containsCount: 0,
              containsAll: false,
            }
          : item,
      ),
    );

    try {
      const result = await playlistsApi.removeTracks(playlist.id, trackIds);
      const removedCount = result.removedCount ?? 0;
      if (removedCount > 0) {
        useLibraryStore.getState().updatePlaylistTracksCount(playlist.id, -removedCount);
        useLibraryStore.getState().invalidate();
      }
    } catch (err) {
      setUserPlaylists((prev) =>
        prev.map((item) => (item.id === playlist.id ? playlist : item)),
      );
      notify.error(
        err instanceof Error ? err.message : "Could not remove track from playlist",
      );
    } finally {
      setPending((prev) => {
        const next = new Map(prev);
        next.delete(playlist.id);
        return next;
      });
    }
  };

  const handleRowClick = (playlist: Playlist) => {
    if (canToggleOff(playlist)) void handleRemove(playlist);
    else void handleAdd(playlist);
  };

  const eligiblePlaylists = isPersonalCut
    ? userPlaylists.filter((pl) => pl.visibility === "PRIVATE" && !pl.isCollaborative)
    : userPlaylists;

  const subtitle = isSingleTrack
    ? (tracks[0]?.title ?? "1 track")
    : `${trackCount} tracks${contextLabel ? ` from ${contextLabel}` : ""}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={closeModal}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="relative flex max-h-[85dvh] w-full max-w-sm flex-col overflow-hidden rounded-surface border border-border bg-card shadow-floating outline-none animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="font-serif italic text-heading text-foreground"
            >
              Add to Playlist
            </h2>
            <p className="mt-0.5 truncate text-caption text-muted-foreground">
              {subtitle}
            </p>
            {isPersonalCut && (
              <p className="mt-2 flex items-center gap-1.5 text-eyebrow text-warning">
                <Lock className="h-3 w-3 shrink-0" />
                Private playlists only
              </p>
            )}
          </div>
          <IconButton
            size="sm"
            aria-label="Close"
            onClick={closeModal}
            className="-mt-1 -mr-1.5"
          >
            <X className="h-4 w-4" />
          </IconButton>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-border">
          {isLoadingPlaylists ? (
            <div className="divide-y divide-border/60">
              {[0, 1, 2].map((row) => (
                <div
                  key={row}
                  className="flex items-center justify-between gap-3 px-5 py-3.5"
                >
                  <span className="h-3 w-2/5 animate-pulse rounded-full bg-muted" />
                  <span className="h-7 w-24 animate-pulse rounded-full bg-muted" />
                </div>
              ))}
            </div>
          ) : eligiblePlaylists.length === 0 ? (
            <div className="flex flex-col items-center gap-4 px-6 py-12 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <ListMusic className="h-5 w-5" />
              </span>
              <div>
                <p className="text-caption font-medium text-foreground">
                  {isPersonalCut ? "No private playlists" : "No playlists yet"}
                </p>
                <p className="mt-1 text-eyebrow text-muted-foreground">
                  {isPersonalCut
                    ? "Personal cuts can only go in private playlists you own."
                    : "Create one to start saving tracks."}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                leftIcon={<Plus className="h-3.5 w-3.5" />}
                onClick={() => {
                  closeModal();
                  openCreatePlaylistModal(trackIds);
                }}
              >
                New playlist
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {eligiblePlaylists.map((playlist) => {
                const pendingKind = pending.get(playlist.id);
                const isBusy = Boolean(pendingKind);
                const permanentlyAdded = isFullyAdded(playlist);
                const isAdded = permanentlyAdded || flashed.has(playlist.id);
                const canRemove = canToggleOff(playlist);
                const isDisabled = isBusy || (permanentlyAdded && !canRemove);
                const missingCount = missingCountFor(playlist);

                const pillState = isBusy
                  ? "border-border text-muted-foreground"
                  : isAdded
                    ? "border-success/30 bg-success-soft text-success"
                    : "border-border text-muted-foreground group-hover:border-primary group-hover:text-primary";

                return (
                  <button
                    key={playlist.id}
                    type="button"
                    disabled={isDisabled}
                    aria-busy={isBusy || undefined}
                    aria-label={
                      canRemove
                        ? `Remove from ${playlist.title}`
                        : permanentlyAdded
                          ? `Already in ${playlist.title}`
                          : `Add to ${playlist.title}`
                    }
                    onClick={() => handleRowClick(playlist)}
                    className={cn(
                      "group flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition-colors",
                      "hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none",
                      "disabled:cursor-default disabled:hover:bg-transparent",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate text-caption font-medium text-foreground">
                      {playlist.title}
                    </span>

                    <span
                      className={cn(
                        "flex h-7 min-w-24 shrink-0 items-center justify-center gap-1.5 rounded-full border px-3",
                        "font-eyebrow text-eyebrow font-semibold uppercase tracking-wider transition-colors",
                        pillState,
                        canRemove &&
                          "group-hover:border-destructive/40 group-hover:bg-destructive-soft group-hover:text-destructive",
                      )}
                    >
                      {isBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : isAdded ? (
                        canRemove ? (
                          <>
                            <span className="flex items-center gap-1.5 group-hover:hidden">
                              <Check className="h-3 w-3" strokeWidth={3} />
                              Added
                            </span>
                            <span className="hidden items-center gap-1.5 group-hover:flex">
                              <X className="h-3 w-3" strokeWidth={3} />
                              Remove
                            </span>
                          </>
                        ) : (
                          <>
                            <Check className="h-3 w-3" strokeWidth={3} />
                            Added
                          </>
                        )
                      ) : (
                        <>
                          <Plus className="h-3 w-3" strokeWidth={3} />
                          {missingCount > 0 && missingCount < trackCount
                            ? `Add ${missingCount}`
                            : "Add"}
                        </>
                      )}
                    </span>
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => {
                  closeModal();
                  openCreatePlaylistModal(trackIds);
                }}
                className="flex w-full items-center gap-2 px-5 py-3 text-left font-eyebrow text-eyebrow font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
                New playlist
              </button>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end border-t border-border px-5 py-3">
          <Button size="sm" variant="primary" onClick={closeModal}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
