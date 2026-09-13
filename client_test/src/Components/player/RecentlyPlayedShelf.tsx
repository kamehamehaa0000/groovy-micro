import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { playerApi, type RecentHistoryItem } from "../../lib/player.api";
import { usePlayerStore } from "../../stores/player.store";
import { useAuthStore } from "../../stores/auth.store";
import type { PlayerTrack } from "../../types/player";

function formatRelativeTime(isoDate: string): string {
  try {
    const diff = Date.now() - new Date(isoDate).getTime();
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return "Just now";
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days}d ago`;
    return new Date(isoDate).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

interface RecentlyPlayedShelfProps {
  title?: string;
  subtitle?: string;
  limit?: number;
  className?: string;
}

export function RecentlyPlayedShelf({
  title = "Recently Played",
  subtitle = "Past Listening Sessions",
  limit = 6,
  className = "",
}: RecentlyPlayedShelfProps) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const playbackStatus = usePlayerStore((s) => s.playbackStatus);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const togglePlay = usePlayerStore((s) => s.togglePlay);

  const [history, setHistory] = useState<RecentHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;

    let isMounted = true;
    setIsLoading(true);

    playerApi
      .getRecentHistory()
      .then((res) => {
        if (!isMounted) return;
        setHistory(res.history || []);
      })
      .catch((err) => {
        console.warn("[RecentlyPlayedShelf] Failed to load history:", err);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated]);

  if (!isAuthenticated || (!isLoading && history.length === 0)) {
    return null;
  }

  const handlePlaySong = (item: RecentHistoryItem, allItems: RecentHistoryItem[]) => {
    const song = item.song;
    const isCurrent = currentTrack?.id === song.id;

    if (isCurrent) {
      togglePlay();
      return;
    }

    const playerTrack: PlayerTrack = {
      id: song.id,
      title: song.title,
      artistId: song.artistId,
      artistName: song.artistName,
      artistSlug: song.artistSlug,
      albumId: song.albumId || undefined,
      albumTitle: song.albumTitle || undefined,
      durationSeconds: song.durationSeconds,
      coverImageUrl: song.coverImageUrl || undefined,
      audioUrl: song.audioUrl || undefined,
      hlsManifestUrl: song.hlsManifestUrl || undefined,
      rawAudioKey: song.rawAudioKey || undefined,
    };

    const contextQueue: PlayerTrack[] = allItems.map((h) => ({
      id: h.song.id,
      title: h.song.title,
      artistId: h.song.artistId,
      artistName: h.song.artistName,
      artistSlug: h.song.artistSlug,
      albumId: h.song.albumId || undefined,
      albumTitle: h.song.albumTitle || undefined,
      durationSeconds: h.song.durationSeconds,
      coverImageUrl: h.song.coverImageUrl || undefined,
      audioUrl: h.song.audioUrl || undefined,
      hlsManifestUrl: h.song.hlsManifestUrl || undefined,
      rawAudioKey: h.song.rawAudioKey || undefined,
    }));

    const trackIndex = allItems.findIndex((h) => h.historyId === item.historyId);
    playTrack(
      playerTrack,
      contextQueue,
      trackIndex >= 0 ? trackIndex : 0,
      "history:recent",
      "Recently Played"
    );
  };

  const displayedItems = history.slice(0, limit);

  return (
    <section className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex justify-between items-baseline border-b border-line pb-3">
        <div className="flex items-center gap-3">
          <h2 className="font-serif italic font-medium text-xl text-ink">{title}</h2>
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] px-2 py-0.5 border border-line bg-canvas-deep text-ink-soft">
            {subtitle}
          </span>
        </div>
        <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-soft">
          {history.length} {history.length === 1 ? "track" : "tracks"}
        </span>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="border border-line bg-panel p-3 animate-pulse space-y-2.5">
              <div className="aspect-square bg-canvas-deep border border-line" />
              <div className="h-3 bg-stone/20 rounded-xs w-3/4" />
              <div className="h-2.5 bg-stone/10 rounded-xs w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
          {displayedItems.map((item) => {
            const isThisTrack = currentTrack?.id === item.song.id;
            const isPlayingThis = isThisTrack && playbackStatus === "playing";

            return (
              <div
                key={item.historyId}
                className={`group relative border transition-all duration-200 p-3 flex flex-col justify-between ${
                  isThisTrack
                    ? "border-blue bg-blue/5 shadow-xs"
                    : "border-line bg-panel hover:border-ink hover:shadow-xs"
                }`}
              >
                {/* Artwork with Quick Play Hover Button */}
                <div className="aspect-square bg-canvas-deep border border-line relative overflow-hidden mb-2.5">
                  {item.song.coverImageUrl ? (
                    <img
                      src={item.song.coverImageUrl}
                      alt={item.song.title}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-serif italic text-ink-soft text-2xl">
                      ♪
                    </div>
                  )}

                  {/* Play/Pause Overlay */}
                  <button
                    type="button"
                    onClick={() => handlePlaySong(item, displayedItems)}
                    aria-label={isPlayingThis ? "Pause" : "Play"}
                    className={`absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center transition-opacity cursor-pointer ${
                      isPlayingThis ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-ink text-canvas flex items-center justify-center shadow-lg transition-transform hover:scale-110 active:scale-95">
                      {isPlayingThis ? (
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-canvas">
                          <rect x="6" y="4" width="4" height="16" rx="1" />
                          <rect x="14" y="4" width="4" height="16" rx="1" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-canvas ml-0.5">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      )}
                    </div>
                  </button>

                  {/* Live Pulse Indicator if currently active */}
                  {isPlayingThis && (
                    <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/70 px-1.5 py-0.5 rounded-full backdrop-blur-xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue animate-ping" />
                      <span className="w-1.5 h-1.5 rounded-full bg-blue" />
                    </div>
                  )}
                </div>

                {/* Metadata */}
                <div className="flex flex-col min-w-0 flex-1">
                  <span
                    className={`text-xs font-semibold truncate tracking-tight transition-colors ${
                      isThisTrack ? "text-blue" : "text-ink group-hover:text-blue"
                    }`}
                    title={item.song.title}
                  >
                    {item.song.title}
                  </span>

                  {item.song.artistSlug ? (
                    <Link
                      to="/artists/$idOrSlug"
                      params={{ idOrSlug: item.song.artistSlug }}
                      className="text-[11px] text-ink-soft hover:text-ink truncate transition-colors mt-0.5 block"
                    >
                      {item.song.artistName}
                    </Link>
                  ) : (
                    <span className="text-[11px] text-ink-soft truncate mt-0.5">
                      {item.song.artistName}
                    </span>
                  )}

                  <div className="flex items-center justify-between font-mono text-[9px] text-ink-soft/70 border-t border-line-soft pt-1.5 mt-2">
                    <span>{formatRelativeTime(item.playedAt)}</span>
                    {item.song.durationSeconds > 0 && (
                      <span>
                        {Math.floor(item.song.durationSeconds / 60)}:
                        {String(Math.floor(item.song.durationSeconds % 60)).padStart(2, "0")}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
