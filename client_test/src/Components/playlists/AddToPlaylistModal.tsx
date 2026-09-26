import { useState, useEffect } from "react";
import { useAddToPlaylistModalStore } from "../../stores/add-to-playlist-modal.store";
import { useCreatePlaylistModalStore } from "../../stores/create-playlist-modal.store";
import { useLibraryStore } from "../../stores/library.store";
import { useAuthStore } from "../../stores/auth.store";
import { useAuthModalStore } from "../../stores/auth-modal.store";
import { playlistsApi } from "../../lib/playlists.api";
import type { Playlist } from "../../types/playlist";

export function AddToPlaylistModal() {
  const { isOpen, track, closeModal } = useAddToPlaylistModalStore();
  const openCreatePlaylistModal = useCreatePlaylistModalStore((s) => s.openModal);
  const { isAuthenticated } = useAuthStore();

  const [userPlaylists, setUserPlaylists] = useState<Playlist[]>([]);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);
  const [addingToPlaylistId, setAddingToPlaylistId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !track) return;

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
    setIsLoadingPlaylists(true);
    playlistsApi
      .getUserPlaylists()
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
  }, [isOpen, track, isAuthenticated, closeModal]);

  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeModal();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closeModal]);

  if (!isOpen || !track) return null;

  const isPersonalCut = (track as any).scope === "PERSONAL";

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2200);
  };

  const handleAddSongToPlaylist = async (playlist: Playlist) => {
    if (isPersonalCut && (playlist.visibility !== "PRIVATE" || playlist.isCollaborative)) {
      showToast("Personal cuts can only be added to private playlists");
      return;
    }
    setAddingToPlaylistId(playlist.id);
    try {
      await playlistsApi.addTracks(playlist.id, [track.id]);
      useLibraryStore.getState().updatePlaylistTracksCount(playlist.id, 1);
      useLibraryStore.getState().invalidate();
      showToast(`Added to "${playlist.title}"`);
      setTimeout(() => {
        closeModal();
      }, 500);
    } catch (err: any) {
      showToast(err.message || "Could not add track to playlist");
    } finally {
      setAddingToPlaylistId(null);
    }
  };

  const eligiblePlaylists = isPersonalCut
    ? userPlaylists.filter((pl) => pl.visibility === "PRIVATE" && !pl.isCollaborative)
    : userPlaylists;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-canvas/80 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={closeModal}
    >
      <div
        className="w-full max-w-sm border border-line bg-panel p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line pb-3 mb-3">
          <div>
            <h4 className="font-serif italic font-medium text-lg text-ink">Add to Playlist</h4>
            <p className="font-mono text-[10px] text-ink-soft truncate max-w-[220px]">
              {track.title}
            </p>
            {isPersonalCut && (
              <p className="mt-1 font-mono text-[9px] text-amber-600 dark:text-amber-400">
                🔒 Personal cut: private playlists only
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={closeModal}
            className="font-mono text-xs text-ink-soft hover:text-ink cursor-pointer p-1"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-line/40 my-2">
          {isLoadingPlaylists ? (
            <div className="py-8 text-center font-mono text-xs text-ink-soft">
              Loading playlists...
            </div>
          ) : eligiblePlaylists.length === 0 ? (
            <div className="py-8 text-center">
              <p className="font-serif italic text-sm text-ink-soft">
                {isPersonalCut
                  ? "No private playlists found. Create a private playlist for your personal cuts."
                  : "No playlists found."}
              </p>
              <button
                type="button"
                onClick={() => {
                  const trackIdToAdd = track?.id ? [track.id] : []
                  closeModal();
                  openCreatePlaylistModal(trackIdToAdd);
                }}
                className="mt-3 font-mono text-[10px] uppercase tracking-wider py-1.5 px-3.5 border border-line bg-canvas hover:border-ink text-ink cursor-pointer"
              >
                Create Playlist
              </button>
            </div>
          ) : (
            <>
              {eligiblePlaylists.map((pl) => (
                <button
                  key={pl.id}
                  type="button"
                  disabled={addingToPlaylistId === pl.id}
                  onClick={() => handleAddSongToPlaylist(pl)}
                  className="w-full px-3 py-2.5 flex items-center justify-between hover:bg-canvas-deep transition-colors text-left cursor-pointer group"
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <p className="font-medium text-xs text-ink group-hover:text-blue truncate">
                      {pl.title}
                    </p>
                    <p className="font-mono text-[9.5px] text-ink-soft">
                      {pl.savesCount ?? 0} saves &bull; {pl.tracksCount ?? 0} tracks
                    </p>
                  </div>
                  <span className="font-mono text-[10px] text-ink-soft group-hover:text-ink shrink-0">
                    {addingToPlaylistId === pl.id ? "Adding..." : "+ Add"}
                  </span>
                </button>
              ))}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    const trackIdToAdd = track?.id ? [track.id] : []
                    closeModal();
                    openCreatePlaylistModal(trackIdToAdd);
                  }}
                  className="w-full font-mono text-[10px] uppercase tracking-wider py-2 px-3 border border-dashed border-line bg-canvas hover:border-ink text-ink cursor-pointer rounded-xs flex items-center justify-center gap-1.5"
                >
                  <span>+</span>
                  <span>New Playlist</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Visual Feedback Toast */}
        {toastMessage && (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 font-mono text-[11px] uppercase tracking-wider py-2 px-4 bg-ink text-canvas shadow-xl rounded-md pointer-events-none animate-in fade-in duration-150">
            ✓ {toastMessage}
          </div>
        )}
      </div>
    </div>
  );
}
