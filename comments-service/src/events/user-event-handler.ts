import User from '../models/User.model'
import { BaseEvent, EventTypes } from '@groovy-streaming/common'

export class UserServiceEventHandlers {
  // Handle any user event
  static async handleUserServiceEvents(event: BaseEvent): Promise<void> {
    console.log(`🎯 Processing event: ${event.eventType}`)

    switch (event.eventType) {
      case EventTypes.USER_CREATED:
        await UserServiceEventHandlers.handleUserCreated(
          event.data as UserCreatedEvent
        )
        break

      case EventTypes.USER_DELETED:
        await UserServiceEventHandlers.handleUserDeleted(
          event.data as UserDeletedEvent
        )
        break

      case EventTypes.USER_UPDATED:
        await UserServiceEventHandlers.handleUserUpdated(
          event.data as UserUpdatedEvent
        )
        break

      default:
        console.log(`🤷‍♂️ Unknown event type: ${event.eventType}`)
    }
  }

  static handleUserCreated = async (
    eventData: UserCreatedEvent
  ): Promise<void> => {
    try {
      await User.create({
        _id: eventData.userId,
        email: eventData.email,
        displayName: eventData.displayName,
        googleId: eventData.googleId,
      })
    } catch (error: any) {
      if (error.code === 11000) {
        console.log(`ℹ️ User ${eventData.userId} already exists - this is OK`) // Duplicate key error - user already exists
        // DON'T throw - acknowledge message (user creation succeeded in the past)
        return
      } else if (error.name === 'ValidationError') {
        console.error(
          `❌ Validation error creating user ${eventData.userId}:`,
          error.message
        )
        return
      }
      throw error
    }
  }

  static handleUserUpdated = async (event: UserUpdatedEvent): Promise<void> => {
    try {
      if (event.displayName) {
        const user = await User.findById(event.userId)
        if (!user) {
          console.error(`❌ User ${event.userId} not found for update`)
          return
        }
        user.displayName = event.displayName
        await user.save()
      }
    } catch (error) {
      console.error(
        `❌ Error updating user ${event.userId}:`,
        error instanceof Error ? error.message : error
      )
      // not rethrowing to avoid message reprocessing
      // This is a non-critical operation, so we log the error and return
      return
    }
  }

  static handleUserDeleted = async (event: UserDeletedEvent): Promise<void> => {
    console.log(`🗑️ User deleted: ${event.userId}`)
  }
}

export interface UserCreatedEvent {
  userId: string
  email: string
  displayName: string
  googleId?: string
}

export interface UserUpdatedEvent {
  userId: string
  displayName?: string
  updatedFields: string[]
}

export interface UserDeletedEvent {
  userId: string
}
