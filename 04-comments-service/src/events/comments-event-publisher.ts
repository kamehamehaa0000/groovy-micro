import { PubSubManager } from '../config/PubSub'
import { BaseEvent, EventTypes, TOPICS } from '@groovy-streaming/common'
import { CommentEntityEnum } from '../models/Comment.model'

interface CommentCreatedEventData {
  commentId: string
  content: string
  authorId: string
  entityType: CommentEntityEnum
  entityId: string
  parentId: string
  upvotes: string[]
  downvotes: string[]
}
interface CommentUpdatedEventData {
  commentId: string
  content: string
  authorId: string
  entityType: CommentEntityEnum
  entityId: string
  parentId: string
  upvotes: string[]
  downvotes: string[]
}
interface CommentDeletedEventData {
  commentId: string
}

export class CommentsServiceEventPublisher {
  static async CommentCreatedEvent({
    commentId,
    content,
    authorId,
    entityType,
    entityId,
    parentId,
    upvotes,
    downvotes,
  }: CommentCreatedEventData): Promise<void> {
    const event: BaseEvent = {
      eventType: EventTypes.COMMENT_CREATED,
      eventId: `${EventTypes.COMMENT_CREATED}-${commentId}-${Date.now()}`,
      data: {
        commentId,
        content,
        authorId,
        entityType,
        entityId,
        parentId,
        upvotes,
        downvotes,
      },
      metadata: {
        correlationId: `${commentId}-${Date.now()}`,
        source: 'comments-service',
      },
    }
    try {
      await PubSubManager.publishEvent(TOPICS.COMMENT_EVENTS, event)
    } catch (error) {
      console.error('Error publishing comment created event:', error)
    }
  }

  static async CommentUpdatedEvent({
    commentId,
    content,
  }: CommentUpdatedEventData): Promise<void> {
    const event: BaseEvent = {
      eventType: EventTypes.COMMENT_UPDATED,
      eventId: `${EventTypes.COMMENT_UPDATED}-${commentId}-${Date.now()}`,
      data: {
        commentId,
        content,
      },
      metadata: {
        correlationId: `${commentId}-${Date.now()}`,
        source: 'comments-service',
      },
    }
    try {
      await PubSubManager.publishEvent(TOPICS.COMMENT_EVENTS, event)
    } catch (error) {
      console.error('Error publishing comment updated event:', error)
    }
  }
  static async CommentDeletedEvent({
    commentId,
  }: CommentDeletedEventData): Promise<void> {
    const event: BaseEvent = {
      eventType: EventTypes.COMMENT_DELETED,
      eventId: `${EventTypes.COMMENT_DELETED}-${commentId}-${Date.now()}`,
      data: {
        commentId,
      },
      metadata: {
        correlationId: `${commentId}-${Date.now()}`,
        source: 'comments-service',
      },
    }
    try {
      await PubSubManager.publishEvent(TOPICS.COMMENT_EVENTS, event)
    } catch (error) {
      console.error('Error publishing comment deleted event:', error)
    }
  }
}
