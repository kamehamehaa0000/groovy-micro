import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useAuthStore } from "../stores/auth.store";
import { usePlayerStore } from "../stores/player.store";
import { playerApi, type FriendActivityItem } from "../lib/player.api";
import {
  socialApi,
  type IncomingFollowRequest,
  type UserSummary,
} from "../lib/social.api";
import type { PlayerTrack } from "../types/player";

export const Route = createFileRoute("/activity")({
  component: ActivityComponent,
});

function formatElapsed(progressMs: number): string {
  const totalSec = Math.floor(progressMs / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function ActivityComponent() {
  const { isAuthenticated } = useAuthStore();
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const playbackStatus = usePlayerStore((s) => s.playbackStatus);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const togglePlay = usePlayerStore((s) => s.togglePlay);

  const [activeTab, setActiveTab] = useState<"live" | "requests" | "find">("live");

  // Live Friends Activity State
  const [activities, setActivities] = useState<FriendActivityItem[]>([]);
  const [isLoadingActivities, setIsLoadingActivities] = useState(true);

  // Incoming Requests State
  const [requests, setRequests] = useState<IncomingFollowRequest[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);

  // User Directory / Search State
  const [directoryUsers, setDirectoryUsers] = useState<UserSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [actionUserId, setActionUserId] = useState<string | null>(null);

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 1. Fetch Live Friends Playback Activity
  const fetchActivities = async () => {
    if (!isAuthenticated) return;
    try {
      const res = await playerApi.getFriendsActivity();
      setActivities(res.activities || []);
    } catch (err) {
      console.warn("[Activity] Failed to load friends activity:", err);
    } finally {
      setIsLoadingActivities(false);
    }
  };

  // 2. Fetch Pending Incoming Follow Requests
  const fetchRequests = async () => {
    if (!isAuthenticated) return;
    setIsLoadingRequests(true);
    try {
      const res = await socialApi.getIncomingRequests();
      setRequests(res.requests || []);
    } catch (err) {
      console.warn("[Activity] Failed to load requests:", err);
    } finally {
      setIsLoadingRequests(false);
    }
  };

  // 3. Search / Load Community Members
  const searchCommunity = async (q = "") => {
    if (!isAuthenticated) return;
    setIsSearching(true);
    try {
      const res = await socialApi.searchUsers(q);
      setDirectoryUsers(res.users || []);
    } catch (err) {
      console.warn("[Activity] Failed to load community directory:", err);
    } finally {
      setIsSearching(false);
    }
  };

  // Initial load & routine polling for live presence (every 10s)
  useEffect(() => {
    if (!isAuthenticated) return;

    fetchActivities();
    fetchRequests();
    searchCommunity();

    pollTimerRef.current = setInterval(() => {
      fetchActivities();
    }, 10000);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [isAuthenticated]);

  // Handle Listen Along / Play Song
  const handleListenAlong = (item: FriendActivityItem) => {
    const isCurrent = currentTrack?.id === item.activity.songId;
    if (isCurrent) {
      togglePlay();
      return;
    }

    const playerTrack: PlayerTrack = {
      id: item.activity.songId,
      title: item.activity.trackTitle,
      artistId: "",
      artistName: item.activity.artistName,
      coverImageUrl: item.activity.coverImageUrl || undefined,
      durationSeconds: item.activity.durationMs
        ? Math.floor(item.activity.durationMs / 1000)
        : 0,
    };

    // Play track & seek to friend's current position
    playTrack(playerTrack, [playerTrack], 0, "social:activity", "Friend Activity");
    if (item.activity.progressMs > 0) {
      usePlayerStore.getState().seek(Math.floor(item.activity.progressMs / 1000));
    }
  };

  // Handle Accept Follow Request
  const handleAcceptRequest = async (requesterId: string) => {
    setProcessingRequestId(requesterId);
    try {
      await socialApi.acceptRequest(requesterId);
      setRequests((prev) => prev.filter((r) => r.requesterId !== requesterId));
      fetchActivities();
      searchCommunity(searchQuery);
    } catch (err) {
      console.error("[Activity] Accept request failed:", err);
    } finally {
      setProcessingRequestId(null);
    }
  };

  // Handle Reject Follow Request
  const handleRejectRequest = async (requesterId: string) => {
    setProcessingRequestId(requesterId);
    try {
      await socialApi.rejectRequest(requesterId);
      setRequests((prev) => prev.filter((r) => r.requesterId !== requesterId));
    } catch (err) {
      console.error("[Activity] Reject request failed:", err);
    } finally {
      setProcessingRequestId(null);
    }
  };

  // Handle Follow / Unfollow from Directory
  const handleToggleFollow = async (targetUser: UserSummary) => {
    setActionUserId(targetUser.id);
    try {
      if (
        targetUser.relationship === "FOLLOWING" ||
        targetUser.relationship === "FRIENDS" ||
        targetUser.relationship === "PENDING_SENT"
      ) {
        await socialApi.unfollowUser(targetUser.id);
        setDirectoryUsers((prev) =>
          prev.map((u) =>
            u.id === targetUser.id ? { ...u, relationship: "NONE" } : u
          )
        );
      } else {
        const res = await socialApi.followUser(targetUser.id);
        setDirectoryUsers((prev) =>
          prev.map((u) => {
            if (u.id !== targetUser.id) return u;
            if (res.status === "PENDING") {
              return { ...u, relationship: "PENDING_SENT" };
            }
            return {
              ...u,
              relationship: res.isMutualFriend ? "FRIENDS" : "FOLLOWING",
            };
          })
        );
      }
      fetchActivities();
    } catch (err) {
      console.error("[Activity] Toggle follow failed:", err);
    } finally {
      setActionUserId(null);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="border border-line bg-panel p-12 text-center max-w-lg mx-auto shadow-xs space-y-6 mt-8">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-blue mb-1">
          Community · Social Circle
        </div>
        <h2 className="font-serif italic text-3xl text-ink font-normal">
          Connect with Listeners
        </h2>
        <p className="font-sans text-xs sm:text-sm text-ink-soft leading-relaxed">
          Sign in to follow curators, share live listening sessions, and discover what your friends are streaming right now.
        </p>
        <Link
          to="/login"
          className="inline-block bg-ink text-canvas border border-ink py-2.5 px-6 font-mono text-xs uppercase tracking-widest font-semibold hover:bg-canvas hover:text-ink transition-all"
        >
          Sign In to Access Social Hub &rarr;
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Editorial Header */}
      <section className="border border-line bg-panel p-6 sm:p-10 shadow-xs relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-blue mb-2">
              Social Hub · Listening Presence
            </div>
            <h1 className="font-serif italic text-3xl sm:text-4xl text-ink font-normal leading-tight">
              Community &amp; Circles
            </h1>
            <p className="font-sans text-xs sm:text-sm text-ink-soft mt-1 max-w-xl leading-relaxed">
              Real-time playback telemetry, mutual circles, and live session sharing.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                fetchActivities();
                fetchRequests();
              }}
              className="font-mono text-[10px] uppercase tracking-[0.14em] py-2 px-3.5 border border-line bg-canvas hover:bg-canvas-deep text-ink transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5">
                <path
                  d="M13.65 2.35A8 8 0 1 0 15 8"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                />
                <polyline
                  points="16 2 13.5 2 13.5 4.5"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                />
              </svg>
              <span>Refresh Pulse</span>
            </button>
          </div>
        </div>
      </section>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-line pb-px">
        <button
          type="button"
          onClick={() => setActiveTab("live")}
          className={`font-mono text-xs uppercase tracking-[0.14em] py-2.5 px-4 border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === "live"
              ? "border-blue text-ink font-semibold"
              : "border-transparent text-ink-soft hover:text-ink"
          }`}
        >
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span>Live Sessions ({activities.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("requests")}
          className={`font-mono text-xs uppercase tracking-[0.14em] py-2.5 px-4 border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === "requests"
              ? "border-blue text-ink font-semibold"
              : "border-transparent text-ink-soft hover:text-ink"
          }`}
        >
          <span>Requests</span>
          {requests.length > 0 && (
            <span className="bg-blue text-white text-[9px] font-mono px-1.5 py-0.2 rounded-full font-bold">
              {requests.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("find")}
          className={`font-mono text-xs uppercase tracking-[0.14em] py-2.5 px-4 border-b-2 transition-all cursor-pointer ${
            activeTab === "find"
              ? "border-blue text-ink font-semibold"
              : "border-transparent text-ink-soft hover:text-ink"
          }`}
        >
          <span>Find Members</span>
        </button>
      </div>

      {/* ===================== TAB 1: LIVE FRIEND PLAYBACK SESSIONS ===================== */}
      {activeTab === "live" && (
        <div className="space-y-6">
          {isLoadingActivities ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="border border-line bg-panel p-5 animate-pulse space-y-3"
                >
                  <div className="h-4 bg-stone/20 rounded w-1/3" />
                  <div className="h-16 bg-stone/10 rounded" />
                </div>
              ))}
            </div>
          ) : activities.length === 0 ? (
            <div className="border border-line bg-panel p-10 text-center space-y-3 shadow-xs">
              <div className="font-serif italic text-2xl text-ink font-normal">
                Quiet in the collective right now.
              </div>
              <p className="font-sans text-xs text-ink-soft max-w-md mx-auto leading-relaxed">
                None of your mutual friends or followed listeners are broadcasting active streams at this moment.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("find")}
                  className="font-mono text-[10px] uppercase tracking-widest border border-line bg-canvas hover:bg-canvas-deep text-ink px-4 py-2 transition-colors cursor-pointer"
                >
                  Discover Listeners to Follow &rarr;
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activities.map((item) => {
                const isPlayingThis =
                  currentTrack?.id === item.activity.songId &&
                  playbackStatus === "playing";

                const progressPercent = item.activity.durationMs
                  ? Math.min(
                      100,
                      (item.activity.progressMs / item.activity.durationMs) * 100
                    )
                  : 0;

                return (
                  <div
                    key={item.user.id}
                    className="border border-line bg-panel p-5 shadow-xs flex flex-col justify-between space-y-4 hover:border-ink transition-colors group"
                  >
                    {/* User Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-stone/30 border border-line flex items-center justify-center font-mono text-xs font-semibold text-ink overflow-hidden uppercase">
                          {item.user.avatarUrl ? (
                            <img
                              src={item.user.avatarUrl}
                              alt={item.user.displayName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            item.user.displayName[0] || "U"
                          )}
                        </div>
                        <div>
                          <span className="font-semibold text-xs text-ink block">
                            {item.user.displayName}
                          </span>
                          <span className="font-mono text-[9px] uppercase tracking-wider text-ink-soft">
                            {item.user.isMutualFriend ? "Mutual Friend" : "Followed Member"}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-mono text-[9px] uppercase tracking-wider">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                        <span>Streaming</span>
                      </div>
                    </div>

                    {/* Track Card */}
                    <div className="flex items-center gap-3 bg-canvas border border-line p-3 relative overflow-hidden">
                      {/* Album Art with Rotating Vinyl Accent */}
                      <div className="relative w-14 h-14 bg-stone/20 border border-line shrink-0 overflow-hidden shadow-xs">
                        {item.activity.coverImageUrl ? (
                          <img
                            src={item.activity.coverImageUrl}
                            alt={item.activity.trackTitle}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center font-serif italic text-ink-soft text-xl">
                            ♪
                          </div>
                        )}
                      </div>

                      {/* Song Details */}
                      <div className="flex-1 min-w-0 pr-2">
                        <h4
                          className="font-serif italic text-base text-ink truncate font-medium"
                          title={item.activity.trackTitle}
                        >
                          {item.activity.trackTitle}
                        </h4>
                        <p className="font-sans text-xs text-ink-soft truncate">
                          {item.activity.artistName}
                        </p>

                        {/* Progress Indicator */}
                        <div className="mt-2 space-y-1">
                          <div className="w-full h-1 bg-stone/20 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue transition-all duration-300"
                              style={{ width: `${progressPercent}%` }}
                            />
                          </div>
                          <div className="flex justify-between font-mono text-[8.5px] text-ink-soft/70">
                            <span>{formatElapsed(item.activity.progressMs)}</span>
                            {item.activity.durationMs && (
                              <span>{formatElapsed(item.activity.durationMs)}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 1-Click Listen Along Action */}
                      <button
                        type="button"
                        onClick={() => handleListenAlong(item)}
                        className={`shrink-0 px-3 py-2 font-mono text-[9.5px] uppercase tracking-[0.14em] font-semibold border transition-all cursor-pointer shadow-xs ${
                          isPlayingThis
                            ? "border-blue bg-blue text-white"
                            : "border-line bg-canvas hover:bg-ink hover:text-canvas hover:border-ink text-ink"
                        }`}
                      >
                        {isPlayingThis ? "Playing" : "Listen Along"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================== TAB 2: INCOMING FOLLOW REQUESTS ===================== */}
      {activeTab === "requests" && (
        <div className="space-y-4">
          <div className="border border-line bg-panel p-6 shadow-xs">
            <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-blue mb-1">
              Private Account Desk
            </div>
            <h3 className="font-serif italic text-xl text-ink font-normal mb-1">
              Pending Follow Requests ({requests.length})
            </h3>
            <p className="font-sans text-xs text-ink-soft mb-6">
              When your account is set to Private, community members must request permission to view your library and listening activity.
            </p>

            {isLoadingRequests ? (
              <div className="font-mono text-xs text-ink-soft animate-pulse py-6 text-center">
                Loading pending requests...
              </div>
            ) : requests.length === 0 ? (
              <div className="border border-line-soft bg-canvas p-6 text-center text-xs text-ink-soft font-mono">
                No pending follow requests at this time.
              </div>
            ) : (
              <div className="divide-y divide-line-soft border border-line bg-canvas">
                {requests.map((req) => {
                  const isProcessing = processingRequestId === req.requesterId;

                  return (
                    <div
                      key={req.requesterId}
                      className="p-4 flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-stone/20 border border-line flex items-center justify-center font-mono text-sm font-semibold uppercase text-ink overflow-hidden">
                          {req.avatarUrl ? (
                            <img
                              src={req.avatarUrl}
                              alt={req.displayName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            req.displayName[0] || "U"
                          )}
                        </div>
                        <div>
                          <span className="font-semibold text-xs text-ink block">
                            {req.displayName}
                          </span>
                          <span className="font-mono text-[9.5px] text-ink-soft">
                            Requested {new Date(req.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() => handleAcceptRequest(req.requesterId)}
                          className="bg-ink text-canvas hover:bg-blue px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-wider font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() => handleRejectRequest(req.requesterId)}
                          className="border border-line hover:bg-canvas-deep text-ink-soft hover:text-ink px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================== TAB 3: FIND MEMBERS / DIRECTORY ===================== */}
      {activeTab === "find" && (
        <div className="space-y-6">
          {/* Search Bar */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  searchCommunity(e.target.value);
                }}
                placeholder="Search community by display name or email..."
                className="w-full border border-line bg-panel px-4 py-2.5 text-xs text-ink focus:outline-hidden focus:border-ink placeholder:text-ink-soft"
              />
            </div>
          </div>

          {/* Directory Grid */}
          {isSearching ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="border border-line bg-panel p-4 animate-pulse space-y-3"
                >
                  <div className="w-10 h-10 rounded-full bg-stone/20" />
                  <div className="h-3 bg-stone/20 rounded w-2/3" />
                </div>
              ))}
            </div>
          ) : directoryUsers.length === 0 ? (
            <div className="border border-line bg-panel p-10 text-center font-mono text-xs text-ink-soft">
              No matching community members found.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {directoryUsers.map((member) => {
                const isActing = actionUserId === member.id;

                return (
                  <div
                    key={member.id}
                    className="border border-line bg-panel p-4 shadow-xs flex items-center justify-between gap-3 hover:border-ink transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-stone/20 border border-line flex items-center justify-center font-mono text-sm font-semibold uppercase text-ink overflow-hidden shrink-0">
                        {member.avatarUrl ? (
                          <img
                            src={member.avatarUrl}
                            alt={member.displayName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          member.displayName[0] || "U"
                        )}
                      </div>

                      <div className="min-w-0">
                        <span className="font-semibold text-xs text-ink block truncate">
                          {member.displayName}
                        </span>
                        <span className="font-mono text-[9px] uppercase tracking-wider text-ink-soft block">
                          {member.relationship === "FRIENDS"
                            ? "Mutual Friend"
                            : member.relationship === "FOLLOWING"
                              ? "Following"
                              : member.relationship === "PENDING_SENT"
                                ? "Request Sent"
                                : member.isPrivateAccount
                                  ? "Private Account"
                                  : "Public Profile"}
                        </span>
                      </div>
                    </div>

                    {/* Follow / Relationship Button */}
                    <button
                      type="button"
                      disabled={isActing}
                      onClick={() => handleToggleFollow(member)}
                      className={`font-mono text-[9.5px] uppercase tracking-wider px-3 py-1.5 border transition-all cursor-pointer shrink-0 disabled:opacity-50 ${
                        member.relationship === "FRIENDS" ||
                        member.relationship === "FOLLOWING"
                          ? "border-line bg-canvas hover:border-red-500 hover:text-red-500 text-ink-soft"
                          : member.relationship === "PENDING_SENT"
                            ? "border-line bg-stone/20 text-ink-soft hover:bg-red-900/10 hover:text-red-500"
                            : "border-ink bg-ink text-canvas hover:bg-blue hover:border-blue"
                      }`}
                    >
                      {member.relationship === "FRIENDS"
                        ? "Friends"
                        : member.relationship === "FOLLOWING"
                          ? "Following"
                          : member.relationship === "PENDING_SENT"
                            ? "Requested"
                            : member.isPrivateAccount
                              ? "Request"
                              : "Follow"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
