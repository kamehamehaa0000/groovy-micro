import type React from 'react'
import { useState, useEffect } from 'react'

interface Comment {
  id: string
  content: string
  authorId: {
    id: string
    displayName: string
  }
  entityType: string
  entityId: string
  parentId?: string
  upvotes: string[]
  downvotes: string[]
  createdAt: string
  updatedAt: string
}

interface Reply extends Comment {
  parentId: string
}

// Version 3: Compact Threaded Comments (GitHub/Forum style)
export default function CompactComments() {
  const [comments, setComments] = useState<Comment[]>([])
  const [replies, setReplies] = useState<{ [key: string]: Reply[] }>({})
  const [newComment, setNewComment] = useState('')
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [editingComment, setEditingComment] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [expandedReplies, setExpandedReplies] = useState<{
    [key: string]: boolean
  }>({})
  const [loading, setLoading] = useState(false)
  const [currentUser] = useState({ id: 'user123', displayName: 'Current User' })

  const fetchComments = async () => {
    setLoading(true)
    const mockComments: Comment[] = [
      {
        id: '1',
        content:
          'This song is absolutely amazing! The melody really captures the emotion.',
        authorId: { id: 'user1', displayName: 'MusicLover42' },
        entityType: 'SONG',
        entityId: 'song123',
        upvotes: ['user2', 'user3'],
        downvotes: [],
        createdAt: '2024-01-15T10:30:00Z',
        updatedAt: '2024-01-15T10:30:00Z',
      },
      {
        id: '2',
        content: 'I disagree, I think the production could be better.',
        authorId: { id: 'user2', displayName: 'CriticalEar' },
        entityType: 'SONG',
        entityId: 'song123',
        upvotes: ['user1'],
        downvotes: ['user3'],
        createdAt: '2024-01-15T11:15:00Z',
        updatedAt: '2024-01-15T11:15:00Z',
      },
    ]

    const mockReplies: { [key: string]: Reply[] } = {
      '1': [
        {
          id: '3',
          content:
            'Totally agree! The guitar solo at 2:30 gives me chills every time.',
          authorId: { id: 'user3', displayName: 'GuitarFan' },
          entityType: 'SONG',
          entityId: 'song123',
          parentId: '1',
          upvotes: ['user1'],
          downvotes: [],
          createdAt: '2024-01-15T10:45:00Z',
          updatedAt: '2024-01-15T10:45:00Z',
        },
      ],
    }

    setComments(mockComments)
    setReplies(mockReplies)
    setLoading(false)
  }

  useEffect(() => {
    fetchComments()
  }, [])

  const handleVote = async (
    commentId: string,
    voteType: 'upvote' | 'downvote',
    isReply = false,
    parentId?: string
  ) => {
    const updateVotes = (comment: Comment) => {
      const newComment = { ...comment }
      const userId = currentUser.id

      if (voteType === 'upvote') {
        const hasUpvoted = newComment.upvotes.includes(userId)
        const hasDownvoted = newComment.downvotes.includes(userId)

        if (hasUpvoted) {
          newComment.upvotes = newComment.upvotes.filter((id) => id !== userId)
        } else {
          newComment.upvotes = [...newComment.upvotes, userId]
          if (hasDownvoted) {
            newComment.downvotes = newComment.downvotes.filter(
              (id) => id !== userId
            )
          }
        }
      } else {
        const hasDownvoted = newComment.downvotes.includes(userId)
        const hasUpvoted = newComment.upvotes.includes(userId)

        if (hasDownvoted) {
          newComment.downvotes = newComment.downvotes.filter(
            (id) => id !== userId
          )
        } else {
          newComment.downvotes = [...newComment.downvotes, userId]
          if (hasUpvoted) {
            newComment.upvotes = newComment.upvotes.filter(
              (id) => id !== userId
            )
          }
        }
      }

      return newComment
    }

    if (isReply && parentId) {
      setReplies((prev) => ({
        ...prev,
        [parentId]:
          prev[parentId]?.map((reply) =>
            reply.id === commentId ? (updateVotes(reply) as Reply) : reply
          ) || [],
      }))
    } else {
      setComments((prev) =>
        prev.map((comment) =>
          comment.id === commentId ? updateVotes(comment) : comment
        )
      )
    }
  }

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newComment.trim()) return

    const comment: Comment = {
      id: Date.now().toString(),
      content: newComment,
      authorId: currentUser,
      entityType: 'SONG',
      entityId: 'song123',
      upvotes: [],
      downvotes: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    setComments((prev) => [comment, ...prev])
    setNewComment('')
  }

  const handleSubmitReply = async (parentId: string) => {
    if (!replyText.trim()) return

    const reply: Reply = {
      id: Date.now().toString(),
      content: replyText,
      authorId: currentUser,
      entityType: 'SONG',
      entityId: 'song123',
      parentId,
      upvotes: [],
      downvotes: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    setReplies((prev) => ({
      ...prev,
      [parentId]: [...(prev[parentId] || []), reply],
    }))
    setReplyingTo(null)
    setReplyText('')
    setExpandedReplies((prev) => ({ ...prev, [parentId]: true }))
  }

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInHours = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60)
    )

    if (diffInHours < 1) return 'now'
    if (diffInHours < 24) return `${diffInHours}h`
    return `${Math.floor(diffInHours / 24)}d`
  }

  const getScoreColor = (upvotes: number, downvotes: number) => {
    const score = upvotes - downvotes
    if (score > 0) return 'text-green-600'
    if (score < 0) return 'text-red-600'
    return 'text-gray-500'
  }

  return (
    <div className="bg-white  border-gray-200">
      <div className="border-b border-gray-200 px-6 py-4">
        <h2 className="text-xl font-semibold text-gray-900">
          Comments ({comments.length})
        </h2>
      </div>

      {/* Add Comment Form */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white">
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
                  disabled={!newComment.trim()}
                  className="px-4 py-2 bg-zinc-600 text-white text-sm rounded-md hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Comment
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>

      {/* Comments List */}
      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-zinc-600 mx-auto"></div>
        </div>
      ) : (
        <div className="divide-y divide-gray-200">
          {comments.map((comment) => (
            <div key={comment.id} className="px-6 py-4">
              <div className="flex space-x-3">
                {/* Vote buttons */}
                <div className="flex flex-col items-center space-y-1 flex-shrink-0">
                  <button
                    onClick={() => handleVote(comment.id, 'upvote')}
                    className={`p-1 rounded hover:bg-gray-100 ${
                      comment.upvotes.includes(currentUser.id)
                        ? 'text-orange-500'
                        : 'text-gray-400'
                    }`}
                  >
                    <svg
                      className="w-4 h-4"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
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
                    onClick={() => handleVote(comment.id, 'downvote')}
                    className={`p-1 rounded hover:bg-gray-100 ${
                      comment.downvotes.includes(currentUser.id)
                        ? 'text-zinc-500'
                        : 'text-gray-400'
                    }`}
                  >
                    <svg
                      className="w-4 h-4"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
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
                    {comment.updatedAt !== comment.createdAt && (
                      <>
                        <span>•</span>
                        <span className="italic">edited</span>
                      </>
                    )}
                  </div>

                  {editingComment === comment.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded text-sm resize-none focus:outline-none focus:ring-2 focus:ring-zinc-500"
                        rows={2}
                      />
                      <div className="flex space-x-2">
                        <button
                          onClick={() => {
                            setComments((prev) =>
                              prev.map((c) =>
                                c.id === comment.id
                                  ? {
                                      ...c,
                                      content: editText,
                                      updatedAt: new Date().toISOString(),
                                    }
                                  : c
                              )
                            )
                            setEditingComment(null)
                            setEditText('')
                          }}
                          className="px-3 py-1 bg-zinc-600 text-white text-xs rounded hover:bg-zinc-700"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setEditingComment(null)
                            setEditText('')
                          }}
                          className="px-3 py-1 bg-gray-300 text-gray-700 text-xs rounded hover:bg-gray-400"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-800 text-sm leading-relaxed mb-3">
                      {comment.content}
                    </p>
                  )}

                  <div className="flex items-center space-x-4 text-xs text-gray-500">
                    <button
                      onClick={() => setReplyingTo(comment.id)}
                      className="hover:text-gray-700 font-medium"
                    >
                      Reply
                    </button>

                    {comment.authorId.id === currentUser.id && (
                      <button
                        onClick={() => {
                          setEditingComment(comment.id)
                          setEditText(comment.content)
                        }}
                        className="hover:text-gray-700 font-medium"
                      >
                        Edit
                      </button>
                    )}

                    {replies[comment.id] && replies[comment.id].length > 0 && (
                      <button
                        onClick={() =>
                          setExpandedReplies((prev) => ({
                            ...prev,
                            [comment.id]: !prev[comment.id],
                          }))
                        }
                        className="hover:text-zinc-600 font-medium flex items-center space-x-1"
                      >
                        <svg
                          className={`w-3 h-3 transform transition-transform ${
                            expandedReplies[comment.id] ? 'rotate-90' : ''
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
                        <span>{replies[comment.id].length} replies</span>
                      </button>
                    )}
                  </div>

                  {replyingTo === comment.id && (
                    <div className="mt-4 ml-4 border-l-2 border-gray-200 pl-4">
                      <div className="flex space-x-3">
                        <div className="flex-1">
                          <textarea
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder="Write a reply..."
                            className="w-full p-2 border border-gray-300 rounded text-sm resize-none focus:outline-none focus:ring-2 focus:ring-zinc-500"
                            rows={2}
                          />
                          <div className="flex space-x-2 mt-2">
                            <button
                              onClick={() => handleSubmitReply(comment.id)}
                              className="px-3 py-1 bg-zinc-600 text-white text-xs rounded hover:bg-zinc-700"
                            >
                              Reply
                            </button>
                            <button
                              onClick={() => {
                                setReplyingTo(null)
                                setReplyText('')
                              }}
                              className="px-3 py-1 bg-gray-300 text-gray-700 text-xs rounded hover:bg-gray-400"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Replies */}
                  {expandedReplies[comment.id] && replies[comment.id] && (
                    <div className="mt-4 ml-4 border-l-2 border-gray-200 pl-4 space-y-4">
                      {replies[comment.id].map((reply) => (
                        <div key={reply.id} className="flex space-x-3">
                          <div className="flex flex-col items-center space-y-1 flex-shrink-0">
                            <button
                              onClick={() =>
                                handleVote(reply.id, 'upvote', true, comment.id)
                              }
                              className={`p-1 rounded hover:bg-gray-100 ${
                                reply.upvotes.includes(currentUser.id)
                                  ? 'text-orange-500'
                                  : 'text-gray-400'
                              }`}
                            >
                              <svg
                                className="w-3 h-3"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            </button>
                            <span
                              className={`text-xs font-medium ${getScoreColor(
                                reply.upvotes.length,
                                reply.downvotes.length
                              )}`}
                            >
                              {reply.upvotes.length - reply.downvotes.length}
                            </span>
                            <button
                              onClick={() =>
                                handleVote(
                                  reply.id,
                                  'downvote',
                                  true,
                                  comment.id
                                )
                              }
                              className={`p-1 rounded hover:bg-gray-100 ${
                                reply.downvotes.includes(currentUser.id)
                                  ? 'text-zinc-500'
                                  : 'text-gray-400'
                              }`}
                            >
                              <svg
                                className="w-3 h-3"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M16.707 10.293a1 1 0 010 1.414l-6 6a1 1 0 01-1.414 0l-6-6a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l4.293-4.293a1 1 0 011.414 0z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            </button>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2 text-xs text-gray-500 mb-1">
                              <span className="font-medium text-gray-900">
                                {reply.authorId.displayName}
                              </span>
                              <span>•</span>
                              <span>{formatTimeAgo(reply.createdAt)}</span>
                            </div>
                            <p className="text-gray-800 text-sm leading-relaxed">
                              {reply.content}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
