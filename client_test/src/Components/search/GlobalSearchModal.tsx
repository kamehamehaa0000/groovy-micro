import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  searchApi,
  type GlobalSearchResponse,
  type SearchSongItem,
} from "../../lib/search.api";
import { usePlayerStore } from "../../stores/player.store";
import type { PlayerTrack } from "../../types/player";
import {
  PlayIconSVG,
  PauseIconSVG,
  LockIconSVG,
} from "../icons";

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SearchCategory = "all" | "songs" | "albums" | "artists" | "playlists" | "users";

function formatDuration(totalSeconds: number) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function GlobalSearchModal({ isOpen, onClose }: GlobalSearchModalProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<SearchCategory>("all");
  const [results, setResults] = useState<GlobalSearchResponse | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const { currentTrack, playbackStatus, playTrack, togglePlay, addToQueue } = usePlayerStore();

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    } else {
      setQuery("");
      setResults(null);
    }
  }, [isOpen]);

  // Handle ESC to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Debounced live search
  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await searchApi.search(query, 6, activeCategory);
        setResults(res);
      } catch (err) {
        console.warn("[GlobalSearch] Search failed:", err);
      } finally {
        setIsSearching(false);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [query, activeCategory]);

  // Play a song from search results
  const handlePlaySong = (song: SearchSongItem, allSongs: SearchSongItem[], index: number) => {
    const isThisPlaying = currentTrack?.id === song.id;
    if (isThisPlaying) {
      togglePlay();
      return;
    }

    const playerTrackList: PlayerTrack[] = allSongs.map((t) => ({
      id: t.id,
      title: t.title,
      artistId: t.artistId,
      artistName: t.artistName,
      artistSlug: t.artistSlug,
      albumId: t.albumId || "",
      albumTitle: t.albumTitle || "",
      coverImageUrl: t.coverImageUrl,
      durationSeconds: t.durationSeconds,
      audioUrl: t.audioUrl,
      isExplicit: t.isExplicit,
    }));

    playTrack(
      playerTrackList[index],
      playerTrackList,
      index,
      `search:${query}`,
      `Search: "${query}"`
    );
  };

  if (!isOpen) return null;

  const hasAnyResults =
    results &&
    (results.songs.length > 0 ||
      results.albums.length > 0 ||
      results.artists.length > 0 ||
      results.playlists.length > 0 ||
      results.users.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-canvas/80 backdrop-blur-md animate-fade-in select-none">
      {/* Click backdrop to close */}
      <div className="fixed inset-0" onClick={onClose} />

      {/* Modal Container */}
      <div className="relative w-full max-w-3xl border border-line bg-panel shadow-2xl overflow-hidden flex flex-col max-h-[80vh] z-10">
        {/* Header Search Input */}
        <div className="flex items-center px-4 sm:px-6 py-4 border-b border-line bg-panel gap-3">
          {/* Search Lens SVG */}
          <svg
            className="w-4 h-4 text-ink-soft shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tracks, artists, albums, playlists, or listeners..."
            className="w-full bg-transparent border-none text-ink text-sm sm:text-base placeholder:text-ink-soft/60 focus:outline-hidden font-sans"
          />

          {isSearching && (
            <div className="w-4 h-4 rounded-full border-2 border-ink-soft/30 border-t-ink animate-spin shrink-0" />
          )}

          {query && !isSearching && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-ink-soft hover:text-ink text-xs font-mono px-1.5 py-0.5 border border-line hover:border-ink transition-colors cursor-pointer"
            >
              Clear
            </button>
          )}

          <div className="hidden sm:flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-ink-soft/80 border border-line px-2 py-1 bg-canvas shrink-0">
            <span>ESC</span>
          </div>
        </div>

        {/* Filter Categories Bar */}
        <div className="flex items-center gap-1.5 px-4 sm:px-6 py-2.5 border-b border-line/60 bg-canvas/50 overflow-x-auto text-xs font-mono uppercase tracking-wider">
          {(
            [
              { id: "all", label: "All" },
              { id: "songs", label: "Tracks" },
              { id: "artists", label: "Artists" },
              { id: "albums", label: "Albums" },
              { id: "playlists", label: "Playlists" },
              { id: "users", label: "Community" },
            ] as const
          ).map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={`px-3 py-1 rounded-full border transition-all cursor-pointer text-[10px] whitespace-nowrap ${
                activeCategory === cat.id
                  ? "bg-ink text-canvas border-ink font-semibold shadow-xs"
                  : "bg-panel text-ink-soft border-line hover:text-ink hover:border-ink/50"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Results Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* 1. Initial Empty Search State */}
          {!query.trim() && (
            <div className="py-12 text-center">
              <div className="font-serif italic text-2xl text-ink mb-2">
                What do you want to play?
              </div>
              <p className="font-sans text-xs text-ink-soft max-w-sm mx-auto leading-relaxed">
                Discover new releases from verified musicians, curated public playlists, or find fellow music enthusiasts in the Groovy community.
              </p>
            </div>
          )}

          {/* 2. No Results Found State */}
          {query.trim() && !isSearching && !hasAnyResults && (
            <div className="py-12 text-center">
              <div className="font-serif italic text-xl text-ink mb-2">
                No results found for "{query}"
              </div>
              <p className="font-sans text-xs text-ink-soft max-w-sm mx-auto">
                Please double check your spelling or search by an artist name, song title, or curator.
              </p>
            </div>
          )}

          {/* 3. Render Results */}
          {hasAnyResults && (
            <div className="space-y-8">
              {/* TOP RESULT CARD */}
              {results.topResult && activeCategory === "all" && (
                <div>
                  <h4 className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-blue-deep dark:text-blue-400 mb-3">
                    Top Result
                  </h4>
                  <div className="border border-line bg-canvas p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group hover:border-ink transition-colors">
                    {/* Top Result: Artist */}
                    {results.topResult.type === "artist" && (
                      <div
                        className="flex items-center gap-4 cursor-pointer flex-1 min-w-0"
                        onClick={() => {
                          onClose();
                          navigate({
                            to: "/artists/$idOrSlug",
                            params: { idOrSlug: (results.topResult!.item as any).slug },
                          });
                        }}
                      >
                        <div className="w-16 h-16 rounded-full bg-stone/20 border border-line shrink-0 overflow-hidden">
                          {(results.topResult.item as any).avatarUrl ? (
                            <img
                              src={(results.topResult.item as any).avatarUrl}
                              alt={(results.topResult.item as any).stageName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center font-serif italic text-xl text-ink">
                              {(results.topResult.item as any).stageName[0]}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="font-mono text-[9px] uppercase tracking-wider text-blue bg-blue/10 px-2 py-0.5 rounded-full inline-block mb-1">
                            Artist
                          </span>
                          <h3 className="font-serif italic text-xl font-bold text-ink truncate group-hover:text-blue transition-colors">
                            {(results.topResult.item as any).stageName}
                          </h3>
                          <p className="font-mono text-[10px] text-ink-soft">
                            {(results.topResult.item as any).monthlyListeners.toLocaleString()}{" "}
                            monthly listeners
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Top Result: Song */}
                    {results.topResult.type === "song" && (
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="w-16 h-16 bg-stone/20 border border-line shrink-0 overflow-hidden relative">
                          {(results.topResult.item as any).coverImageUrl ? (
                            <img
                              src={(results.topResult.item as any).coverImageUrl}
                              alt={(results.topResult.item as any).title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center font-serif italic text-xl text-ink-soft">
                              ♪
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="font-mono text-[9px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full inline-block mb-1">
                            Track
                          </span>
                          <h3 className="font-serif italic text-xl font-bold text-ink truncate">
                            {(results.topResult.item as any).title}
                          </h3>
                          <Link
                            to="/artists/$idOrSlug"
                            params={{ idOrSlug: (results.topResult.item as any).artistSlug }}
                            onClick={onClose}
                            className="font-sans text-xs text-ink-soft hover:text-blue transition-colors truncate block"
                          >
                            {(results.topResult.item as any).artistName}
                          </Link>
                        </div>
                      </div>
                    )}

                    {/* Top Result: Album */}
                    {results.topResult.type === "album" && (
                      <div
                        className="flex items-center gap-4 cursor-pointer flex-1 min-w-0"
                        onClick={() => {
                          onClose();
                          navigate({
                            to: "/albums/$idOrSlug",
                            params: { idOrSlug: (results.topResult!.item as any).slug },
                          });
                        }}
                      >
                        <div className="w-16 h-16 bg-stone/20 border border-line shrink-0 overflow-hidden">
                          {(results.topResult.item as any).coverImageUrl ? (
                            <img
                              src={(results.topResult.item as any).coverImageUrl}
                              alt={(results.topResult.item as any).title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center font-serif italic text-xl text-ink-soft">
                              💿
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="font-mono text-[9px] uppercase tracking-wider text-purple-600 dark:text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full inline-block mb-1">
                            {(results.topResult.item as any).albumType || "Album"}
                          </span>
                          <h3 className="font-serif italic text-xl font-bold text-ink truncate group-hover:text-blue transition-colors">
                            {(results.topResult.item as any).title}
                          </h3>
                          <p className="font-sans text-xs text-ink-soft truncate">
                            {(results.topResult.item as any).artistName}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Top Result: Playlist */}
                    {results.topResult.type === "playlist" && (
                      <div
                        className="flex items-center gap-4 cursor-pointer flex-1 min-w-0"
                        onClick={() => {
                          onClose();
                          navigate({
                            to: "/playlists/$id",
                            params: { id: (results.topResult!.item as any).id },
                          });
                        }}
                      >
                        <div className="w-16 h-16 bg-stone/20 border border-line shrink-0 overflow-hidden">
                          {(results.topResult.item as any).coverImageUrl ? (
                            <img
                              src={(results.topResult.item as any).coverImageUrl}
                              alt={(results.topResult.item as any).title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center font-serif italic text-xl text-ink-soft">
                              ♫
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="font-mono text-[9px] uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full inline-block mb-1">
                            Playlist
                          </span>
                          <h3 className="font-serif italic text-xl font-bold text-ink truncate group-hover:text-blue transition-colors">
                            {(results.topResult.item as any).title}
                          </h3>
                          <p className="font-mono text-[10px] text-ink-soft">
                            By {(results.topResult.item as any).ownerName} •{" "}
                            {(results.topResult.item as any).tracksCount} tracks
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Top Result: User */}
                    {results.topResult.type === "user" && (
                      <div
                        className="flex items-center gap-4 cursor-pointer flex-1 min-w-0"
                        onClick={() => {
                          onClose();
                          navigate({
                            to: "/users/$id",
                            params: { id: (results.topResult!.item as any).id },
                          });
                        }}
                      >
                        <div className="w-16 h-16 rounded-full bg-stone/20 border border-line shrink-0 overflow-hidden">
                          {(results.topResult.item as any).avatarUrl ? (
                            <img
                              src={(results.topResult.item as any).avatarUrl}
                              alt={(results.topResult.item as any).displayName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center font-serif italic text-xl text-ink">
                              {(results.topResult.item as any).displayName[0]}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="font-mono text-[9px] uppercase tracking-wider text-stone/80 bg-stone/20 px-2 py-0.5 rounded-full inline-block mb-1">
                            {(results.topResult.item as any).role}
                          </span>
                          <h3 className="font-serif italic text-xl font-bold text-ink truncate group-hover:text-blue transition-colors">
                            {(results.topResult.item as any).displayName}
                          </h3>
                        </div>
                      </div>
                    )}

                    {/* Quick 1-Click Action for Songs */}
                    {results.topResult.type === "song" && (
                      <button
                        type="button"
                        onClick={() =>
                          handlePlaySong(
                            results.topResult!.item as SearchSongItem,
                            results.songs,
                            0
                          )
                        }
                        className="shrink-0 w-11 h-11 rounded-full bg-ink text-canvas hover:bg-ink/80 flex items-center justify-center transition-transform hover:scale-105 cursor-pointer shadow-md"
                        title="Play"
                      >
                        <PlayIconSVG className="w-4 h-4 ml-0.5" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* SONGS RESULTS */}
              {results.songs.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3 border-b border-line pb-1.5">
                    <h4 className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">
                      Tracks ({results.songs.length})
                    </h4>
                  </div>

                  <div className="border border-line bg-panel divide-y divide-line shadow-xs">
                    {results.songs.map((song, idx) => {
                      const isPlaying =
                        currentTrack?.id === song.id &&
                        playbackStatus === "playing";

                      return (
                        <div
                          key={song.id}
                          className="flex items-center justify-between p-3 hover:bg-canvas-deep transition-colors group"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1 pr-3">
                            <button
                              type="button"
                              onClick={() => handlePlaySong(song, results.songs, idx)}
                              className="w-7 h-7 rounded-full border border-line flex items-center justify-center font-mono text-xs text-ink-soft hover:border-ink hover:text-ink transition-colors shrink-0 cursor-pointer bg-canvas"
                            >
                              {isPlaying ? (
                                <PauseIconSVG className="w-3 h-3" />
                              ) : (
                                <PlayIconSVG className="w-3 h-3 ml-0.5" />
                              )}
                            </button>

                            <div className="w-9 h-9 bg-stone/20 border border-line shrink-0 overflow-hidden">
                              {song.coverImageUrl ? (
                                <img
                                  src={song.coverImageUrl}
                                  alt={song.title}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center font-serif italic text-xs text-ink-soft">
                                  ♪
                                </div>
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="font-serif italic text-sm font-semibold text-ink truncate">
                                  {song.title}
                                </span>
                                {song.isExplicit && (
                                  <span className="font-mono text-[8px] uppercase border border-line px-1 py-0.2 rounded text-ink-soft">
                                    E
                                  </span>
                                )}
                              </div>
                              <Link
                                to="/artists/$idOrSlug"
                                params={{ idOrSlug: song.artistSlug }}
                                onClick={onClose}
                                className="font-sans text-xs text-ink-soft hover:text-blue transition-colors truncate block"
                              >
                                {song.artistName}
                              </Link>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span className="font-mono text-xs text-ink-soft">
                              {formatDuration(song.durationSeconds)}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                addToQueue({
                                  id: song.id,
                                  title: song.title,
                                  artistId: song.artistId,
                                  artistName: song.artistName,
                                  artistSlug: song.artistSlug,
                                  albumId: song.albumId || "",
                                  albumTitle: song.albumTitle || "",
                                  coverImageUrl: song.coverImageUrl,
                                  durationSeconds: song.durationSeconds,
                                  audioUrl: song.audioUrl,
                                  isExplicit: song.isExplicit,
                                });
                              }}
                              className="font-mono text-[9px] uppercase tracking-wider text-ink-soft hover:text-ink transition-colors px-2 py-1 border border-line hover:border-ink cursor-pointer bg-canvas"
                              title="Add to queue"
                            >
                              + Queue
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ARTISTS RESULTS */}
              {results.artists.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3 border-b border-line pb-1.5">
                    <h4 className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">
                      Artists ({results.artists.length})
                    </h4>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {results.artists.map((artist) => (
                      <Link
                        key={artist.id}
                        to="/artists/$idOrSlug"
                        params={{ idOrSlug: artist.slug }}
                        onClick={onClose}
                        className="border border-line bg-panel p-3 shadow-2xs hover:border-ink transition-all group flex items-center gap-3"
                      >
                        <div className="w-11 h-11 rounded-full bg-stone/20 border border-line shrink-0 overflow-hidden">
                          {artist.avatarUrl ? (
                            <img
                              src={artist.avatarUrl}
                              alt={artist.stageName}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center font-serif italic text-sm text-ink">
                              {artist.stageName[0]}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="font-serif italic text-sm font-semibold text-ink truncate group-hover:text-blue transition-colors">
                            {artist.stageName}
                          </h4>
                          <span className="font-mono text-[9px] text-ink-soft block">
                            {artist.monthlyListeners.toLocaleString()} listeners
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* ALBUMS RESULTS */}
              {results.albums.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3 border-b border-line pb-1.5">
                    <h4 className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">
                      Albums ({results.albums.length})
                    </h4>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {results.albums.map((album) => (
                      <Link
                        key={album.id}
                        to="/albums/$idOrSlug"
                        params={{ idOrSlug: album.slug }}
                        onClick={onClose}
                        className="border border-line bg-panel p-3 shadow-2xs hover:border-ink transition-all group flex items-center gap-3"
                      >
                        <div className="w-12 h-12 bg-stone/20 border border-line shrink-0 overflow-hidden">
                          {album.coverImageUrl ? (
                            <img
                              src={album.coverImageUrl}
                              alt={album.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center font-serif italic text-xs text-ink-soft">
                              💿
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="font-serif italic text-sm font-semibold text-ink truncate group-hover:text-blue transition-colors">
                            {album.title}
                          </h4>
                          <span className="font-sans text-xs text-ink-soft truncate block">
                            {album.artistName}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* PLAYLISTS RESULTS */}
              {results.playlists.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3 border-b border-line pb-1.5">
                    <h4 className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">
                      Playlists ({results.playlists.length})
                    </h4>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {results.playlists.map((playlist) => (
                      <Link
                        key={playlist.id}
                        to="/playlists/$id"
                        params={{ id: playlist.id }}
                        onClick={onClose}
                        className="border border-line bg-panel p-3 shadow-2xs hover:border-ink transition-all group flex items-center gap-3"
                      >
                        <div className="w-12 h-12 bg-stone/20 border border-line shrink-0 overflow-hidden">
                          {playlist.coverImageUrl ? (
                            <img
                              src={playlist.coverImageUrl}
                              alt={playlist.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center font-serif italic text-xs text-ink-soft">
                              ♫
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="font-serif italic text-sm font-semibold text-ink truncate group-hover:text-blue transition-colors">
                            {playlist.title}
                          </h4>
                          <span className="font-mono text-[9px] text-ink-soft block truncate">
                            By {playlist.ownerName} • {playlist.tracksCount} tracks
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* COMMUNITY USERS RESULTS */}
              {results.users.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3 border-b border-line pb-1.5">
                    <h4 className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">
                      Community Members ({results.users.length})
                    </h4>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {results.users.map((user) => (
                      <Link
                        key={user.id}
                        to="/users/$id"
                        params={{ id: user.id }}
                        onClick={onClose}
                        className="border border-line bg-panel p-3 shadow-2xs hover:border-ink transition-all group flex items-center gap-3"
                      >
                        <div className="w-10 h-10 rounded-full bg-stone/20 border border-line shrink-0 overflow-hidden flex items-center justify-center font-mono text-xs font-semibold text-ink">
                          {user.avatarUrl ? (
                            <img
                              src={user.avatarUrl}
                              alt={user.displayName}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                          ) : (
                            user.displayName[0]?.toUpperCase() || "U"
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            <h4 className="font-semibold text-xs text-ink truncate group-hover:text-blue transition-colors">
                              {user.displayName}
                            </h4>
                            {user.isPrivateAccount && (
                              <LockIconSVG className="w-2.5 h-2.5 text-ink-soft shrink-0" />
                            )}
                          </div>
                          <span className="font-mono text-[9px] uppercase tracking-wider text-ink-soft block">
                            {user.role}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer info strip */}
        <div className="px-4 sm:px-6 py-2.5 border-t border-line bg-canvas/90 flex items-center justify-between font-mono text-[9px] uppercase tracking-wider text-ink-soft/70">
          <span>Search the entire Groovy catalog & community</span>
          <div className="flex items-center gap-2">
            <span>Navigation:</span>
            <kbd className="px-1.5 py-0.5 border border-line bg-panel rounded">ESC</kbd>
            <span>Close</span>
          </div>
        </div>
      </div>
    </div>
  );
}
