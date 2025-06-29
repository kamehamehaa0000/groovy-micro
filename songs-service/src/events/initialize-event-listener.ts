import { Subscriptions, TOPICS } from './events'
import { pubSubManager } from './pub-sub-manager'
import { UserEventHandlers } from './user-event-handler'

export async function initializeEventListeners(): Promise<void> {
  try {
    console.log('🎧 Initializing event listeners...')

    // Test connection first
    const connected = await pubSubManager.testConnection()
    if (!connected) {
      throw new Error('Failed to connect to PubSub')
    }

    await pubSubManager.subscribe(
      TOPICS.USER_EVENTS,
      Subscriptions.AUTH_SERVICE_USER_EVENTS,
      UserEventHandlers.handleUserEvent
    )

    console.log('✅ Event listeners initialized!')
  } catch (error) {
    console.error('❌ Failed to initialize event listeners:', error)
    throw error
  }
}

export async function closeEventListeners(): Promise<void> {
  await pubSubManager.close()
}
