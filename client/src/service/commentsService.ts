import axiosInstance from '../utils/axios-interceptor'
const API_BASE_URL = `${import.meta.env.VITE_API_GATEWAY_URL}/comments`
interface CreateCommentData {
  content: string
  entityType: string
  entityId: string
  parentId?: string
}
interface GetCommentsParams {
  page?: number
  limit?: number
  sort?: 'newest' | 'oldest' | 'best' | 'controversial'
  loadReplies?: boolean
}

interface GetRepliesParams {
  page?: number
  limit?: number
}

export const getComments = async (
  entityType: string,
  entityId: string,
  params: GetCommentsParams = {}
) => {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.append('page', params.page.toString())
  if (params.limit) searchParams.append('limit', params.limit.toString())
  if (params.sort) searchParams.append('sort', params.sort)
  if (params.loadReplies)
    searchParams.append('loadReplies', params.loadReplies.toString())
  const queryString = searchParams.toString()

  const response = await axiosInstance.get(
    `${API_BASE_URL}/get/${entityType}/${entityId}${
      queryString ? `?${queryString}` : ''
    }`
  )
  return response.data
}

export const createComment = async (data: CreateCommentData) => {
  const response = await axiosInstance.post(`${API_BASE_URL}/create`, {
    ...data,
  })
  return response.data
}

export const updateComment = async (commentId: string, content: string) => {
  const response = await axiosInstance.put(
    `${API_BASE_URL}/update/${commentId}`,
    {
      content,
    }
  )
  return response.data
}

export const deleteComment = async (commentId: string) => {
  const response = await axiosInstance.delete(
    `${API_BASE_URL}/delete/${commentId}`
  )
  return response.data
}

export const upvoteComment = async (commentId: string) => {
  const response = await axiosInstance.post(
    `${API_BASE_URL}/upvote/comment/${commentId}`
  )
  return response.data
}

export const downvoteComment = async (commentId: string) => {
  const response = await axiosInstance.post(
    `${API_BASE_URL}/downvote/comment/${commentId}`
  )
  return response.data
}

export const getReplies = async (
  commentId: string,
  params: GetRepliesParams = {}
) => {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.append('page', params.page.toString())
  if (params.limit) searchParams.append('limit', params.limit.toString())
  const queryString = searchParams.toString()

  const response = await axiosInstance.get(
    `${API_BASE_URL}/get/replies/comment/${commentId}${
      queryString ? `?${queryString}` : ''
    }`
  )
  return response.data
}

export const getThread = async (commentId: string, maxDepth?: number) => {
  const searchParams = new URLSearchParams()
  if (maxDepth) searchParams.append('maxDepth', maxDepth.toString())

  const response = await axiosInstance.get(
    `${API_BASE_URL}/thread/${commentId}${
      searchParams.toString() ? `?${searchParams.toString()}` : ''
    }`
  )
  return response.data
}
