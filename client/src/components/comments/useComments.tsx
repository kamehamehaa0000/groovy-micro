import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { useMemo } from 'react'
import {
  getComments,
  deleteComment,
  downvoteComment,
  getReplies,
  getThread,
  updateComment,
  upvoteComment,
  createComment,
} from '../../service/commentsService'

interface Comment {
  _id: string
  content: string
  authorId: {
    _id: string
    displayName: string
  }
  entityType: string
  entityId: string
  parentId?: string
  rootId?: string
  depth: number
  path: string
  upvotes: string[]
  downvotes: string[]
  replyCount: number
  directReplyCount: number
  isDeleted: boolean
  createdAt: string
  updatedAt: string
  replies?: Comment[]
}

interface CommentsResponse {
  comments: Comment[]
  currentPage: number
  totalPages: number
  totalComments: number
  hasMore: boolean
}

interface RepliesResponse {
  replies: Comment[]
  currentPage: number
  totalPages: number
  totalReplies: number
  hasMore: boolean
}

interface CreateCommentData {
  content: string
  parentId?: string
}

interface UpdateCommentData {
  commentId: string
  content: string
}

export const useComments = (
  entityType: string,
  entityId: string,
  sort: 'newest' | 'oldest' | 'best' | 'controversial' = 'best'
) => {
  const queryClient = useQueryClient()

  // Infinite query for comments
  const commentsQuery = useInfiniteQuery<CommentsResponse>({
    queryKey: ['comments', entityType, entityId, sort],
    queryFn: ({ pageParam = 1 }) =>
      getComments(entityType, entityId, {
        sort,
        loadReplies: true,
        page: pageParam as number,
        limit: 10, // Adjust page size as needed
      }),
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.hasMore) {
        return lastPage.currentPage + 1
      }
      return undefined
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    initialPageParam: 1,
  })

  // Flatten all comments from all pages
  const allComments = useMemo(() => {
    if (!commentsQuery.data) return []
    return commentsQuery.data.pages.flatMap((page) => page.comments)
  }, [commentsQuery.data])

  // Get total comments from first page
  const totalComments = useMemo(() => {
    return commentsQuery.data?.pages[0]?.totalComments || 0
  }, [commentsQuery.data])

  // Create comment mutation
  const createCommentMutation = useMutation({
    mutationFn: (data: CreateCommentData) =>
      createComment({
        content: data.content,
        entityType,
        entityId,
        parentId: data.parentId,
      }),
    onSuccess: () => {
      // Invalidate and refetch comments
      queryClient.invalidateQueries({
        queryKey: ['comments', entityType, entityId],
      })
    },
    onError: (error) => {
      console.error('Failed to create comment:', error)
    },
  })

  // Update comment mutation
  const updateCommentMutation = useMutation({
    mutationFn: (data: UpdateCommentData) =>
      updateComment(data.commentId, data.content),
    onSuccess: (updatedComment, variables) => {
      // Optimistically update the cache
      queryClient.setQueryData(
        ['comments', entityType, entityId, sort],
        (oldData: any) => {
          if (!oldData) return oldData

          return {
            ...oldData,
            pages: oldData.pages.map((page: CommentsResponse) => ({
              ...page,
              comments: updateCommentInList(
                page.comments,
                variables.commentId,
                updatedComment
              ),
            })),
          }
        }
      )
    },
    onError: (error) => {
      console.error('Failed to update comment:', error)
      // Revert on error
      queryClient.invalidateQueries({
        queryKey: ['comments', entityType, entityId],
      })
    },
  })

  // Delete comment mutation
  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) => deleteComment(commentId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['comments', entityType, entityId],
      })
    },
    onError: (error) => {
      console.error('Failed to delete comment:', error)
    },
  })

  // Upvote mutation
  const upvoteMutation = useMutation({
    mutationFn: (commentId: string) => upvoteComment(commentId),
    onSuccess: (updatedComment, commentId) => {
      // Optimistically update the cache
      queryClient.setQueryData(
        ['comments', entityType, entityId, sort],
        (oldData: any) => {
          if (!oldData) return oldData

          return {
            ...oldData,
            pages: oldData.pages.map((page: CommentsResponse) => ({
              ...page,
              comments: updateCommentInList(
                page.comments,
                commentId,
                updatedComment
              ),
            })),
          }
        }
      )
    },
    onError: (error) => {
      console.error('Failed to upvote comment:', error)
      queryClient.invalidateQueries({
        queryKey: ['comments', entityType, entityId],
      })
    },
  })

  // Downvote mutation
  const downvoteMutation = useMutation({
    mutationFn: (commentId: string) => downvoteComment(commentId),
    onSuccess: (updatedComment, commentId) => {
      // Optimistically update the cache
      queryClient.setQueryData(
        ['comments', entityType, entityId, sort],
        (oldData: any) => {
          if (!oldData) return oldData

          return {
            ...oldData,
            pages: oldData.pages.map((page: CommentsResponse) => ({
              ...page,
              comments: updateCommentInList(
                page.comments,
                commentId,
                updatedComment
              ),
            })),
          }
        }
      )
    },
    onError: (error) => {
      console.error('Failed to downvote comment:', error)
      queryClient.invalidateQueries({
        queryKey: ['comments', entityType, entityId],
      })
    },
  })

  // Helper function to recursively update comment in nested structure
  const updateCommentInList = (
    comments: Comment[],
    commentId: string,
    updatedComment: any
  ): Comment[] => {
    return comments.map((comment) => {
      if (comment._id === commentId) {
        return { ...comment, ...updatedComment }
      }
      if (comment.replies) {
        return {
          ...comment,
          replies: updateCommentInList(
            comment.replies,
            commentId,
            updatedComment
          ),
        }
      }
      return comment
    })
  }

  // Function to load replies for a specific comment
  const loadReplies = async (commentId: string): Promise<Comment[]> => {
    try {
      const repliesData = await getReplies(commentId)

      // Update the query cache with the loaded replies
      queryClient.setQueryData(
        ['comments', entityType, entityId, sort],
        (oldData: any) => {
          if (!oldData) return oldData

          return {
            ...oldData,
            pages: oldData.pages.map((page: CommentsResponse) => ({
              ...page,
              comments: updateCommentWithReplies(
                page.comments,
                commentId,
                repliesData.replies
              ),
            })),
          }
        }
      )

      return repliesData.replies
    } catch (error) {
      console.error('Failed to load replies:', error)
      throw error
    }
  }

  // Helper function to update comment with replies
  const updateCommentWithReplies = (
    comments: Comment[],
    commentId: string,
    replies: Comment[]
  ): Comment[] => {
    return comments.map((comment) => {
      if (comment._id === commentId) {
        return { ...comment, replies }
      }
      if (comment.replies) {
        return {
          ...comment,
          replies: updateCommentWithReplies(
            comment.replies,
            commentId,
            replies
          ),
        }
      }
      return comment
    })
  }

  return {
    // Data
    comments: allComments,
    totalComments,

    // Loading states
    isLoading: commentsQuery.isLoading,
    isError: commentsQuery.isError,
    error: commentsQuery.error,
    isFetchingNextPage: commentsQuery.isFetchingNextPage,
    hasNextPage: commentsQuery.hasNextPage,

    // Mutation states
    isCreating: createCommentMutation.isPending,
    isUpdating: updateCommentMutation.isPending,
    isDeleting: deleteCommentMutation.isPending,
    isVoting: upvoteMutation.isPending || downvoteMutation.isPending,

    // Actions
    createComment: createCommentMutation.mutate,
    updateComment: updateCommentMutation.mutate,
    deleteComment: deleteCommentMutation.mutate,
    upvoteComment: upvoteMutation.mutate,
    downvoteComment: downvoteMutation.mutate,
    loadReplies,
    fetchNextPage: commentsQuery.fetchNextPage,

    // Utility functions
    refetch: commentsQuery.refetch,
    invalidateComments: () => {
      queryClient.invalidateQueries({
        queryKey: ['comments', entityType, entityId],
      })
    },
  }
}

export type { Comment, CommentsResponse, RepliesResponse }
