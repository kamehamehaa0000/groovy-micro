import { SUBSCRIPTIONS, TOPICS } from '@groovy-streaming/common'
import { PubSubManager } from '../config/PubSub'
import { UserServiceEventHandlers } from './user-events-handler'
import { SongEventHandler } from './song-event-handler'

type EventType = 'USER' | 'SONG'

export async function initializeEventListeners(
  listenTo: EventType[] = ['USER']
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
      console.log('# User Event listener initialized successfully')
    }
    if (listenTo.includes('SONG')) {
      await PubSubManager.subscribe(
        TOPICS.SONG_EVENTS,
        SUBSCRIPTIONS.SONGS_SERVICE_PREFERENCES_AND_ANALYTICS_EVENTS,
        SongEventHandler.handleSongEvents
      )
      console.log('# Song Event listener initialized successfully')
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
