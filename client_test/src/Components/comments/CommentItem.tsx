import { useState } from "react";
import { Link } from "@tanstack/react-router";
import type { EnrichedComment } from "../../types/comment";
import { useAuthStore } from "../../stores/auth.store";
import { useCommentVotesStore } from "../../stores/comment-votes.store";
import { commentsApi } from "../../lib/comments.api";
import { CommentForm } from "./CommentForm";

interface CommentItemProps {
  comment: EnrichedComment;
  rootCommentId?: string; // If this is a reply, the ID of the root comment
  onCommentUpdated?: (updated: EnrichedComment) => void;
  onCommentDeleted?: (id: string, softDeleted: boolean) => void;
  onReplyAdded?: (newReply: EnrichedComment) => void;
  onPinToggled?: (id: string, isPinned: boolean) => void;
}

function formatRelativeTime(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return "";
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return "just now";
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) return `${diffInDays}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Icon: Thumbs Up
const UpvoteIcon = ({ active, className = "w-3.5 h-3.5" }: { active: boolean; className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill={active ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
  </svg>
);

// Icon: Thumbs Down
const DownvoteIcon = ({ active, className = "w-3.5 h-3.5" }: { active: boolean; className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill={active ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3" />
  </svg>
);

// Icon: Pin
const PinIcon = ({ filled = false, className = "w-3 h-3" }: { filled?: boolean; className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill={filled ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <line x1="12" y1="17" x2="12" y2="22" />
    <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.89A2 2 0 0 1 15 10.77V6a3 3 0 0 0-6 0v4.77a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.24Z" />
  </svg>
);

// Icon: Reply / Curved Arrow
const ReplyIcon = ({ className = "w-3.5 h-3.5" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <polyline points="9 17 4 12 9 7" />
    <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
  </svg>
);

// Icon: Generic User Silhouette
const UserIcon = ({ className = "w-3.5 h-3.5" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

export function CommentItem({
  comment,
  rootCommentId,
  onCommentUpdated,
  onCommentDeleted,
  onReplyAdded,
  onPinToggled,
}: CommentItemProps) {
  const { isAuthenticated } = useAuthStore();
  const storeVote = useCommentVotesStore((s) => s.votes[comment.id]);
  const storeCounts = useCommentVotesStore((s) => s.counts[comment.id]);
  const castVote = useCommentVotesStore((s) => s.castVote);
  const hydrateVotes = useCommentVotesStore((s) => s.hydrateVotes);

  // Derived instant state: Store overrides initial comment props
  const currentVote = storeVote !== undefined ? storeVote : (comment.userVote ?? null);
  const isUpvoted = currentVote === 1;
  const isDownvoted = currentVote === -1;

  const likesCount = storeCounts ? storeCounts.likes : comment.likesCount;
  const dislikesCount = storeCounts ? storeCounts.dislikes : comment.dislikesCount;

  // Local interaction states
  const [isEditing, setIsEditing] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const [showReplies, setShowReplies] = useState(false);

  // Replies state for root comments
  const [replies, setReplies] = useState<EnrichedComment[]>(
    Array.isArray(comment?.previewReplies) ? comment.previewReplies : []
  );
  const [repliesPage, setRepliesPage] = useState(1);
  const [repliesTotal, setRepliesTotal] = useState(comment.repliesCount);
  const [isLoadingReplies, setIsLoadingReplies] = useState(false);

  const isRoot = !comment.parentId;
  const activeRootId = isRoot ? comment.id : rootCommentId!;

  // 0ms Synchronous Optimistic Vote Handler
  const handleVote = async (desired: 1 | -1) => {
    if (!isAuthenticated) {
      alert("Please log in to vote on comments.");
      return;
    }
    try {
      await castVote(comment.id, desired, currentVote, likesCount, dislikesCount);
    } catch {
      // Handled by store rollback
    }
  };

  // Edit Comment Handler
  const handleUpdate = async (newContent: string) => {
    const res = await commentsApi.updateComment(comment.id, newContent);
    setIsEditing(false);
    onCommentUpdated?.(res.comment);
  };

  // Delete Comment Handler
  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this comment?")) return;
    try {
      const res = await commentsApi.deleteComment(comment.id);
      onCommentDeleted?.(comment.id, res.softDeleted);
    } catch (err: any) {
      alert(err.message || "Failed to delete comment");
    }
  };

  // Pin / Unpin Handler (Root comments only)
  const handlePin = async () => {
    try {
      const res = await commentsApi.pinComment(comment.id);
      onPinToggled?.(comment.id, res.isPinned);
    } catch (err: any) {
      alert(err.message || "Failed to toggle pin");
    }
  };

  // Reply Submit Handler (Flattened to activeRootId)
  const handleReplySubmit = async (content: string) => {
    const res = await commentsApi.createComment({
      content,
      parentId: activeRootId,
      replyToUserId: comment.userId,
      ...(comment.songId ? { songId: comment.songId } : {}),
      ...(comment.albumId ? { albumId: comment.albumId } : {}),
      ...(comment.playlistId ? { playlistId: comment.playlistId } : {}),
    });

    setIsReplying(false);
    setShowReplies(true);
    setReplies((prev) => [...prev, res.comment]);
    setRepliesTotal((prev) => prev + 1);
    hydrateVotes([res.comment]);
    onReplyAdded?.(res.comment);
  };

  // Fetch full replies thread
  const handleToggleReplies = async () => {
    if (!showReplies && (replies?.length ?? 0) === 0 && repliesTotal > 0) {
      setIsLoadingReplies(true);
      try {
        const res = await commentsApi.getReplies(comment.id, 1, 20);
        const rawReplies = res.replies ?? res.data ?? [];
        const replyItems = Array.isArray(rawReplies) ? rawReplies : [];
        setReplies(replyItems);
        setRepliesTotal(res.total ?? replyItems.length);
        setRepliesPage(1);
        hydrateVotes(replyItems);
      } catch (err) {
        console.error("Failed to load replies:", err);
      } finally {
        setIsLoadingReplies(false);
      }
    }
    setShowReplies(!showReplies);
  };

  // Load more replies pagination
  const handleLoadMoreReplies = async () => {
    if (isLoadingReplies) return;
    setIsLoadingReplies(true);
    try {
      const nextPage = repliesPage + 1;
      const res = await commentsApi.getReplies(comment.id, nextPage, 20);
      const rawReplies = res.replies ?? res.data ?? [];
      const replyItems = Array.isArray(rawReplies) ? rawReplies : [];
      setReplies((prev) => [...(Array.isArray(prev) ? prev : []), ...replyItems]);
      setRepliesPage(nextPage);
      hydrateVotes(replyItems);
    } catch (err) {
      console.error("Failed to load more replies:", err);
    } finally {
      setIsLoadingReplies(false);
    }
  };

  return (
    <div
      className={`group flex flex-col gap-2 ${
        isRoot
          ? "border-b border-line-soft pb-4 pt-3"
          : "ml-6 pl-3 border-l-2 border-line-soft/80 py-2"
      }`}
    >
      {/* Pinned Header Badge */}
      {comment.isPinned && (
        <div className="flex items-center gap-1.5 text-blue font-mono text-[10.5px] uppercase tracking-wider font-semibold">
          <PinIcon filled className="w-3 h-3" />
          <span>Pinned by Creator</span>
        </div>
      )}

      {/* Author Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {/* Avatar / Generic User Icon for Deleted / Fallback Initials */}
          {comment.isDeleted ? (
            <div className="w-7 h-7 rounded-full bg-stone/25 border border-line flex items-center justify-center text-ink-soft">
              <UserIcon className="w-3.5 h-3.5 text-ink-soft" />
            </div>
          ) : (
            <Link
              to="/users/$id"
              params={{ id: comment.userId }}
              className="hover:opacity-80 transition-opacity"
            >
              {comment.userAvatarUrl ? (
                <img
                  src={comment.userAvatarUrl}
                  alt={comment.userName}
                  className="w-7 h-7 rounded-full object-cover border border-line"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-stone/40 border border-line flex items-center justify-center font-mono text-xs font-medium text-ink">
                  {(comment.userName || "U").charAt(0).toUpperCase()}
                </div>
              )}
            </Link>
          )}

          <div className="flex items-center gap-2">
            {comment.isDeleted ? (
              <span className="text-xs font-semibold text-ink-soft">User</span>
            ) : (
              <Link
                to="/users/$id"
                params={{ id: comment.userId }}
                className="text-xs font-semibold text-ink hover:text-blue transition-colors"
              >
                {comment.userName}
              </Link>
            )}
            <span className="font-mono text-[10.5px] text-ink-soft">
              {formatRelativeTime(comment.createdAt)}
            </span>
            {comment.isEdited && !comment.isDeleted && (
              <span className="font-mono text-[10px] text-ink-soft/70 italic">
                (edited)
              </span>
            )}
          </div>

        </div>

        {/* Pin action icon for creator */}
        {isRoot && comment.canPin && !comment.isDeleted && (
          <button
            type="button"
            onClick={handlePin}
            title={comment.isPinned ? "Unpin comment" : "Pin comment to top"}
            className={`p-1 rounded cursor-pointer transition-colors ${
              comment.isPinned
                ? "text-blue bg-blue/10"
                : "text-ink-soft/40 hover:text-ink hover:bg-stone/20 opacity-0 group-hover:opacity-100"
            }`}
          >
            <PinIcon filled={comment.isPinned} className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Content or Edit Form */}
      {isEditing ? (
        <div className="mt-1">
          <CommentForm
            initialContent={comment.content}
            submitLabel="Save"
            onSubmit={handleUpdate}
            onCancel={() => setIsEditing(false)}
            autoFocus
          />
        </div>
      ) : (
        <div className="text-sm leading-relaxed text-ink pl-9">
          {comment.isDeleted ? (
            <span className="italic text-ink-soft/70">[Comment deleted]</span>
          ) : (
            <p className="whitespace-pre-wrap break-words">
              {/* If this is a reply with a recipient username, show mention tag */}
              {comment.replyToUserName && (
                <span className="text-blue font-medium mr-1.5 select-none">
                  @{comment.replyToUserName}
                </span>
              )}
              {comment.content}
            </p>
          )}
        </div>
      )}

      {/* Action Bar (Votes, Reply, Edit, Delete) */}
      {!comment.isDeleted && !isEditing && (
        <div className="flex items-center gap-4 pl-9 text-xs text-ink-soft">
          {/* Upvote Button */}
          <button
            type="button"
            onClick={() => handleVote(1)}
            aria-label="Upvote"
            className={`flex items-center gap-1.5 py-1 px-1.5 -ml-1.5 rounded transition-all cursor-pointer select-none ${
              isUpvoted
                ? "text-blue bg-blue/10 font-semibold"
                : "text-ink-soft hover:text-ink hover:bg-stone/20"
            }`}
          >
            <UpvoteIcon active={isUpvoted} className="w-3.5 h-3.5" />
            <span className="font-mono text-[11px]">{likesCount}</span>
          </button>

          {/* Downvote Button */}
          <button
            type="button"
            onClick={() => handleVote(-1)}
            aria-label="Downvote"
            className={`flex items-center gap-1.5 py-1 px-1.5 rounded transition-all cursor-pointer select-none ${
              isDownvoted
                ? "text-red-500 bg-red-500/10 font-semibold"
                : "text-ink-soft hover:text-ink hover:bg-stone/20"
            }`}
          >
            <DownvoteIcon active={isDownvoted} className="w-3.5 h-3.5" />
            <span className="font-mono text-[11px]">{dislikesCount}</span>
          </button>

          {/* Reply Button */}
          <button
            type="button"
            onClick={() => setIsReplying(!isReplying)}
            className="flex items-center gap-1 hover:text-ink cursor-pointer transition-colors"
          >
            <ReplyIcon className="w-3 h-3" />
            <span className="font-mono text-[11px]">Reply</span>
          </button>

          {/* Edit Button */}
          {comment.canEdit && (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="hover:text-ink cursor-pointer font-mono text-[11px] transition-colors"
            >
              Edit
            </button>
          )}

          {/* Delete Button */}
          {comment.canDelete && (
            <button
              type="button"
              onClick={handleDelete}
              className="hover:text-red-500 cursor-pointer font-mono text-[11px] transition-colors"
            >
              Delete
            </button>
          )}
        </div>
      )}

      {/* Inline Reply Form */}
      {isReplying && (
        <div className="pl-9 mt-2">
          <CommentForm
            placeholder={`Reply to @${comment.userName}...`}
            replyToUserName={comment.userName}
            submitLabel="Reply"
            onSubmit={handleReplySubmit}
            onCancel={() => setIsReplying(false)}
            autoFocus
          />
        </div>
      )}

      {/* Root Comments: Child Replies Thread */}
      {isRoot && (
        <div className="pl-4 mt-1">
          {/* Toggle View Replies */}
          {repliesTotal > 0 && (
            <button
              type="button"
              onClick={handleToggleReplies}
              className="flex items-center gap-1.5 text-xs font-mono text-blue hover:underline cursor-pointer py-1"
            >
              <span>
                {showReplies
                  ? "Hide replies"
                  : `View ${repliesTotal} ${repliesTotal === 1 ? "reply" : "replies"}`}
              </span>
            </button>
          )}

          {/* Expanded Replies List */}
          {showReplies && (
            <div className="flex flex-col gap-1 mt-2">
              {replies.map((reply) => (
                <CommentItem
                  key={reply.id}
                  comment={reply}
                  rootCommentId={comment.id}
                  onCommentUpdated={(updated) => {
                    setReplies((prev) =>
                      prev.map((r) => (r.id === updated.id ? updated : r))
                    );
                  }}
                  onCommentDeleted={(delId, softDeleted) => {
                    if (softDeleted) {
                      setReplies((prev) =>
                        prev.map((r) =>
                          r.id === delId
                            ? { ...r, isDeleted: true, content: "[Comment deleted]" }
                            : r
                        )
                      );
                    } else {
                      setReplies((prev) => prev.filter((r) => r.id !== delId));
                      setRepliesTotal((prev) => Math.max(0, prev - 1));
                    }
                  }}
                  onReplyAdded={(newRep) => {
                    setReplies((prev) => [...prev, newRep]);
                    setRepliesTotal((prev) => prev + 1);
                  }}
                />
              ))}

              {/* Load More Replies Pagination */}
              {(replies?.length ?? 0) < repliesTotal && (
                <button
                  type="button"
                  onClick={handleLoadMoreReplies}
                  disabled={isLoadingReplies}
                  className="self-start text-xs font-mono text-ink-soft hover:text-ink cursor-pointer mt-1 underline"
                >
                  {isLoadingReplies ? "Loading replies..." : "Load more replies"}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
