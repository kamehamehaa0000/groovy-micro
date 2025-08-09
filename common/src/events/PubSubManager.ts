import { PubSub, Message, Topic, Subscription } from '@google-cloud/pubsub'

export interface BaseEvent {
  eventType: string
  eventId: string
  data: any
  metadata?: {
    correlationId?: string
    userId?: string
    source: string
  }
}

export class PubSubManager {
  private pubSubClient: PubSub

  constructor(projectId?: string, keyFilename?: string) {
    this.pubSubClient = new PubSub({
      projectId: projectId,
      keyFilename: keyFilename,
    })
    console.log(`# PubSub initialized for project: ${projectId}`)
  }

  /**
   * Ensure a topic exists, create if it doesn't
   */
  async ensureTopicExists(topicName: string): Promise<Topic> {
    try {
      const topic = this.pubSubClient.topic(topicName)
      const [exists] = await topic.exists()

      if (exists) {
        console.log(`✅ Topic '${topicName}' already exists`)
        return topic
      } else {
        const [createdTopic] = await this.pubSubClient.createTopic(topicName)
        console.log(`🆕 Created topic: ${topicName}`)
        return createdTopic
      }
    } catch (error) {
      console.error(`❌ Error with topic ${topicName}:`, error)
      throw error
    }
  }

  /**
   * Ensure a subscription exists, create if it doesn't
   */
  async ensureSubscriptionExists(
    topicName: string,
    subscriptionName: string,
    options?: {
      ackDeadlineSeconds?: number
      messageRetentionDuration?: number
      enableMessageOrdering?: boolean
    }
  ): Promise<Subscription> {
    try {
      await this.ensureTopicExists(topicName)

      const subscription = this.pubSubClient.subscription(subscriptionName)
      const [exists] = await subscription.exists()

      if (exists) {
        console.log(`✅ Subscription '${subscriptionName}' already exists`)
        return subscription
      } else {
        const subscriptionOptions = {
          ackDeadlineSeconds: options?.ackDeadlineSeconds ?? 60,
          messageRetentionDuration: {
            seconds: options?.messageRetentionDuration ?? 604800, // 7 days
          },
          enableMessageOrdering: options?.enableMessageOrdering || false,
        }

        const [createdSubscription] = await this.pubSubClient
          .topic(topicName)
          .createSubscription(subscriptionName, subscriptionOptions)

        console.log(
          `🆕 Created subscription: ${subscriptionName} for topic: ${topicName}`
        )
        return createdSubscription
      }
    } catch (error) {
      console.error(`❌ Error with subscription ${subscriptionName}:`, error)
      throw error
    }
  }

  /**
   * Publish an event to a topic
   */
  async publishEvent<T extends BaseEvent>(
    topicName: string,
    event: T
  ): Promise<string> {
    try {
      const [topic] = await this.pubSubClient
        .topic(topicName)
        .get({ autoCreate: true })
      const messageBuffer = Buffer.from(JSON.stringify(event))

      const messageId = await topic.publishMessage({
        data: messageBuffer,
        attributes: {
          eventType: event.eventType,
          eventId: event.eventId,
          source: event.metadata?.source ?? 'unknown',
        },
      })

      console.log(
        `📤 Published event '${event.eventType}' to topic '${topicName}' with message ID: ${messageId}`
      )
      return messageId
    } catch (error) {
      console.error(`❌ Failed to publish event to ${topicName}:`, error)
      throw error
    }
  }

  /**
   * Subscribe to messages from a topic
   */
  async subscribe<T extends BaseEvent>(
    topicName: string,
    subscriptionName: string,
    handler: (event: T) => Promise<void> | void
  ): Promise<void> {
    try {
      const [topic] = await this.pubSubClient
        .topic(topicName)
        .get({ autoCreate: true })
      let subscription: Subscription
      try {
        ;[subscription] = await topic.createSubscription(subscriptionName, {
          ackDeadlineSeconds: 60,
        })
        console.log(`🆕 Created subscription: ${subscriptionName}`)
      } catch (error: any) {
        if (error.code === 6) {
          // ALREADY_EXISTS
          subscription = this.pubSubClient.subscription(subscriptionName)
          console.log(`✅ Subscription '${subscriptionName}' already exists`)
        } else {
          throw error
        }
      }

      // Handle incoming messages
      subscription.on('message', async (message: Message) => {
        try {
          const eventData: T = JSON.parse(message.data.toString())
          console.log(
            `📨 Received event: ${eventData.eventType} (ID: ${eventData.eventId}) from subscription: ${subscriptionName}`
          )

          await handler(eventData)

          // Acknowledge the message (remove it from the subscription)
          message.ack()

          console.log(
            `✅ Successfully processed and acknowledged message: ${eventData.eventId}`
          )
        } catch (error) {
          console.error('❌ Error processing message:', error)
          console.error('Message data:', message.data.toString())

          // Negative acknowledgment (message will be redelivered)
          message.nack()
        }
      })

      // Handle subscription errors
      subscription.on('error', (error) => {
        console.error(`❌ Subscription error for ${subscriptionName}:`, error)
      })
      console.log(
        `🎯 Started listening for messages on subscription: ${subscriptionName}`
      )
    } catch (error) {
      console.error(`❌ Failed to subscribe to ${subscriptionName}:`, error)
      throw error
    }
  }

  /**
   * List all topics in the project
   */
  async listTopics(): Promise<string[]> {
    try {
      const [topics] = await this.pubSubClient.getTopics()
      const topicNames = topics.map((topic) => topic.name.split('/').pop()!)
      console.log('📋 Available topics:', topicNames)
      return topicNames
    } catch (error) {
      console.error('❌ Error listing topics:', error)
      throw error
    }
  }

  /**
   * List all subscriptions in the project
   */
  async listSubscriptions(): Promise<string[]> {
    try {
      const [subscriptions] = await this.pubSubClient.getSubscriptions()
      const subscriptionNames = subscriptions.map(
        (sub) => sub.name.split('/').pop()!
      )
      console.log('📋 Available subscriptions:', subscriptionNames)
      return subscriptionNames
    } catch (error) {
      console.error('❌ Error listing subscriptions:', error)
      throw error
    }
  }

  /**
   * Close the PubSub client
   */
  async close(): Promise<void> {
    try {
      await this.pubSubClient.close()
      console.log('✅ PubSub client closed successfully')
    } catch (error) {
      console.error('❌ Error closing PubSub client:', error)
    }
  }

  /**
   * Test connection to GCP Pub/Sub
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.listTopics()
      console.log('✅ PubSub connection test successful')
      return true
    } catch (error) {
      console.error('❌ PubSub connection test failed:', error)
      return false
    }
  }
}

// Create singleton instance
export const createPubSubManager = (
  projectId: string,
  keyFilename: string
): PubSubManager => {
  return new PubSubManager(projectId, keyFilename)
}
