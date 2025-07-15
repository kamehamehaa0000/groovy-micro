import { User } from '../models/User.model'
import {
  UserDeletedEventData,
  UserCreatedEventData,
  UserUpdatedEventData,
  EventTypes,
  BaseEvent,
} from '@groovy-streaming/common'

export class UserServiceEventHandlers {
  // Handle any user event
  static async handleUserServiceEvents(event: BaseEvent): Promise<void> {
    switch (event.eventType) {
      case EventTypes.USER_CREATED:
        await UserServiceEventHandlers.handleUserCreated(
          event.data as UserCreatedEventData
        )
        break

      case EventTypes.USER_DELETED:
        await UserServiceEventHandlers.handleUserDeleted(
          event.data as UserDeletedEventData
        )
        break

      case EventTypes.USER_UPDATED:
        await UserServiceEventHandlers.handleUserUpdated(
          event.data as UserUpdatedEventData
        )
        break

      default:
        console.log(`🤷‍♂️ Unknown event type: ${event.eventType}`)
    }
  }

  static readonly handleUserCreated = async (
    eventData: UserCreatedEventData
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
        console.log(
          `Error- User ${eventData.userId} already exists - this is OK`
        )
        // DON'T throw - acknowledge message (user creation succeeded in the past)
        return
      } else if (error.name === 'ValidationError') {
        console.error(
          `Error(user-service-user-created-event) ${eventData.userId}:`,
          error.message
        )
        return
      }
      throw error
    }
  }

  static readonly handleUserUpdated = async (
    event: UserUpdatedEventData
  ): Promise<void> => {
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
        `Error(user-service-user-updated-event) ${event.userId}:${
          (error as Error).message
        }`
      )
      // not rethrowing to avoid message reprocessing
      // This is a non-critical operation, so we log the error and return
      return
    }
  }

  static readonly handleUserDeleted = async (
    event: UserDeletedEventData
  ): Promise<void> => {
    try {
      await User.findByIdAndDelete(event.userId)
    } catch (error) {
      console.error(
        `Error(user-service-user-deleted-event) ${event.userId}: ${
          (error as Error).message
        }`
      )
      return
    }
  }
}
