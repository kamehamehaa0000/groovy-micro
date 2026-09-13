import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { usersApi, type PublicUserProfile, type UserLibraryResponse } from "../lib/users.api";
import { socialApi, type RelationshipStatus } from "../lib/social.api";
import { useAuthStore } from "../stores/auth.store";
import { usePlayerStore } from "../stores/player.store";
import { useAuthModalStore } from "../stores/auth-modal.store";
import type { PlayerTrack } from "../types/player";
import {
  PlayIconSVG,
  PauseIconSVG,
  LockIconSVG,
} from "../components/icons";

export const Route = createFileRoute("/users/$id")({
  component: UserProfileComponent,
});

function formatDuration(totalSeconds: number) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatDate(dateStr?: string | Date) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

function UserProfileComponent() {
  const { id } = Route.useParams();
  const { user: currentUser, isAuthenticated } = useAuthStore();
  const { openAuthModal } = useAuthModalStore();
  const { currentTrack, playbackStatus, playTrack, togglePlay, addToQueue } = usePlayerStore();

  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [relationship, setRelationship] = useState<RelationshipStatus>("NONE");
  const [library, setLibrary] = useState<UserLibraryResponse | null>(null);
  const [libraryError, setLibraryError] = useState<{
    isForbidden: boolean;
    privacy: "PRIVATE" | "FOLLOWERS_ONLY" | "PUBLIC";
    message: string;
  } | null>(null);

  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(true);
  const [isActing, setIsActing] = useState(false);
  const [activeTab, setActiveTab] = useState<"playlists" | "albums" | "liked">("playlists");

  const isOwnProfile = currentUser?.id === id || relationship === "SELF";

  // Fetch Profile & Relationship
  const fetchProfile = async () => {
    setIsLoadingProfile(true);
    try {
      const res = await usersApi.getUserProfile(id);
      setProfile(res.user);
      setRelationship(res.relationship);
    } catch (err: any) {
      console.warn("[UserProfile] Failed to load user profile:", err);
      setProfile(null);
    } finally {
      setIsLoadingProfile(false);
    }
  };

  // Fetch Shared Library
  const fetchLibrary = async () => {
    setIsLoadingLibrary(true);
    setLibraryError(null);
    try {
      const res = await usersApi.getUserLibrary(id);
      setLibrary(res);
    } catch (err: any) {
      if (err.statusCode === 403) {
        setLibraryError({
          isForbidden: true,
          privacy: err.libraryPrivacy || "PRIVATE",
          message: err.message || "This library is private.",
        });
      } else {
        console.warn("[UserProfile] Failed to load user library:", err);
      }
      setLibrary(null);
    } finally {
      setIsLoadingLibrary(false);
    }
  };

  useEffect(() => {
    fetchProfile();
    fetchLibrary();
  }, [id, isAuthenticated]);

  // Social Action Handlers
  const handleFollowAction = async () => {
    if (!isAuthenticated) {
      openAuthModal();
      return;
    }
    setIsActing(true);
    try {
      if (relationship === "FOLLOWING" || relationship === "FRIENDS" || relationship === "PENDING_SENT") {
        // Unfollow or Cancel Request
        await socialApi.unfollowUser(id);
        setRelationship("NONE");
        setProfile((prev) => prev ? { ...prev, followersCount: Math.max(0, prev.followersCount - 1) } : prev);
        // Refresh library to reflect new privacy gating
        fetchLibrary();
      } else {
        // Follow target
        const res = await socialApi.followUser(id);
        if (res.status === "PENDING") {
          setRelationship("PENDING_SENT");
        } else {
          setRelationship(res.isMutualFriend ? "FRIENDS" : "FOLLOWING");
          setProfile((prev) => prev ? { ...prev, followersCount: prev.followersCount + 1 } : prev);
          // Unlock library immediately if it was followers-only!
          fetchLibrary();
        }
      }
    } catch (err: any) {
      console.error("[UserProfile] Follow action failed:", err);
    } finally {
      setIsActing(false);
    }
  };

  const handleAcceptRequest = async () => {
    setIsActing(true);
    try {
      const res = await socialApi.acceptRequest(id);
      setRelationship(res.isMutualFriend ? "FRIENDS" : "FOLLOWING");
      fetchLibrary();
    } catch (err) {
      console.error("[UserProfile] Accept request failed:", err);
    } finally {
      setIsActing(false);
    }
  };

  const handleRejectRequest = async () => {
    setIsActing(true);
    try {
      await socialApi.rejectRequest(id);
      setRelationship("NONE");
    } catch (err) {
      console.error("[UserProfile] Reject request failed:", err);
    } finally {
      setIsActing(false);
    }
  };

  // Play a track from Liked Songs
  const handlePlayLikedSong = (item: any, index: number) => {
    if (!library?.likedSongs?.items) return;
    const isThisPlaying = currentTrack?.id === item.id;
    if (isThisPlaying) {
      togglePlay();
      return;
    }

    const playerTrackList: PlayerTrack[] = library.likedSongs.items.map((t) => ({
      id: t.id,
      title: t.title,
      artistId: t.artistId,
      artistName: t.artistName,
      artistSlug: t.artistSlug,
      albumId: "",
      albumTitle: "",
      coverImageUrl: t.coverImageUrl,
      durationSeconds: t.durationSeconds,
      audioUrl: t.audioUrl,
      isExplicit: t.isExplicit,
    }));

    playTrack(
      playerTrackList[index],
      playerTrackList,
      index,
      `user-library-liked:${id}`,
      `${profile?.displayName}'s Liked Tracks`
    );
  };

  if (isLoadingProfile) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="animate-pulse space-y-6">
          <div className="flex items-center gap-6 pb-8 border-b border-line">
            <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-stone/20" />
            <div className="space-y-3 flex-1">
              <div className="h-4 bg-stone/20 rounded w-24" />
              <div className="h-8 bg-stone/20 rounded w-64" />
              <div className="h-4 bg-stone/20 rounded w-48" />
            </div>
          </div>
          <div className="h-10 bg-stone/20 rounded w-72" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-48 bg-stone/20 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <div className="font-serif italic text-3xl text-ink mb-3">User Not Found</div>
        <p className="font-sans text-sm text-ink-soft mb-6">
          The listener or artist profile you are looking for does not exist or has been deactivated.
        </p>
        <Link
          to="/"
          className="inline-block bg-ink text-canvas font-mono text-xs uppercase tracking-wider px-6 py-3 border border-ink hover:bg-canvas hover:text-ink transition-colors"
        >
          Return Home
        </Link>
      </div>
    );
  }

  const createdCount = library?.createdPlaylists?.length || 0;
  const savedPlaylistsCount = library?.savedPlaylists?.length || 0;
  const totalPlaylistsCount = createdCount + savedPlaylistsCount;
  const savedAlbumsCount = (library?.savedAlbums?.length || 0) + (library?.presavedReleases?.length || 0);
  const likedSongsCount = library?.likedSongs?.totalCount || 0;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 select-none">
      {/* Back breadcrumb */}
      <div className="mb-6">
        <Link
          to="/activity"
          className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-ink-soft hover:text-ink transition-colors"
        >
          <span>← Back to Community</span>
        </Link>
      </div>

      {/* User Hero Header */}
      <div className="border border-line bg-panel p-6 sm:p-8 shadow-xs mb-8">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 sm:gap-8">
          {/* Avatar */}
          <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-canvas-deep border-2 border-line overflow-hidden shrink-0 flex items-center justify-center font-mono text-3xl sm:text-4xl font-semibold text-ink-soft shadow-inner">
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt={profile.displayName}
                className="w-full h-full object-cover"
              />
            ) : (
              profile.displayName[0]?.toUpperCase() || "U"
            )}
          </div>

          {/* User Bio & Actions */}
          <div className="flex-1 text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-2">
              <span className="bg-canvas border border-line text-ink-soft font-mono text-[9.5px] uppercase tracking-widest px-2.5 py-0.5 rounded-full">
                {profile.role}
              </span>
              {profile.isPrivateAccount && (
                <span className="flex items-center gap-1 bg-stone/20 text-ink-soft font-mono text-[9.5px] uppercase tracking-wider px-2.5 py-0.5 rounded-full">
                  <LockIconSVG className="w-2.5 h-2.5" />
                  Private Account
                </span>
              )}
              {relationship === "FRIENDS" && (
                <span className="flex items-center gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-mono text-[9.5px] uppercase tracking-wider px-2.5 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Mutual Friends
                </span>
              )}
            </div>

            <h1 className="font-serif italic text-3xl sm:text-4xl text-ink font-semibold mb-2">
              {profile.displayName}
            </h1>

            <p className="font-mono text-[11px] text-ink-soft mb-6">
              Member since {formatDate(profile.createdAt)}
            </p>

            {/* Metrics Strip */}
            <div className="flex items-center justify-center sm:justify-start gap-6 sm:gap-8 border-t border-line/60 pt-4">
              <div>
                <span className="font-mono text-base sm:text-lg font-bold text-ink block">
                  {profile.followersCount}
                </span>
                <span className="font-mono text-[9.5px] uppercase tracking-wider text-ink-soft">
                  Followers
                </span>
              </div>
              <div className="h-6 w-px bg-line" />
              <div>
                <span className="font-mono text-base sm:text-lg font-bold text-ink block">
                  {profile.followingCount}
                </span>
                <span className="font-mono text-[9.5px] uppercase tracking-wider text-ink-soft">
                  Following
                </span>
              </div>
              <div className="h-6 w-px bg-line" />
              <div>
                <span className="font-mono text-base sm:text-lg font-bold text-ink block">
                  {profile.publicPlaylistsCount}
                </span>
                <span className="font-mono text-[9.5px] uppercase tracking-wider text-ink-soft">
                  Playlists
                </span>
              </div>
            </div>
          </div>

          {/* Social Relationship Action Button */}
          <div className="shrink-0 flex items-center gap-3">
            {isOwnProfile ? (
              <Link
                to="/profile"
                className="bg-canvas border border-line text-ink hover:border-ink font-mono text-xs uppercase tracking-wider px-5 py-2.5 transition-colors shadow-2xs"
              >
                Edit Profile
              </Link>
            ) : relationship === "PENDING_RECEIVED" ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isActing}
                  onClick={handleAcceptRequest}
                  className="bg-ink text-canvas hover:bg-ink/80 font-mono text-xs uppercase tracking-wider px-4 py-2.5 transition-colors cursor-pointer"
                >
                  Accept
                </button>
                <button
                  type="button"
                  disabled={isActing}
                  onClick={handleRejectRequest}
                  className="bg-canvas border border-line text-ink-soft hover:text-ink font-mono text-xs uppercase tracking-wider px-4 py-2.5 transition-colors cursor-pointer"
                >
                  Decline
                </button>
              </div>
            ) : relationship === "PENDING_SENT" ? (
              <button
                type="button"
                disabled={isActing}
                onClick={handleFollowAction}
                className="group bg-canvas-deep border border-line text-ink-soft font-mono text-xs uppercase tracking-wider px-5 py-2.5 transition-colors cursor-pointer hover:border-red-500/40 hover:text-red-500"
              >
                <span className="group-hover:hidden">Requested</span>
                <span className="hidden group-hover:inline">Cancel Request</span>
              </button>
            ) : relationship === "FOLLOWING" || relationship === "FRIENDS" ? (
              <button
                type="button"
                disabled={isActing}
                onClick={handleFollowAction}
                className="group bg-panel border border-line text-ink font-mono text-xs uppercase tracking-wider px-5 py-2.5 transition-all cursor-pointer hover:border-red-500/40 hover:text-red-500"
              >
                <span className="group-hover:hidden">
                  {relationship === "FRIENDS" ? "Friends" : "Following"}
                </span>
                <span className="hidden group-hover:inline">Unfollow</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={isActing}
                onClick={handleFollowAction}
                className="bg-ink text-canvas hover:bg-ink/80 font-mono text-xs uppercase tracking-wider px-6 py-2.5 transition-colors cursor-pointer shadow-xs"
              >
                {profile.isPrivateAccount ? "Request Follow" : "Follow"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Shared Library Section */}
      <div>
        {/* If Library is Forbidden */}
        {libraryError?.isForbidden ? (
          <div className="border border-line bg-panel p-8 sm:p-12 text-center shadow-xs">
            <div className="w-12 h-12 rounded-full bg-stone/20 border border-line flex items-center justify-center mx-auto mb-4 text-ink-soft">
              <LockIconSVG className="w-6 h-6" />
            </div>
            <h3 className="font-serif italic text-2xl text-ink mb-2">
              {libraryError.privacy === "FOLLOWERS_ONLY"
                ? "Followers-Only Library"
                : "Private Library"}
            </h3>
            <p className="font-sans text-xs text-ink-soft max-w-md mx-auto mb-6 leading-relaxed">
              {libraryError.privacy === "FOLLOWERS_ONLY"
                ? `Follow ${profile.displayName} to unlock access to their shared playlists, saved albums, and liked tracks.`
                : `${profile.displayName} has chosen to keep their music library private.`}
            </p>

            {libraryError.privacy === "FOLLOWERS_ONLY" && (
              <div>
                {relationship === "NONE" ? (
                  <button
                    type="button"
                    disabled={isActing}
                    onClick={handleFollowAction}
                    className="bg-ink text-canvas font-mono text-xs uppercase tracking-wider px-6 py-3 border border-ink hover:bg-canvas hover:text-ink transition-colors cursor-pointer"
                  >
                    Follow to Unlock
                  </button>
                ) : relationship === "PENDING_SENT" ? (
                  <span className="font-mono text-xs uppercase tracking-wider text-ink-soft border border-line px-4 py-2 bg-canvas inline-block">
                    Follow Request Pending
                  </span>
                ) : null}
              </div>
            )}
          </div>
        ) : isLoadingLibrary ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 animate-pulse">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-48 bg-stone/20 rounded" />
            ))}
          </div>
        ) : library ? (
          <div>
            {/* Library Navigation Tabs */}
            <div className="flex items-center gap-2 border-b border-line pb-px mb-6 overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveTab("playlists")}
                className={`font-mono text-xs uppercase tracking-wider px-4 py-2.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === "playlists"
                    ? "border-ink text-ink font-semibold"
                    : "border-transparent text-ink-soft hover:text-ink"
                }`}
              >
                Playlists ({totalPlaylistsCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("albums")}
                className={`font-mono text-xs uppercase tracking-wider px-4 py-2.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === "albums"
                    ? "border-ink text-ink font-semibold"
                    : "border-transparent text-ink-soft hover:text-ink"
                }`}
              >
                Albums & Releases ({savedAlbumsCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("liked")}
                className={`font-mono text-xs uppercase tracking-wider px-4 py-2.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === "liked"
                    ? "border-ink text-ink font-semibold"
                    : "border-transparent text-ink-soft hover:text-ink"
                }`}
              >
                Liked Songs ({likedSongsCount})
              </button>
            </div>

            {/* TAB 1: PLAYLISTS */}
            {activeTab === "playlists" && (
              <div className="space-y-10">
                {/* Created Playlists */}
                <div>
                  <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft mb-4">
                    Created by {profile.displayName} ({createdCount})
                  </h3>

                  {createdCount === 0 ? (
                    <div className="border border-line bg-panel p-8 text-center text-xs text-ink-soft">
                      No public playlists created yet.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      {library.createdPlaylists.map((pl) => (
                        <Link
                          key={pl.id}
                          to="/playlists/$id"
                          params={{ id: pl.id }}
                          className="border border-line bg-panel p-3.5 shadow-2xs hover:border-ink transition-all group flex flex-col justify-between"
                        >
                          <div className="aspect-square w-full bg-stone/20 border border-line mb-3 overflow-hidden relative">
                            {pl.coverImageUrl ? (
                              <img
                                src={pl.coverImageUrl}
                                alt={pl.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center font-serif italic text-2xl text-ink-soft">
                                ♫
                              </div>
                            )}
                          </div>
                          <div>
                            <h4 className="font-serif italic text-sm font-semibold text-ink truncate mb-1">
                              {pl.title}
                            </h4>
                            <div className="flex items-center justify-between font-mono text-[9.5px] text-ink-soft">
                              <span>{pl.tracksCount} tracks</span>
                              <span>{pl.savesCount} saves</span>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                {/* Saved Playlists */}
                {savedPlaylistsCount > 0 && (
                  <div>
                    <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft mb-4">
                      Saved Playlists ({savedPlaylistsCount})
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      {library.savedPlaylists.map((pl) => (
                        <Link
                          key={pl.id}
                          to="/playlists/$id"
                          params={{ id: pl.id }}
                          className="border border-line bg-panel p-3.5 shadow-2xs hover:border-ink transition-all group flex flex-col justify-between"
                        >
                          <div className="aspect-square w-full bg-stone/20 border border-line mb-3 overflow-hidden relative">
                            {pl.coverImageUrl ? (
                              <img
                                src={pl.coverImageUrl}
                                alt={pl.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center font-serif italic text-2xl text-ink-soft">
                                ♫
                              </div>
                            )}
                          </div>
                          <div>
                            <h4 className="font-serif italic text-sm font-semibold text-ink truncate mb-1">
                              {pl.title}
                            </h4>
                            <div className="flex items-center justify-between font-mono text-[9.5px] text-ink-soft">
                              <span>By {pl.ownerName || "Curator"}</span>
                              <span>{pl.tracksCount} tracks</span>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: ALBUMS & RELEASES */}
            {activeTab === "albums" && (
              <div className="space-y-10">
                {/* Upcoming Pre-saved Releases */}
                {library.presavedReleases?.length > 0 && (
                  <div>
                    <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-blue-deep dark:text-blue-400 mb-4">
                      Pre-Saved Drops ({library.presavedReleases.length})
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      {library.presavedReleases.map((album) => (
                        <Link
                          key={album.id}
                          to="/albums/$idOrSlug"
                          params={{ idOrSlug: album.slug || album.id }}
                          className="border border-blue/30 bg-panel p-3.5 shadow-2xs hover:border-blue transition-all group"
                        >
                          <div className="aspect-square w-full bg-stone/20 border border-line mb-3 overflow-hidden relative">
                            {album.coverImageUrl ? (
                              <img
                                src={album.coverImageUrl}
                                alt={album.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center font-serif italic text-2xl text-ink-soft">
                                💿
                              </div>
                            )}
                            <div className="absolute top-2 right-2 bg-blue text-white font-mono text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded shadow-xs">
                              Pre-Saved
                            </div>
                          </div>
                          <h4 className="font-serif italic text-sm font-semibold text-ink truncate mb-1">
                            {album.title}
                          </h4>
                          <p className="font-sans text-xs text-ink-soft truncate mb-1">
                            {album.artistName}
                          </p>
                          <span className="font-mono text-[9px] text-ink-soft block">
                            Dropping {formatDate(album.releaseDate)}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {/* Saved Albums */}
                <div>
                  <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft mb-4">
                    Saved Albums ({library.savedAlbums?.length || 0})
                  </h3>

                  {!library.savedAlbums || library.savedAlbums.length === 0 ? (
                    <div className="border border-line bg-panel p-8 text-center text-xs text-ink-soft">
                      No saved albums found in library.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      {library.savedAlbums.map((album) => (
                        <Link
                          key={album.id}
                          to="/albums/$idOrSlug"
                          params={{ idOrSlug: album.slug || album.id }}
                          className="border border-line bg-panel p-3.5 shadow-2xs hover:border-ink transition-all group"
                        >
                          <div className="aspect-square w-full bg-stone/20 border border-line mb-3 overflow-hidden relative">
                            {album.coverImageUrl ? (
                              <img
                                src={album.coverImageUrl}
                                alt={album.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center font-serif italic text-2xl text-ink-soft">
                                💿
                              </div>
                            )}
                          </div>
                          <h4 className="font-serif italic text-sm font-semibold text-ink truncate mb-1">
                            {album.title}
                          </h4>
                          <p className="font-sans text-xs text-ink-soft truncate">
                            {album.artistName}
                          </p>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: LIKED SONGS */}
            {activeTab === "liked" && (
              <div>
                <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft mb-4">
                  Recent Liked Songs ({library.likedSongs?.items?.length || 0})
                </h3>

                {!library.likedSongs?.items || library.likedSongs.items.length === 0 ? (
                  <div className="border border-line bg-panel p-8 text-center text-xs text-ink-soft">
                    No public liked tracks in this library.
                  </div>
                ) : (
                  <div className="border border-line bg-panel shadow-xs divide-y divide-line">
                    {library.likedSongs.items.map((song, index) => {
                      const isPlaying =
                        currentTrack?.id === song.id &&
                        playbackStatus === "playing";

                      return (
                        <div
                          key={song.id}
                          className="flex items-center justify-between p-3.5 hover:bg-canvas-deep transition-colors group"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1 pr-4">
                            {/* Play Button / Track Index */}
                            <button
                              type="button"
                              onClick={() => handlePlayLikedSong(song, index)}
                              className="w-8 h-8 rounded-full border border-line flex items-center justify-center font-mono text-xs text-ink-soft hover:border-ink hover:text-ink transition-colors shrink-0 cursor-pointer bg-canvas"
                            >
                              {isPlaying ? (
                                <PauseIconSVG className="w-3.5 h-3.5" />
                              ) : (
                                <PlayIconSVG className="w-3.5 h-3.5 ml-0.5" />
                              )}
                            </button>

                            {/* Cover art thumbnail */}
                            <div className="w-10 h-10 bg-stone/20 border border-line shrink-0 overflow-hidden">
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

                            {/* Track Details */}
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
                                className="font-sans text-xs text-ink-soft hover:text-blue transition-colors truncate block"
                              >
                                {song.artistName}
                              </Link>
                            </div>
                          </div>

                          {/* Right Side: Duration & Quick Queue */}
                          <div className="flex items-center gap-4 shrink-0">
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
                                  albumId: "",
                                  albumTitle: "",
                                  coverImageUrl: song.coverImageUrl,
                                  durationSeconds: song.durationSeconds,
                                  audioUrl: song.audioUrl,
                                  isExplicit: song.isExplicit,
                                });
                              }}
                              className="font-mono text-[10px] uppercase tracking-wider text-ink-soft hover:text-ink transition-colors px-2 py-1 border border-line hover:border-ink cursor-pointer bg-canvas"
                              title="Add to queue"
                            >
                              + Queue
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
