// import { v4 as uuid } from 'uuid'
// import { getQueue, isConnected } from '../config/amqp'
// import { QueueMessage } from '../types/amqp'
// import { ConversionJob } from '../types/song'
// import dotenv from 'dotenv'

// dotenv.config()

// class QueueService {
//   async addToConversionQueue(job: ConversionJob): Promise<boolean> {
//     try {
//       if (!isConnected()) {
//         throw new Error('AMQP not connected')
//       }

//       const queue = getQueue()

//       const message: QueueMessage<ConversionJob> = {
//         id: uuid(),
//         timestamp: Date.now(),
//         data: job,
//       }

//       console.log(`📤 Adding job to queue: ${message.id}`)

//       // Jackrabbit's publish method is much simpler
//       return new Promise((resolve, reject) => {
//         queue.publish(message, { deliveryMode: 2 }, (err: Error) => {
//           if (err) {
//             console.error('❌ Failed to publish message:', err)
//             reject(err)
//             return
//           }

//           console.log(`✅ Job successfully added to queue: ${message.id}`)
//           resolve(true)
//         })
//       })
//     } catch (error) {
//       console.error('Failed to add job to queue:', error)
//       throw error
//     }
//   }

//   async getQueueStats(): Promise<{
//     messageCount: number
//     consumerCount: number
//   }> {
//     try {
//       if (!isConnected()) {
//         throw new Error('AMQP not connected')
//       }

//       const queue = getQueue()

//       return new Promise((resolve, reject) => {
//         // Jackrabbit doesn't have built-in stats, but we can use the underlying channel
//         const channel = queue.channel
//         if (channel) {
//           channel.checkQueue(queue.name, (err: Error, ok: any) => {
//             if (err) {
//               reject(err)
//               return
//             }

//             resolve({
//               messageCount: ok.messageCount ?? 0,
//               consumerCount: ok.consumerCount ?? 0,
//             })
//           })
//         } else {
//           reject(new Error('Queue channel not available'))
//         }
//       })
//     } catch (error) {
//       console.error('Failed to get queue stats:', error)
//       throw error
//     }
//   }

//   async consumeMessages(
//     callback: (message: QueueMessage<ConversionJob>) => Promise<void>
//   ): Promise<void> {
//     try {
//       if (!isConnected()) {
//         throw new Error('AMQP not connected')
//       }

//       const queue = getQueue()

//       console.log('🎯 Starting to consume messages...')

//       queue.consume(
//         (data: any, ack: Function, nack: Function, msg: any) => {
//           console.log('📨 Received message:', data.id)

//           // Process the message
//           callback(data)
//             .then(() => {
//               console.log('✅ Message processed successfully:', data.id)
//               ack() // Acknowledge the message
//             })
//             .catch((error) => {
//               console.error('❌ Error processing message:', error)
//               nack() // Negative acknowledge (requeue)
//             })
//         },
//         {
//           noAck: false, // Manual acknowledgment
//           exclusive: false,
//         }
//       )
//     } catch (error) {
//       console.error('Failed to consume messages:', error)
//       throw error
//     }
//   }

//   async purgeQueue(): Promise<number> {
//     try {
//       if (!isConnected()) {
//         throw new Error('AMQP not connected')
//       }

//       const queue = getQueue()

//       return new Promise((resolve, reject) => {
//         const channel = queue.channel
//         if (channel) {
//           channel.purgeQueue(queue.name, (err: Error, ok: any) => {
//             if (err) {
//               reject(err)
//               return
//             }

//             const purgedCount = ok.messageCount ?? 0
//             console.log(`🗑️ Purged ${purgedCount} messages from queue`)
//             resolve(purgedCount)
//           })
//         } else {
//           reject(new Error('Queue channel not available'))
//         }
//       })
//     } catch (error) {
//       console.error('Failed to purge queue:', error)
//       throw error
//     }
//   }
// }

// export default new QueueService()
