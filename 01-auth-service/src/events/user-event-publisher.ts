import { EventTypes, TOPICS, BaseEvent } from '@groovy-streaming/common'
import { PubSubManager } from '../config/PubSub'

export class UserEventPublisher {
  static async UserCreatedEvent(
    userId: string,
    email: string,
    displayName: string,
    googleId?: string
  ): Promise<void> {
    const event: BaseEvent = {
      eventType: EventTypes.USER_CREATED,
      eventId: `${EventTypes.USER_CREATED}-${userId}-${Date.now()}`,
      data: {
        userId,
        email,
        displayName,
        googleId,
      },
      metadata: {
        correlationId: `${userId}-${Date.now()}`,
        source: 'auth-service',
      },
    }
    try {
      await PubSubManager.publishEvent(TOPICS.USER_EVENTS, event)
    } catch (error) {
      console.error('Error publishing user created event:', error)
    }
  }

  static async UserUpdatedEvent(
    userId: string,
    displayName?: string,
    updatedFields: string[] = []
  ): Promise<void> {
    const event: BaseEvent = {
      eventType: EventTypes.USER_UPDATED,
      eventId: `${EventTypes.USER_UPDATED}-${userId}-${Date.now()}`,
      data: {
        userId,
        displayName,
        updatedFields,
      },
      metadata: {
        correlationId: `${userId}-${Date.now()}`,
        source: 'auth-service',
      },
    }
    try {
      await PubSubManager.publishEvent(TOPICS.USER_EVENTS, event)
    } catch (error) {
      console.error('Error publishing user updated event:', error)
    }
  }
}
