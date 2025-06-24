// import dotenv from 'dotenv'
// import { connectAMQP, closeAMQP, isConnected } from '../config/amqp'
// import queueService from '../service/queueService'
// import { ConversionJob } from '../types/song'

// dotenv.config()

// async function testQueueConnection() {
//   console.log('🧪 Testing CloudAMQP connection with Jackrabbit...')

//   try {
//     // Test connection
//     console.log('\n1️⃣ Testing connection...')
//     await connectAMQP()

//     // Wait a moment for connection to establish
//     await new Promise((resolve) => setTimeout(resolve, 2000))

//     console.log('✅ Connection successful')

//     // Test connection status
//     console.log('\n2️⃣ Testing connection status...')
//     console.log('Connected:', isConnected())

//     // Test queue stats
//     console.log('\n3️⃣ Testing queue stats...')
//     try {
//       const stats = await queueService.getQueueStats()
//       console.log('📊 Queue stats:', stats)
//     } catch (error) {
//       console.log(
//         '⚠️ Queue stats not available (this is normal with some AMQP setups)' +
//           (error as Error).message
//       )
//     }

//     // Test adding a job
//     console.log('\n4️⃣ Testing adding a job to queue...')
//     const testJob: ConversionJob = {
//       songId: 'test-song-' + Date.now(),
//       originalUrl: 'https://example.com/test.mp3',
//       bucketKey: 'uploads/test-' + Date.now() + '.mp3',
//     }

//     const success = await queueService.addToConversionQueue(testJob)
//     console.log('✅ Job added successfully:', success)

//     // Test queue stats after adding job
//     console.log('\n5️⃣ Testing queue stats after adding job...')
//     try {
//       const newStats = await queueService.getQueueStats()
//       console.log('📊 Updated queue stats:', newStats)
//     } catch (error) {
//       console.log('⚠️ Queue stats not available')
//     }

//     console.log('\n🎉 All tests passed!')
//   } catch (error) {
//     console.error('❌ Test failed:', error)
//   } finally {
//     // Clean up
//     console.log('\n6️⃣ Closing connection...')
//     await closeAMQP()
//     console.log('✅ Connection closed')
//   }
// }

// // Run the test
// testQueueConnection()
