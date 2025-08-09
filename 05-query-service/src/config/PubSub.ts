import { createPubSubManager } from '@groovy-streaming/common'
import { configDotenv } from 'dotenv'
configDotenv()
export const PubSubManager = createPubSubManager(
  process.env.GCP_PROJECT_ID!,
  process.env.GCP_SERVICE_ACCOUNT_KEY_PATH!
)
