export type CommentSort = "top" | "newest" | "oldest" | "disliked" | "controversial";

export interface EnrichedComment {
  id: string;
  userId: string;
  userName: string;
  userAvatarUrl: string | null;
  songId: string | null;
  albumId: string | null;
  playlistId: string | null;
  parentId: string | null;
  replyToUserId: string | null;
  replyToUserName?: string | null;
  timestampSeconds: number | null;
  content: string;
  likesCount: number;
  dislikesCount: number;
  repliesCount: number;
  isEdited: boolean;
  isPinned: boolean;
  isDeleted: boolean;
  userVote: 1 | -1 | null;
  canEdit: boolean;
  canDelete: boolean;
  canPin: boolean;
  previewReplies?: EnrichedComment[];
  createdAt: string;
  updatedAt: string | null;
}

export interface ListCommentsQuery {
  songId?: string;
  albumId?: string;
  playlistId?: string;
  sort?: CommentSort;
  page?: number;
  limit?: number;
}

export interface ListCommentsResponse {
  data: EnrichedComment[];
  comments?: EnrichedComment[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  allowComments: boolean;
}

export interface ListRepliesQuery {
  page?: number;
  limit?: number;
}

export interface ListRepliesResponse {
  data: EnrichedComment[];
  replies?: EnrichedComment[];
  total: number;
  page: number;
  limit: number;
  totalPages?: number;
}

export interface CreateCommentInput {
  content: string;
  songId?: string;
  albumId?: string;
  playlistId?: string;
  parentId?: string;
  replyToUserId?: string;
  timestampSeconds?: number;
}

export interface UpdateCommentInput {
  content: string;
}

export interface VoteCommentResponse {
  commentId: string;
  vote?: 1 | -1 | null;
  userVote?: 1 | -1 | null;
  likesCount: number;
  dislikesCount: number;
}

export interface PinCommentResponse {
  commentId: string;
  isPinned: boolean;
}
