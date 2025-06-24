import amqp from 'amqplib'

let channel: amqp.Channel
const connectToQueue = async () => {
  try {
    const connection = await amqp.connect(process.env.CLOUDAMQP_URL!)
    channel = await connection.createChannel()
    await channel.assertQueue('audio-conversion', { durable: true })
    console.log('Connected to CloudAMQP')
  } catch (error) {
    console.error('Failed to connect to CloudAMQP:', error)
  }
}

export default connectToQueue
export { channel }
