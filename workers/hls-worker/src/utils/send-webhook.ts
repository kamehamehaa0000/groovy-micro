import axios from 'axios'
import crypto from 'crypto'

export const generateWebhookSignature = (
  payload: string,
  secret: string
): string => {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

export const sendWebhook = async (
  webhookUrl: string,
  data: any,
  retries = 3
) => {
  for (let i = 0; i < retries; i++) {
    try {
      const payload = JSON.stringify(data)
      const signature = generateWebhookSignature(
        payload,
        process.env.WEBHOOK_SECRET!
      )
      const res = await axios.post(webhookUrl, data, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'groovy-hls-Worker/1.0',
          'X-Signature': `sha256=${signature}`,
          'X-Timestamp': Date.now().toString(),
          'X-Service': 'hls-worker',
        },
      })
      console.log(`Webhook sent successfully for song ${data.songId}`)
      return res.data
    } catch (error) {
      console.error(
        `Webhook attempt ${i + 1} failed:`,
        error instanceof Error ? error.message : error
      )

      if (i === retries - 1) {
        console.error(
          `Failed to send webhook after ${retries} attempts for song ${data.songId}`
        )
        throw error
      }

      await new Promise((resolve) => setTimeout(resolve, Math.pow(2, i) * 1000)) // Waiting before retry (exponential backoff)
    }
  }
}
