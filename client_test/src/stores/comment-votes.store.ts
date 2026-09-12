import { create } from "zustand";
import { commentsApi } from "../lib/comments.api";
import type { EnrichedComment } from "../types/comment";

interface CommentVotesState {
  // Comment ID -> active vote (1 for upvote, -1 for downvote, null for no vote)
  votes: Record<string, 1 | -1 | null>;
  // Comment ID -> { likes, dislikes }
  counts: Record<string, { likes: number; dislikes: number }>;
  isInitialized: boolean;

  // Read helpers
  getVote: (commentId: string, fallback?: 1 | -1 | null) => 1 | -1 | null;
  getCounts: (
    commentId: string,
    fallbackLikes?: number,
    fallbackDislikes?: number
  ) => { likes: number; dislikes: number };

  // Hydration from comment lists
  hydrateVotes: (comments: EnrichedComment[]) => void;

  // Fast sync from backend Redis hash (<1ms)
  fetchMyVotes: () => Promise<void>;

  // Clear on logout
  clearVotes: () => void;

  // 0ms Synchronous Optimistic Vote Mutator
  castVote: (
    commentId: string,
    desiredVote: 1 | -1,
    currentVoteFallback?: 1 | -1 | null,
    currentLikesFallback?: number,
    currentDislikesFallback?: number
  ) => Promise<{ vote: 1 | -1 | null; likesCount: number; dislikesCount: number }>;
}

// Request sequence tracker per comment to resolve in-flight race conditions
const requestSeqMap: Record<string, number> = {};

export const useCommentVotesStore = create<CommentVotesState>((set, get) => ({
  votes: {},
  counts: {},
  isInitialized: false,

  getVote: (commentId: string, fallback?: 1 | -1 | null) => {
    const v = get().votes[commentId];
    return v !== undefined ? v : fallback ?? null;
  },

  getCounts: (
    commentId: string,
    fallbackLikes: number = 0,
    fallbackDislikes: number = 0
  ) => {
    const c = get().counts[commentId];
    return c ?? { likes: fallbackLikes, dislikes: fallbackDislikes };
  },

  hydrateVotes: (comments: EnrichedComment[]) => {
    if (!comments || !Array.isArray(comments)) return;
    const currentVotes = get().votes;
    const currentCounts = get().counts;
    let votesChanged = false;
    let countsChanged = false;
    const nextVotes = { ...currentVotes };
    const nextCounts = { ...currentCounts };

    const processItem = (c: EnrichedComment) => {
      if (!c || !c.id) return;

      // Seed vote only if not already tracked in the store
      if (nextVotes[c.id] === undefined && c.userVote !== undefined) {
        nextVotes[c.id] = c.userVote ?? null;
        votesChanged = true;
      }

      // Seed counts only if not already tracked in the store
      if (nextCounts[c.id] === undefined && c.likesCount !== undefined) {
        nextCounts[c.id] = {
          likes: c.likesCount ?? 0,
          dislikes: c.dislikesCount ?? 0,
        };
        countsChanged = true;
      }

      if (c.previewReplies && Array.isArray(c.previewReplies)) {
        c.previewReplies.forEach(processItem);
      }
    };

    comments.forEach(processItem);

    if (votesChanged || countsChanged) {
      set({
        ...(votesChanged ? { votes: nextVotes } : {}),
        ...(countsChanged ? { counts: nextCounts } : {}),
      });
    }
  },

  fetchMyVotes: async () => {
    try {
      const res = await commentsApi.getMyVotes();
      if (res && res.votes) {
        set((state) => ({
          votes: { ...state.votes, ...res.votes },
          isInitialized: true,
        }));
      }
    } catch {
      // Silently ignore if unauthenticated or network failure
    }
  },

  clearVotes: () => set({ votes: {}, counts: {}, isInitialized: false }),

  castVote: async (
    commentId: string,
    desiredVote: 1 | -1,
    currentVoteFallback?: 1 | -1 | null,
    currentLikesFallback: number = 0,
    currentDislikesFallback: number = 0
  ) => {
    // 1. Resolve current active vote and counts
    const state = get();
    const prevVote: 1 | -1 | null =
      state.votes[commentId] !== undefined
        ? state.votes[commentId]
        : currentVoteFallback ?? null;

    const prevCounts = state.counts[commentId] ?? {
      likes: currentLikesFallback,
      dislikes: currentDislikesFallback,
    };

    // 2. Compute toggle vs flip
    const newVote: 1 | -1 | null = prevVote === desiredVote ? null : desiredVote;
    const apiVote: 1 | -1 | 0 = newVote === null ? 0 : newVote;

    // 3. Compute 0ms optimistic counts
    let optimisticLikes = prevCounts.likes;
    let optimisticDislikes = prevCounts.dislikes;

    if (prevVote === 1) optimisticLikes = Math.max(0, optimisticLikes - 1);
    if (prevVote === -1) optimisticDislikes = Math.max(0, optimisticDislikes - 1);

    if (newVote === 1) optimisticLikes += 1;
    if (newVote === -1) optimisticDislikes += 1;

    // 4. INSTANT 0ms Synchronous Optimistic Update
    set((s) => ({
      votes: {
        ...s.votes,
        [commentId]: newVote,
      },
      counts: {
        ...s.counts,
        [commentId]: {
          likes: optimisticLikes,
          dislikes: optimisticDislikes,
        },
      },
    }));

    // 5. Increment request sequence number for this comment
    const seq = (requestSeqMap[commentId] = (requestSeqMap[commentId] || 0) + 1);

    try {
      const serverRes = await commentsApi.voteComment(commentId, apiVote);

      // If a newer vote was cast while this request was in flight, discard stale response
      if (requestSeqMap[commentId] !== seq) {
        return {
          vote: newVote,
          likesCount: optimisticLikes,
          dislikesCount: optimisticDislikes,
        };
      }

      // Synchronize with exact server counts and confirmed user vote
      const resolvedVote: 1 | -1 | null =
        serverRes.userVote !== undefined
          ? serverRes.userVote
          : serverRes.vote !== undefined
          ? serverRes.vote
          : newVote;

      set((s) => ({
        votes: {
          ...s.votes,
          [commentId]: resolvedVote,
        },
        counts: {
          ...s.counts,
          [commentId]: {
            likes: serverRes.likesCount,
            dislikes: serverRes.dislikesCount,
          },
        },
      }));

      return {
        vote: resolvedVote,
        likesCount: serverRes.likesCount,
        dislikesCount: serverRes.dislikesCount,
      };
    } catch (err) {
      // Rollback to prior state if network error and this is still the active sequence
      if (requestSeqMap[commentId] === seq) {
        set((s) => ({
          votes: {
            ...s.votes,
            [commentId]: prevVote,
          },
          counts: {
            ...s.counts,
            [commentId]: prevCounts,
          },
        }));
      }
      throw err;
    }
  },
}));
