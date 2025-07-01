import { SUBSCRIPTIONS, TOPICS } from '@groovy-streaming/common'
import { PubSubManager } from '../config/PubSub'
import { UserEventHandlers } from './user-event-handler'

export async function initializeEventListeners(): Promise<void> {
  try {
    console.log('🎧 Initializing event listeners...')

    // Test connection first
    const connected = await PubSubManager.testConnection()
    if (!connected) {
      throw new Error('Failed to connect to PubSub')
    }

    await PubSubManager.subscribe(
      TOPICS.USER_EVENTS,
      SUBSCRIPTIONS.AUTH_SERVICE_USER_EVENTS,
      UserEventHandlers.handleUserEvent
    )

    console.log('✅ Event listeners initialized!')
  } catch (error) {
    console.error('❌ Failed to initialize event listeners:', error)
    throw error
  }
}

export async function closeEventListeners(): Promise<void> {
  await PubSubManager.close()
}
