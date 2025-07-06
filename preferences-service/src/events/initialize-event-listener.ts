import { SUBSCRIPTIONS, TOPICS } from '@groovy-streaming/common'
import { PubSubManager } from '../config/PubSub'
import { UserServiceEventHandlers } from './user-service-events-handler'
import { SongServiceEventHandlers } from './songs-service-events-handler'

type EventType = 'USER' | 'SONG' | 'PLAYLIST' | 'COMMENT' | 'STATS'

export async function initializeEventListeners(
  listenTo: EventType[] = ['USER', 'SONG']
): Promise<void> {
  try {
    const connected = await PubSubManager.testConnection()
    if (!connected) {
      throw new Error(
        'Connection to PubSubManager failed..make sure the pubsub connection is established'
      )
    }

    //Subscribing to user events
    if (listenTo.includes('USER')) {
      await PubSubManager.subscribe(
        TOPICS.USER_EVENTS,
        SUBSCRIPTIONS.AUTH_SERVICE_USER_EVENTS,
        UserServiceEventHandlers.handleUserServiceEvents
      )
      console.log('# user-auth-service Event listener initialized successfully')
    }
    if (listenTo.includes('SONG')) {
      await PubSubManager.subscribe(
        TOPICS.SONG_EVENTS,
        SUBSCRIPTIONS.COMMENTS_SERVICE_SONG_EVENTS,
        SongServiceEventHandlers.handleSongsServiceEvent
      )
      console.log('# songs-service Event listener initialized successfully')
    }

    // Add more event listeners as needed
  } catch (error) {
    console.error('# Failed to initialize event listeners:', error)
    throw error
  }
}

export async function closeEventListeners(): Promise<void> {
  await PubSubManager.close()
}
