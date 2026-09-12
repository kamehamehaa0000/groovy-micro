import { apiFetch } from "./api";
import type {
  ListCommentsQuery,
  ListCommentsResponse,
  ListRepliesResponse,
  CreateCommentInput,
  EnrichedComment,
  VoteCommentResponse,
  PinCommentResponse,
} from "../types/comment";

export const commentsApi = {
  /**
   * Retrieve comments for a song, album, or playlist with sorting and 2-level nesting.
   */
  async getComments(query: ListCommentsQuery): Promise<ListCommentsResponse> {
    const params = new URLSearchParams();
    if (query.songId) params.append("songId", query.songId);
    if (query.albumId) params.append("albumId", query.albumId);
    if (query.playlistId) params.append("playlistId", query.playlistId);
    if (query.sort) params.append("sort", query.sort);
    if (query.page) params.append("page", String(query.page));
    if (query.limit) params.append("limit", String(query.limit));

    const qs = params.toString();
    return apiFetch<ListCommentsResponse>(`/api/v1/comments${qs ? `?${qs}` : ""}`);
  },

  /**
   * Fetch paginated child replies for a specific root comment.
   */
  async getReplies(
    commentId: string,
    page = 1,
    limit = 20
  ): Promise<ListRepliesResponse> {
    const params = new URLSearchParams();
    params.append("page", String(page));
    params.append("limit", String(limit));

    return apiFetch<ListRepliesResponse>(
      `/api/v1/comments/${commentId}/replies?${params.toString()}`
    );
  },

  /**
   * Post a new root comment or reply.
   */
  async createComment(input: CreateCommentInput): Promise<{ comment: EnrichedComment }> {
    return apiFetch<{ comment: EnrichedComment }>("/api/v1/comments", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  /**
   * Update text content of an existing comment.
   */
  async updateComment(
    commentId: string,
    content: string
  ): Promise<{ comment: EnrichedComment }> {
    return apiFetch<{ comment: EnrichedComment }>(`/api/v1/comments/${commentId}`, {
      method: "PATCH",
      body: JSON.stringify({ content }),
    });
  },

  /**
   * Delete a comment (soft deletes if replies exist, hard deletes if leaf).
   */
  async deleteComment(
    commentId: string
  ): Promise<{ success: boolean; message: string; softDeleted: boolean }> {
    return apiFetch<{ success: boolean; message: string; softDeleted: boolean }>(
      `/api/v1/comments/${commentId}`,
      {
        method: "DELETE",
      }
    );
  },

  /**
   * Vote on a comment (+1 upvote, -1 downvote, 0 remove vote).
   */
  async voteComment(
    commentId: string,
    vote: 1 | -1 | 0
  ): Promise<VoteCommentResponse> {
    return apiFetch<VoteCommentResponse>(`/api/v1/comments/${commentId}/vote`, {
      method: "POST",
      body: JSON.stringify({ vote }),
    });
  },

  /**
   * Pin or unpin a root comment (entity creator only).
   */
  async pinComment(commentId: string): Promise<PinCommentResponse> {
    return apiFetch<PinCommentResponse>(`/api/v1/comments/${commentId}/pin`, {
      method: "PATCH",
    });
  },

  /**
   * Fast sync: retrieve current authenticated user's comment votes map (<1ms).
   */
  async getMyVotes(): Promise<{ votes: Record<string, 1 | -1> }> {
    return apiFetch<{ votes: Record<string, 1 | -1> }>("/api/v1/comments/votes/mine");
  },
};
