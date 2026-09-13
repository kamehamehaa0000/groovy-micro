import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { useAuthStore } from "../stores/auth.store";
import { usePlayerStore } from "../stores/player.store";
import { socialApi, type FeedItem, type SocialFeedResponse } from "../lib/social.api";
import type { PlayerTrack } from "../types/player";

export const Route = createFileRoute("/feed")({
  component: FeedComponent,
});

function formatRelativeTime(dateStr: string): string {
  const timestamp = new Date(dateStr).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - timestamp) / 1000));

  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function FeedComponent() {
  const { isAuthenticated } = useAuthStore();
  const navigate = useNavigate();

  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const playbackStatus = usePlayerStore((s) => s.playbackStatus);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const addToQueue = usePlayerStore((s) => s.addToQueue);

  const [filter, setFilter] = useState<"all" | "releases" | "playlists" | "friends">("all");
  const [items, setItems] = useState<FeedItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFeed = useCallback(
    async (isInitial = true, cursorToUse?: string) => {
      if (!isAuthenticated) return;
      if (isInitial) {
        setIsLoading(true);
        setError(null);
      } else {
        setIsLoadingMore(true);
      }

      try {
        const res: SocialFeedResponse = await socialApi.getFeed({
          filter,
          cursor: cursorToUse,
          limit: 20,
        });

        if (isInitial) {
          setItems(res.items);
        } else {
          setItems((prev) => [...prev, ...res.items]);
        }
        setNextCursor(res.nextCursor);
        setHasMore(res.hasMore);
      } catch (err: any) {
        setError(err.message || "Failed to load social feed");
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [isAuthenticated, filter]
  );

  useEffect(() => {
    fetchFeed(true);
  }, [fetchFeed]);

  const handlePlaySong = (item: FeedItem) => {
    if (item.target.type !== "song" || !item.target.audioUrl) {
      if (item.target.type === "album" && item.target.slug) {
        navigate({ to: "/albums/$idOrSlug", params: { idOrSlug: item.target.slug } });
      } else if (item.target.type === "playlist") {
        navigate({ to: "/playlists/$id", params: { id: item.target.id } });
      }
      return;
    }

    if (currentTrack?.id === item.target.id) {
      togglePlay();
      return;
    }

    const playerTrack: PlayerTrack = {
      id: item.target.id,
      title: item.target.title,
      artistId: item.actor.id,
      artistName: item.actor.name,
      artistSlug: item.actor.slug || "",
      albumId: "",
      albumTitle: "",
      coverImageUrl: item.target.coverImageUrl,
      durationSeconds: item.target.durationSeconds || 180,
      audioUrl: item.target.audioUrl,
      isExplicit: item.target.isExplicit || false,
    };

    playTrack(playerTrack, [playerTrack], 0, `feed:${item.id}`, "Social Feed");
  };

  const handleQueueTrack = (item: FeedItem) => {
    if (item.target.type !== "song" || !item.target.audioUrl) return;

    const playerTrack: PlayerTrack = {
      id: item.target.id,
      title: item.target.title,
      artistId: item.actor.id,
      artistName: item.actor.name,
      artistSlug: item.actor.slug || "",
      albumId: "",
      albumTitle: "",
      coverImageUrl: item.target.coverImageUrl,
      durationSeconds: item.target.durationSeconds || 180,
      audioUrl: item.target.audioUrl,
      isExplicit: item.target.isExplicit || false,
    };

    addToQueue(playerTrack);
  };

  if (!isAuthenticated) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="font-serif italic text-3xl text-ink mb-3">Sign in to your Feed</div>
        <p className="font-sans text-sm text-ink-soft mb-6 max-w-md mx-auto">
          Follow your favorite artists and friends to see their latest releases, playlists, and listening activity.
        </p>
        <Link
          to="/login"
          className="inline-block bg-ink text-canvas font-mono text-xs uppercase tracking-[0.14em] px-6 py-3 border border-ink hover:bg-canvas hover:text-ink transition-colors"
        >
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 select-none">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between border-b border-line pb-6 mb-6 gap-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-blue-deep dark:text-blue-400 mb-1.5">
            Community &nbsp;·&nbsp; Activity Feed
          </div>
          <h1 className="font-serif text-3xl font-normal text-ink">
            Social Stream
          </h1>
          <p className="font-sans text-xs text-ink-soft mt-1">
            Chronological drops from artists you follow and music shared by friends.
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-canvas-deep border border-line overflow-x-auto">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`font-mono text-[10.5px] uppercase tracking-[0.12em] px-3 py-1.5 transition-colors cursor-pointer shrink-0 ${
              filter === "all"
                ? "bg-canvas text-ink font-medium shadow-2xs border border-line"
                : "text-ink-soft hover:text-ink"
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setFilter("releases")}
            className={`font-mono text-[10.5px] uppercase tracking-[0.12em] px-3 py-1.5 transition-colors cursor-pointer shrink-0 ${
              filter === "releases"
                ? "bg-canvas text-ink font-medium shadow-2xs border border-line"
                : "text-ink-soft hover:text-ink"
            }`}
          >
            Releases
          </button>
          <button
            type="button"
            onClick={() => setFilter("playlists")}
            className={`font-mono text-[10.5px] uppercase tracking-[0.12em] px-3 py-1.5 transition-colors cursor-pointer shrink-0 ${
              filter === "playlists"
                ? "bg-canvas text-ink font-medium shadow-2xs border border-line"
                : "text-ink-soft hover:text-ink"
            }`}
          >
            Playlists
          </button>
          <button
            type="button"
            onClick={() => setFilter("friends")}
            className={`font-mono text-[10.5px] uppercase tracking-[0.12em] px-3 py-1.5 transition-colors cursor-pointer shrink-0 ${
              filter === "friends"
                ? "bg-canvas text-ink font-medium shadow-2xs border border-line"
                : "text-ink-soft hover:text-ink"
            }`}
          >
            Friends
          </button>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-6 h-6 border-2 border-line border-t-ink rounded-full animate-spin" />
          <div className="font-mono text-xs uppercase tracking-widest text-ink-soft">
            Tuning into the stream...
          </div>
        </div>
      )}

      {/* Error State */}
      {error && !isLoading && (
        <div className="p-4 border border-red-800/30 bg-red-900/10 text-red-600 dark:text-red-400 text-xs text-center mb-6">
          {error}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && items.length === 0 && (
        <div className="border border-dashed border-line p-12 text-center my-6">
          <div className="font-serif italic text-2xl text-ink mb-2">No activity in this view yet</div>
          <p className="font-sans text-xs text-ink-soft max-w-md mx-auto mb-6">
            Follow more artists in the catalog or connect with listeners in the directory to personalize your stream with fresh music drops.
          </p>
          <div className="flex justify-center gap-4">
            <Link
              to="/"
              className="bg-ink text-canvas font-mono text-[11px] uppercase tracking-wider px-4 py-2.5 border border-ink hover:bg-canvas hover:text-ink transition-colors"
            >
              Explore Catalog
            </Link>
            <Link
              to="/activity"
              className="bg-panel text-ink font-mono text-[11px] uppercase tracking-wider px-4 py-2.5 border border-line hover:bg-canvas-deep transition-colors"
            >
              Find Friends
            </Link>
          </div>
        </div>
      )}

      {/* Feed Stream */}
      {!isLoading && items.length > 0 && (
        <div className="flex flex-col gap-4">
          {items.map((item) => {
            const isTrack = item.target.type === "song";
            const isPlaying =
              isTrack &&
              currentTrack?.id === item.target.id &&
              playbackStatus === "playing";

            return (
              <div
                key={item.id}
                className="border border-line bg-panel p-4 sm:p-5 shadow-2xs hover:border-ink/30 transition-all"
              >
                {/* Event Actor Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    {/* Actor Avatar */}
                    {item.actor.isArtist && item.actor.slug ? (
                      <Link to="/artists/$idOrSlug" params={{ idOrSlug: item.actor.slug }}>
                        {item.actor.avatarUrl ? (
                          <img
                            src={item.actor.avatarUrl}
                            alt={item.actor.name}
                            className="w-8 h-8 rounded-full object-cover border border-line hover:border-ink transition-colors"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-canvas-deep border border-line flex items-center justify-center font-mono text-xs font-semibold text-ink-soft">
                            {item.actor.name[0]?.toUpperCase() || "?"}
                          </div>
                        )}
                      </Link>
                    ) : (
                      <Link to="/users/$id" params={{ id: item.actor.id }}>
                        {item.actor.avatarUrl ? (
                          <img
                            src={item.actor.avatarUrl}
                            alt={item.actor.name}
                            className="w-8 h-8 rounded-full object-cover border border-line hover:border-ink transition-colors"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-canvas-deep border border-line flex items-center justify-center font-mono text-xs font-semibold text-ink-soft">
                            {item.actor.name[0]?.toUpperCase() || "?"}
                          </div>
                        )}
                      </Link>
                    )}

                    {/* Actor Title & Action */}
                    <div className="font-sans text-xs">
                      {item.actor.isArtist && item.actor.slug ? (
                        <Link
                          to="/artists/$idOrSlug"
                          params={{ idOrSlug: item.actor.slug }}
                          className="font-medium text-ink hover:text-blue transition-colors"
                        >
                          {item.actor.name}
                        </Link>
                      ) : (
                        <Link
                          to="/users/$id"
                          params={{ id: item.actor.id }}
                          className="font-medium text-ink hover:text-blue transition-colors"
                        >
                          {item.actor.name}
                        </Link>
                      )}


                      <span className="text-ink-soft ml-1.5">
                        {item.type === "NEW_RELEASE" && "dropped a new release"}
                        {item.type === "PLAYLIST_CREATED" && "created a public playlist"}
                        {item.type === "PLAYLIST_SAVED" && "saved a playlist"}
                        {item.type === "SONG_LIKED" && "liked a track"}
                      </span>
                    </div>
                  </div>

                  {/* Relative Timestamp */}
                  <span className="font-mono text-[10px] text-ink-soft shrink-0">
                    {formatRelativeTime(item.timestamp)}
                  </span>
                </div>

                {/* Target Content Card */}
                <div className="flex items-center gap-4 p-3 bg-canvas border border-line/60 rounded-xs">
                  {/* Artwork / Thumbnail */}
                  <div className="relative w-16 h-16 sm:w-20 sm:h-20 shrink-0 bg-canvas-deep border border-line overflow-hidden group">
                    {item.target.coverImageUrl ? (
                      <img
                        src={item.target.coverImageUrl}
                        alt={item.target.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-serif italic text-ink-soft text-xl">
                        ♪
                      </div>
                    )}

                    {/* Hover Play Button Overlay */}
                    <button
                      type="button"
                      onClick={() => handlePlaySong(item)}
                      className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white cursor-pointer"
                      title={isPlaying ? "Pause" : "Play"}
                    >
                      {isPlaying ? (
                        <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                        </svg>
                      ) : (
                        <svg className="w-6 h-6 fill-current translate-x-0.5" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      )}
                    </button>
                  </div>

                  {/* Metadata */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 bg-canvas-deep border border-line text-ink-soft">
                        {item.target.type}
                      </span>
                      {item.target.isExplicit && (
                        <span className="font-mono text-[8.5px] uppercase font-bold px-1 py-0.5 bg-ink text-canvas">
                          E
                        </span>
                      )}
                    </div>

                    <div className="font-serif text-base text-ink truncate mt-1">
                      {item.target.type === "album" && item.target.slug ? (
                        <Link
                          to="/albums/$idOrSlug"
                          params={{ idOrSlug: item.target.slug }}
                          className="hover:underline"
                        >
                          {item.target.title}
                        </Link>
                      ) : item.target.type === "playlist" ? (
                        <Link
                          to="/playlists/$id"
                          params={{ id: item.target.id }}
                          className="hover:underline"
                        >
                          {item.target.title}
                        </Link>
                      ) : (
                        item.target.title
                      )}
                    </div>

                    {item.target.subtitle && (
                      <div className="font-sans text-xs text-ink-soft truncate mt-0.5">
                        {item.target.subtitle}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {isTrack && item.target.audioUrl && (
                      <button
                        type="button"
                        onClick={() => handleQueueTrack(item)}
                        className="p-2 text-ink-soft hover:text-ink border border-line bg-canvas hover:bg-canvas-deep transition-colors cursor-pointer"
                        title="Add to queue"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                    )}

                    {item.target.type === "album" && item.target.slug && (
                      <Link
                        to="/albums/$idOrSlug"
                        params={{ idOrSlug: item.target.slug }}
                        className="font-mono text-[10px] uppercase tracking-wider px-3 py-2 border border-line hover:bg-canvas-deep transition-colors"
                      >
                        View
                      </Link>
                    )}

                    {item.target.type === "playlist" && (
                      <Link
                        to="/playlists/$id"
                        params={{ id: item.target.id }}
                        className="font-mono text-[10px] uppercase tracking-wider px-3 py-2 border border-line hover:bg-canvas-deep transition-colors"
                      >
                        Listen
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Load More Button */}
          {hasMore && (
            <div className="text-center mt-6">
              <button
                type="button"
                onClick={() => fetchFeed(false, nextCursor || undefined)}
                disabled={isLoadingMore}
                className="bg-panel border border-line hover:bg-canvas-deep text-ink font-mono text-[11px] uppercase tracking-wider px-6 py-3 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isLoadingMore ? "Loading more..." : "Load Older Activity"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
