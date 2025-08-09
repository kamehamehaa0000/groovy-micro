import { SUBSCRIPTIONS, TOPICS } from '@groovy-streaming/common'
import { PubSubManager } from '../config/PubSub'
import { UserServiceEventHandlers } from './user-events-handler'
import { SongServiceEventHandlers } from './song-events-handler'

export async function initializeEventListeners(): Promise<void> {
  try {
    const connected = await PubSubManager.testConnection()
    if (!connected) {
      throw new Error(
        'Connection to PubSubManager failed..make sure the pubsub connection is established'
      )
    }

    // Subscribing to user events
    await PubSubManager.subscribe(
      TOPICS.USER_EVENTS,
      SUBSCRIPTIONS.COMMENTS_SERVICE_USER_EVENTS,
      UserServiceEventHandlers.handleUserServiceEvents
    )
    console.log('# user-auth-service Event listener initialized successfully')

    // Subscribing to song events
    await PubSubManager.subscribe(
      TOPICS.SONG_EVENTS,
      SUBSCRIPTIONS.COMMENTS_SERVICE_SONG_EVENTS,
      SongServiceEventHandlers.handleSongsServiceEvent
    )
    console.log('# songs-service Event listener initialized successfully')

    // Add more event listeners as needed
  } catch (error) {
    console.error('# Failed to initialize event listeners:', error)
    throw error
  }
}

export async function closeEventListeners(): Promise<void> {
  await PubSubManager.close()
}
