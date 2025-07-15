import axiosInstance from '../utils/axios-interceptor'
const API_BASE_URL = `${import.meta.env.VITE_API_GATEWAY_URL}/api/comments`

export const getCommentsForEntity = async (
  entityType: 'song' | 'album' | 'playlist',
  entityId: string,
  page = 1,
  limit = 20
) => {
  try {
    const response = await axiosInstance.get(
      `${API_BASE_URL}/get/${entityType}/${entityId}`,
      {
        params: { page, limit },
      }
    )
    return response.data
  } catch (error) {
    throw error
  }
}

export const addComment = async (
  entityType: 'song' | 'album' | 'playlist',
  entityId: string,
  content: string,
  parentId?: string
) => {
  try {
    const response = await axiosInstance.post(`${API_BASE_URL}/create`, {
      entityType,
      entityId,
      content,
      parentId: parentId || null,
    })
    return response.data
  } catch (error) {
    throw error
  }
}

export const updateComment = async (commentId: string, content: string) => {
  try {
    const response = await axiosInstance.patch(
      `${API_BASE_URL}/update/${commentId}`,
      {
        content,
      }
    )
    return response.data
  } catch (error) {
    throw error
  }
}
export const deleteComment = async (commentId: string) => {
  try {
    const response = await axiosInstance.delete(
      `${API_BASE_URL}/delete/${commentId}`
    )
    return response.data
  } catch (error) {
    throw error
  }
}
export const upvoteComment = async (commentId: string) => {
  try {
    const response = await axiosInstance.post(
      `${API_BASE_URL}/upvote/${commentId}`
    )
    return response.data
  } catch (error) {
    throw error
  }
}
export const downvoteComment = async (commentId: string) => {
  try {
    const response = await axiosInstance.post(
      `${API_BASE_URL}/downvote/${commentId}`
    )
    return response.data
  } catch (error) {
    throw error
  }
}
