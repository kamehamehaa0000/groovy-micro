import { useState, useEffect, useCallback } from "react";
import type { CommentSort, EnrichedComment } from "../../types/comment";
import { commentsApi } from "../../lib/comments.api";
import { useAuthStore } from "../../stores/auth.store";
import { useCommentVotesStore } from "../../stores/comment-votes.store";
import { CommentItem } from "./CommentItem";
import { CommentForm } from "./CommentForm";

interface CommentSectionProps {
  targetType: "album" | "song" | "playlist";
  targetId: string;
  allowComments?: boolean;
  isCreatorOrOwner?: boolean;
}

const SORT_OPTIONS: Array<{ value: CommentSort; label: string }> = [
  { value: "top", label: "Top Comments" },
  { value: "newest", label: "Newest First" },
  { value: "oldest", label: "Oldest First" },
  { value: "controversial", label: "Controversial" },
  { value: "disliked", label: "Most Disliked" },
];

export function CommentSection({
  targetType,
  targetId,
  allowComments: initialAllowComments = true,
}: CommentSectionProps) {
  const { isAuthenticated } = useAuthStore();
  const hydrateVotes = useCommentVotesStore((s) => s.hydrateVotes);
  const fetchMyVotes = useCommentVotesStore((s) => s.fetchMyVotes);
  const isVotesInitialized = useCommentVotesStore((s) => s.isInitialized);

  const [comments, setComments] = useState<EnrichedComment[]>([]);
  const [sort, setSort] = useState<CommentSort>("top");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [allowComments, setAllowComments] = useState(initialAllowComments);

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch comments
  const loadComments = useCallback(
    async (targetSort: CommentSort, pageNum = 1, append = false) => {
      if (pageNum === 1) {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }
      setErrorMsg(null);

      try {
        const query = {
          ...(targetType === "album" ? { albumId: targetId } : {}),
          ...(targetType === "song" ? { songId: targetId } : {}),
          ...(targetType === "playlist" ? { playlistId: targetId } : {}),
          sort: targetSort,
          page: pageNum,
          limit: 20,
        };

        const res = await commentsApi.getComments(query);
        const rawItems = res.comments ?? res.data ?? [];
        const items = Array.isArray(rawItems) ? rawItems : [];
        setAllowComments(res.allowComments ?? true);
        setTotalCount(res.total ?? 0);
        setTotalPages(res.totalPages ?? 1);
        setPage(res.page ?? 1);

        if (append) {
          setComments((prev) => [...(Array.isArray(prev) ? prev : []), ...items]);
        } else {
          setComments(items);
        }

        // Hydrate fast vote cache
        hydrateVotes(items);
      } catch (err: any) {
        setErrorMsg(err.message || "Failed to load comments");
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [targetType, targetId, hydrateVotes]
  );

  // Initial load or targetId / sort change
  useEffect(() => {
    loadComments(sort, 1, false);
  }, [targetId, sort, loadComments]);

  // Sync current user's votes from Redis hash (<1ms) if authenticated
  useEffect(() => {
    if (isAuthenticated && !isVotesInitialized) {
      fetchMyVotes();
    }
  }, [isAuthenticated, isVotesInitialized, fetchMyVotes]);

  // Handle Sort Change
  const handleSortChange = (newSort: CommentSort) => {
    setSort(newSort);
    loadComments(newSort, 1, false);
  };

  // Handle Load More
  const handleLoadMore = () => {
    if (page < totalPages && !isLoadingMore) {
      loadComments(sort, page + 1, true);
    }
  };

  // Handle Create Root Comment
  const handleCreateComment = async (content: string) => {
    const res = await commentsApi.createComment({
      content,
      ...(targetType === "album" ? { albumId: targetId } : {}),
      ...(targetType === "song" ? { songId: targetId } : {}),
      ...(targetType === "playlist" ? { playlistId: targetId } : {}),
    });

    setComments((prev) => [res.comment, ...prev]);
    setTotalCount((prev) => prev + 1);
    hydrateVotes([res.comment]);
  };

  // Handle Pin Toggle
  const handlePinToggled = (commentId: string, isPinned: boolean) => {
    setComments((prev) => {
      const next = prev.map((c) => {
        if (c.id === commentId) {
          return { ...c, isPinned };
        }
        // If pinning this comment, unpin any previously pinned comment
        if (isPinned && c.isPinned) {
          return { ...c, isPinned: false };
        }
        return c;
      });

      // If pinning, re-sort so pinned comment is at top
      if (isPinned) {
        next.sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));
      }
      return next;
    });
  };

  // Handle Comment Update
  const handleCommentUpdated = (updated: EnrichedComment) => {
    setComments((prev) =>
      prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
    );
  };

  // Handle Comment Delete
  const handleCommentDeleted = (commentId: string, softDeleted: boolean) => {
    if (softDeleted) {
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? { ...c, isDeleted: true, content: "[Comment deleted]" }
            : c
        )
      );
    } else {
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      setTotalCount((prev) => Math.max(0, prev - 1));
    }
  };

  return (
    <section aria-label="Comments" className="w-full mt-10 pt-8 border-t border-line">
      {/* Section Header: Title, Count, and Sort Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-baseline gap-3">
          <h3 className="font-serif text-xl sm:text-2xl font-bold tracking-tight text-ink">
            Comments
          </h3>
          <span className="font-mono text-xs text-ink-soft bg-stone/30 px-2 py-0.5 rounded-full">
            {totalCount}
          </span>
        </div>

        {/* Sort Selector */}
        {allowComments && totalCount > 0 && (
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-wider text-ink-soft">
              Sort by:
            </span>
            <select
              value={sort}
              onChange={(e) => handleSortChange(e.target.value as CommentSort)}
              className="bg-panel border border-line rounded px-2.5 py-1 text-xs font-mono text-ink focus:outline-none focus:border-blue cursor-pointer"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Creator Disabled Comments Banner */}
      {!allowComments ? (
        <div className="p-4 rounded-md border border-line bg-canvas/60 text-center text-xs font-mono text-ink-soft">
          Comments are disabled for this {targetType}.
        </div>
      ) : (
        <>
          {/* Top-level Comment Input Form */}
          {isAuthenticated ? (
            <div className="mb-8">
              <CommentForm
                placeholder={`Share your thoughts on this ${targetType}...`}
                submitLabel="Post Comment"
                onSubmit={handleCreateComment}
              />
            </div>
          ) : (
            <div className="mb-8 p-4 rounded-md border border-line bg-panel text-center text-xs text-ink-soft font-mono">
              <span>Sign in to leave a comment and join the discussion.</span>
            </div>
          )}

          {/* Loading Skeleton */}
          {isLoading && (
            <div className="flex flex-col gap-4 py-8">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="animate-pulse flex flex-col gap-2 pb-4 border-b border-line-soft"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-stone/40" />
                    <div className="h-3 w-28 bg-stone/40 rounded" />
                  </div>
                  <div className="h-3 w-3/4 bg-stone/30 rounded ml-9" />
                </div>
              ))}
            </div>
          )}

          {/* Error Message */}
          {errorMsg && !isLoading && (
            <div className="p-4 rounded-md border border-red-500/20 bg-red-500/5 text-red-500 text-xs font-mono mb-4">
              {errorMsg}
            </div>
          )}

          {/* Empty State */}
          {!isLoading && (comments?.length ?? 0) === 0 && (
            <div className="py-12 text-center text-ink-soft">
              <p className="font-serif text-lg italic mb-1">Quiet in here...</p>
              <p className="font-mono text-xs">
                Be the first to leave a comment on this {targetType}!
              </p>
            </div>
          )}

          {/* Comment List */}
          {!isLoading && (comments?.length ?? 0) > 0 && (
            <div className="flex flex-col">
              {comments.map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  onCommentUpdated={handleCommentUpdated}
                  onCommentDeleted={handleCommentDeleted}
                  onPinToggled={handlePinToggled}
                />
              ))}
            </div>
          )}

          {/* Pagination / Load More Button */}
          {page < totalPages && (
            <div className="flex justify-center mt-6">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                className="px-4 py-2 rounded border border-line bg-panel hover:bg-stone/20 font-mono text-xs font-medium text-ink cursor-pointer transition-colors"
              >
                {isLoadingMore ? "Loading more..." : "Load more comments"}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
