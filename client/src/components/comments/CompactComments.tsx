import type React from 'react'
import { useState, useEffect } from 'react'
import { useComments, type Comment } from './useComments'
import { useInfiniteScroll } from './useInfiniteScroll'
import EditCommentModal from './EditCommentModal'
import { useEditCommentModalStore } from '../../store/modal-store'
import { useAuthStore } from '../../store/auth-store'

export default function CompactComments({
  entityType,
  entityId,
}: Readonly<{
  entityType: string
  entityId: string
}>) {
  // Local state
  const [newComment, setNewComment] = useState('')
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [expandedReplies, setExpandedReplies] = useState<{
    [key: string]: boolean
  }>({})
  const [loadingReplies, setLoadingReplies] = useState<{
    [key: string]: boolean
  }>({})
  const [sort, setSort] = useState<
    'newest' | 'oldest' | 'best' | 'controversial'
  >('best')

  const { user } = useAuthStore()

  // Modal stores
  const editCommentModal = useEditCommentModalStore()

  // Comments hook
  const {
    comments,
    totalComments,
    isLoading,
    isError,
    error,
    isCreating,
    isUpdating,
    isDeleting,
    isVoting,
    isFetchingNextPage,
    hasNextPage,
    createComment,
    updateComment,
    deleteComment,
    upvoteComment,
    downvoteComment,
    loadReplies,
    fetchNextPage,
  } = useComments(entityType, entityId, sort)

  // Infinite scroll hook
  const { loadMoreRef, isFetching, resetFetching } = useInfiniteScroll({
    hasMore: hasNextPage || false,
    isLoading: isFetchingNextPage,
    threshold: 100,
  })

  // Handle infinite scroll
  useEffect(() => {
    if (isFetching && hasNextPage && !isFetchingNextPage) {
      fetchNextPage().finally(() => {
        resetFetching()
      })
    }
  }, [
    isFetching,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    resetFetching,
  ])

  // Event handlers
  const handleVote = (commentId: string, voteType: 'upvote' | 'downvote') => {
    if (voteType === 'upvote') {
      upvoteComment(commentId)
    } else {
      downvoteComment(commentId)
    }
  }

  const handleSubmitComment = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newComment.trim()) return

    createComment(
      { content: newComment },
      {
        onSuccess: () => {
          setNewComment('')
        },
      }
    )
  }

  const handleSubmitReply = (parentId: string) => {
    if (!replyText.trim()) return

    createComment(
      { content: replyText, parentId },
      {
        onSuccess: () => {
          setReplyText('')
          setReplyingTo(null)
          setExpandedReplies((prev) => ({ ...prev, [parentId]: true }))
        },
      }
    )
  }

  const handleEditComment = (commentId: string, content: string) => {
    editCommentModal.setComment(commentId, content)
    editCommentModal.open()
  }

  const handleSaveEdit = (content: string) => {
    if (editCommentModal.commentId) {
      updateComment(
        { commentId: editCommentModal.commentId, content },
        {
          onSuccess: () => {
            editCommentModal.close()
            editCommentModal.clear()
          },
        }
      )
    }
  }

  const handleDeleteComment = (commentId: string) => {
    if (window.confirm('Are you sure you want to delete this comment?')) {
      deleteComment(commentId)
    }
  }

  // Load more replies for a specific comment
  const handleLoadReplies = async (commentId: string) => {
    setLoadingReplies((prev) => ({ ...prev, [commentId]: true }))
    try {
      await loadReplies(commentId)
      setExpandedReplies((prev) => ({ ...prev, [commentId]: true }))
    } catch (error) {
      console.error('Failed to load replies:', error)
    } finally {
      setLoadingReplies((prev) => ({ ...prev, [commentId]: false }))
    }
  }

  // Helper function to find parent comment for flattened replies
  const findParentComment = (
    parentId: string,
    allComments: Comment[]
  ): Comment | null => {
    for (const comment of allComments) {
      if (comment._id === parentId) return comment
      if (comment.replies && comment.replies.length > 0) {
        const found = findParentComment(parentId, comment.replies)
        if (found) return found
      }
    }
    return null
  }

  // finds the time of comment creation and formats it
  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInHours = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60)
    )

    if (diffInHours < 1)
      return `${Math.floor((now.getTime() - date.getTime()) / (1000 * 60))}m`
    if (diffInHours < 24) return `${diffInHours}h`
    return `${Math.floor(diffInHours / 24)}d`
  }

  const getScoreColor = (upvotes: number, downvotes: number) => {
    const score = upvotes - downvotes
    if (score > 0) return 'text-green-600'
    if (score < 0) return 'text-red-600'
    return 'text-gray-500'
  }
  const renderComment = (comment: Comment, isReply = false, depth = 0) => {
    return (
      <div
        key={comment._id}
        className="px-6 py-4 border-b border-gray-200" // Consistent styling for ALL comments
      >
        {/* Reply context for ALL replies */}
        {depth > 0 && comment.parentId && (
          <div className="text-xs text-gray-500 mb-2 flex items-center bg-gray-50 px-2 py-1 rounded">
            <svg
              className="w-3 h-3 mr-1 text-gray-400"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M7.707 3.293a1 1 0 010 1.414L5.414 7H11a7 7 0 717 7v2a1 1 0 11-2 0v-2a5 5 0 00-5-5H5.414l2.293 2.293a1 1 0 11-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
            <span>
              Replying to{' '}
              <span className="font-medium text-gray-700">
                @
                {findParentComment(comment.parentId, comments)?.authorId
                  .displayName || 'unknown'}
              </span>
            </span>
          </div>
        )}

        <div className="flex space-x-3">
          {/* Vote buttons */}
          <div className="flex flex-col items-center space-y-1 flex-shrink-0">
            <button
              onClick={() => handleVote(comment._id, 'upvote')}
              disabled={isVoting}
              className={`p-1 rounded hover:bg-gray-100 disabled:opacity-50 transition-colors ${
                user && comment.upvotes.includes(user.id)
                  ? 'text-orange-500'
                  : 'text-gray-400'
              }`}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            <span
              className={`text-xs font-medium ${getScoreColor(
                comment.upvotes.length,
                comment.downvotes.length
              )}`}
            >
              {comment.upvotes.length - comment.downvotes.length}
            </span>
            <button
              onClick={() => handleVote(comment._id, 'downvote')}
              disabled={isVoting}
              className={`p-1 rounded hover:bg-gray-100 disabled:opacity-50 transition-colors ${
                user && comment.downvotes.includes(user.id)
                  ? 'text-zinc-500'
                  : 'text-gray-400'
              }`}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.707 10.293a1 1 0 010 1.414l-6 6a1 1 0 01-1.414 0l-6-6a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l4.293-4.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2 text-sm text-gray-500 mb-2">
              <span className="font-medium text-gray-900">
                {comment.authorId.displayName}
              </span>
              <span>•</span>
              <span>{formatTimeAgo(comment.createdAt)}</span>
            </div>

            <p className="text-gray-800 text-sm leading-relaxed mb-3">
              {comment.isDeleted ? '[deleted]' : comment.content}
            </p>

            <div className="flex items-center space-x-4 text-xs text-gray-500">
              {!comment.isDeleted && (
                <button
                  onClick={() => setReplyingTo(comment._id)}
                  className="hover:text-gray-700 font-medium transition-colors"
                >
                  Reply
                </button>
              )}

              {comment.authorId._id === user?.id && !comment.isDeleted && (
                <>
                  <button
                    onClick={() =>
                      handleEditComment(comment._id, comment.content)
                    }
                    className="hover:text-gray-700 font-medium transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteComment(comment._id)}
                    disabled={isDeleting}
                    className="hover:text-red-600 font-medium disabled:opacity-50 transition-colors"
                  >
                    Delete
                  </button>
                </>
              )}

              {/* Show/Hide replies button */}
              {comment.directReplyCount > 0 && (
                <button
                  onClick={() => {
                    if (!expandedReplies[comment._id] && !comment.replies) {
                      handleLoadReplies(comment._id)
                    } else {
                      setExpandedReplies((prev) => ({
                        ...prev,
                        [comment._id]: !prev[comment._id],
                      }))
                    }
                  }}
                  disabled={loadingReplies[comment._id]}
                  className="hover:text-zinc-600 font-medium flex items-center space-x-1 disabled:opacity-50 transition-colors"
                >
                  {loadingReplies[comment._id] ? (
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-500" />
                  ) : (
                    <svg
                      className={`w-3 h-3 transform transition-transform ${
                        expandedReplies[comment._id] ? 'rotate-90' : ''
                      }`}
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                  <span>
                    {expandedReplies[comment._id] ? 'Hide' : 'Show'}{' '}
                    {comment.directReplyCount} replies
                  </span>
                </button>
              )}
            </div>

            {/* Reply form */}
            {replyingTo === comment._id && (
              <div className="mt-4 bg-gray-50 p-3 rounded-lg">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={`Write a reply to ${comment.authorId.displayName}...`}
                  className="w-full p-2 border border-gray-300 rounded text-sm resize-none focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:border-transparent transition-colors"
                  rows={2}
                />
                <div className="flex space-x-2 mt-2">
                  <button
                    onClick={() => handleSubmitReply(comment._id)}
                    disabled={isCreating}
                    className="px-3 py-1 bg-zinc-600 text-white text-xs rounded hover:bg-zinc-700 disabled:opacity-50 transition-colors"
                  >
                    {isCreating ? 'Posting...' : 'Reply'}
                  </button>
                  <button
                    onClick={() => {
                      setReplyingTo(null)
                      setReplyText('')
                    }}
                    className="px-3 py-1 bg-gray-300 text-gray-700 text-xs rounded hover:bg-gray-400 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Flatten all comments into a single array
  const flattenComments = (comments: Comment[]): Comment[] => {
    const flattened: Comment[] = []

    const addComment = (comment: Comment, depth: number = 0) => {
      flattened.push({ ...comment, depth })

      if (expandedReplies[comment._id] && comment.replies) {
        comment.replies.forEach((reply) => addComment(reply, depth + 1))
      }
    }

    comments.forEach((comment) => addComment(comment))
    return flattened
  }

  // Error state
  if (isError) {
    return (
      <div className="bg-white border-gray-200">
        <div className="px-6 py-4 text-center text-zinc-600">
          Error loading comments. Please try again.
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="bg-white border-gray-200 h-full overflow-y-auto">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-900">
              Comments ({totalComments})
            </h2>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as any)}
              className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-zinc-500"
            >
              <option value="best">Best</option>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="controversial">Controversial</option>
            </select>
          </div>
        </div>

        {/* Add Comment Form */}
        <div className="px-6 py-4 border-b border-gray-200 bg-white sticky top-0 z-10">
          <form onSubmit={handleSubmitComment}>
            <div className="flex space-x-3">
              <div className="flex-1">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add a comment..."
                  className="w-full p-3 border border-gray-300 rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:border-transparent"
                  rows={3}
                />
                <div className="flex justify-end items-center mt-2">
                  <button
                    type="submit"
                    disabled={!newComment.trim() || isCreating}
                    className="px-4 py-2 bg-zinc-600 text-white text-sm rounded-md hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isCreating ? 'Posting...' : 'Comment'}
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>

        {/* Comments List - COMPLETELY FLAT */}
        {isLoading && comments.length === 0 ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-zinc-600 mx-auto"></div>
          </div>
        ) : (
          <div>
            {flattenComments(comments).map((comment) =>
              renderComment(comment, comment.depth > 0, comment.depth)
            )}

            {/* Infinite scroll trigger */}
            <div ref={loadMoreRef} className="py-4">
              {isFetchingNextPage && (
                <div className="text-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-zinc-600 mx-auto"></div>
                  <p className="text-sm text-gray-500 mt-2">
                    Loading more comments...
                  </p>
                </div>
              )}
              {!hasNextPage && comments.length > 0 && (
                <div className="text-center py-4">
                  <p className="text-sm text-gray-500">
                    You've reached the end! 🎉
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && comments.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">
              <svg
                className="w-12 h-12 mx-auto"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No comments yet
            </h3>
            <p className="text-gray-500 mb-4">
              Be the first to share your thoughts!
            </p>
          </div>
        )}
      </div>

      {/* Edit Comment Modal */}
      <EditCommentModal
        isOpen={editCommentModal.isOpen}
        onClose={() => {
          editCommentModal.close()
          editCommentModal.clear()
        }}
        onSave={handleSaveEdit}
        initialContent={editCommentModal.content}
        isLoading={isUpdating}
      />
    </>
  )
}
