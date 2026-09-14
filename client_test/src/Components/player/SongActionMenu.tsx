import { useState, useRef, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { usePlayerStore } from "../../stores/player.store";
import { useJamStore } from "../../stores/jam.store";
import { useAuthStore } from "../../stores/auth.store";
import { useAuthModalStore } from "../../stores/auth-modal.store";
import { playlistsApi } from "../../lib/playlists.api";
import type { PlayerTrack } from "../../types/player";
import type { Playlist } from "../../types/playlist";

interface SongActionMenuProps {
  track: PlayerTrack;
  buttonClassName?: string;
  align?: "left" | "right";
}

export function SongActionMenu({
  track,
  buttonClassName = "p-1.5 text-ink-soft hover:text-ink transition-colors cursor-pointer rounded",
  align = "right",
}: SongActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPlaylistModalOpen, setIsPlaylistModalOpen] = useState(false);
  const [userPlaylists, setUserPlaylists] = useState<Playlist[]>([]);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);
  const [addingToPlaylistId, setAddingToPlaylistId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const menuRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

  const playNext = usePlayerStore((s) => s.playNext);
  const addToQueue = usePlayerStore((s) => s.addToQueue);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const activeJamRoom = useJamStore((s) => s.activeRoom);
  const addToJamQueue = useJamStore((s) => s.addToJamQueue);
  const { isAuthenticated } = useAuthStore();

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2200);
  };

  const handlePlayNow = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    playTrack(track);
  };

  const handlePlayNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    playNext(track);
    showToast("Playing next in queue");
  };

  const handleAddToQueue = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    addToQueue(track);
    showToast("Added to queue");
  };

  const handleOpenPlaylistModal = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    if (!isAuthenticated) {
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
    setIsPlaylistModalOpen(true);
    setIsLoadingPlaylists(true);
    try {
      const res = await playlistsApi.getUserPlaylists();
      setUserPlaylists(res.playlists || []);
    } catch {
      setUserPlaylists([]);
    } finally {
      setIsLoadingPlaylists(false);
    }
  };

  const handleAddSongToPlaylist = async (playlist: Playlist) => {
    setAddingToPlaylistId(playlist.id);
    try {
      await playlistsApi.addTracks(playlist.id, [track.id]);
      showToast(`Added to "${playlist.title}"`);
      setIsPlaylistModalOpen(false);
    } catch (err: any) {
      alert(err.message || "Could not add track to playlist");
    } finally {
      setAddingToPlaylistId(null);
    }
  };

  const handleGoToArtist = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    if (track.artistSlug || track.artistId) {
      navigate({
        to: "/artists/$idOrSlug",
        params: { idOrSlug: track.artistSlug || track.artistId },
      });
    }
  };

  const handleGoToAlbum = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    const target = track.albumSlug || track.albumId;
    if (target) {
      navigate({
        to: "/albums/$idOrSlug",
        params: { idOrSlug: target },
      });
    }
  };

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      {/* 3-Dots Trigger Button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        aria-label="Track options"
        className={buttonClassName}
        title="More options"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </button>

      {/* Floating Dropdown Menu */}
      {isOpen && (
        <div
          className={`absolute ${
            align === "right" ? "right-0" : "left-0"
          } bottom-full mb-1 sm:bottom-auto sm:top-full sm:mt-1 z-50 w-48 border border-line bg-panel shadow-2xl py-1 divide-y divide-line/40 animate-in fade-in zoom-in-95 duration-100 font-sans text-xs`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="py-1">
            <button
              type="button"
              onClick={handlePlayNow}
              className="w-full text-left px-3.5 py-2 hover:bg-canvas-deep flex items-center gap-2.5 text-ink cursor-pointer"
            >
              <span className="text-blue">▶</span>
              <span>Play Now</span>
            </button>
            <button
              type="button"
              onClick={handlePlayNext}
              className="w-full text-left px-3.5 py-2 hover:bg-canvas-deep flex items-center gap-2.5 text-ink cursor-pointer"
            >
              <span>⏭</span>
              <span>Play Next</span>
            </button>
            <button
              type="button"
              onClick={handleAddToQueue}
              className="w-full text-left px-3.5 py-2 hover:bg-canvas-deep flex items-center gap-2.5 text-ink cursor-pointer"
            >
              <span>➕</span>
              <span>Add to Queue</span>
            </button>
            {activeJamRoom && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(false);
                  addToJamQueue({
                    id: track.id,
                    title: track.title,
                    artistId: track.artistId,
                    artistName: track.artistName,
                    artistSlug: track.artistSlug,
                    albumId: track.albumId,
                    albumTitle: track.albumTitle,
                    albumSlug: track.albumSlug,
                    duration: track.durationSeconds || 0,
                    artworkUrl: track.coverImageUrl,
                    audioUrl: track.audioUrl,
                    hlsManifestUrl: track.hlsManifestUrl,
                    rawAudioKey: track.rawAudioKey,
                  });
                  showToast("Added to Live Jam queue!");
                }}
                className="w-full text-left px-3.5 py-2 hover:bg-emerald-500/10 flex items-center gap-2.5 text-emerald-400 font-medium cursor-pointer"
              >
                <span>🎧</span>
                <span>Add to Jam Queue</span>
              </button>
            )}
          </div>

          <div className="py-1">
            <button
              type="button"
              onClick={handleOpenPlaylistModal}
              className="w-full text-left px-3.5 py-2 hover:bg-canvas-deep flex items-center gap-2.5 text-ink cursor-pointer"
            >
              <span>📑</span>
              <span>Add to Playlist...</span>
            </button>
          </div>

          <div className="py-1">
            {(track.artistSlug || track.artistId) && (
              <button
                type="button"
                onClick={handleGoToArtist}
                className="w-full text-left px-3.5 py-2 hover:bg-canvas-deep flex items-center gap-2.5 text-ink cursor-pointer truncate"
              >
                <span>👤</span>
                <span className="truncate">Go to Artist</span>
              </button>
            )}
            {(track.albumSlug || track.albumId) && (
              <button
                type="button"
                onClick={handleGoToAlbum}
                className="w-full text-left px-3.5 py-2 hover:bg-canvas-deep flex items-center gap-2.5 text-ink cursor-pointer truncate"
              >
                <span>💿</span>
                <span className="truncate">Go to Release</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Add to Playlist Modal */}
      {isPlaylistModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-canvas/80 backdrop-blur-sm"
          onClick={() => setIsPlaylistModalOpen(false)}
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
              </div>
              <button
                type="button"
                onClick={() => setIsPlaylistModalOpen(false)}
                className="font-mono text-xs text-ink-soft hover:text-ink cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-line/40 my-2">
              {isLoadingPlaylists ? (
                <div className="py-8 text-center font-mono text-xs text-ink-soft">
                  Loading playlists...
                </div>
              ) : userPlaylists.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="font-serif italic text-sm text-ink-soft">No playlists found.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setIsPlaylistModalOpen(false);
                      navigate({ to: "/playlists" });
                    }}
                    className="mt-3 font-mono text-[10px] uppercase tracking-wider py-1 px-3 border border-line bg-canvas hover:border-ink text-ink cursor-pointer"
                  >
                    Create Playlist
                  </button>
                </div>
              ) : (
                userPlaylists.map((pl) => (
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
                        {pl.savesCount ?? 0} saves
                      </p>
                    </div>
                    <span className="font-mono text-[10px] text-ink-soft group-hover:text-ink shrink-0">
                      {addingToPlaylistId === pl.id ? "Adding..." : "+ Add"}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Visual Feedback Toast */}
      {toastMessage && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 font-mono text-[11px] uppercase tracking-wider py-2 px-4 bg-ink text-canvas shadow-xl rounded-md pointer-events-none animate-in fade-in duration-150">
          ✓ {toastMessage}
        </div>
      )}
    </div>
  );
}
