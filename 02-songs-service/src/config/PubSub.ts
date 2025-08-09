import { createPubSubManager } from '@groovy-streaming/common'

export const PubSubManager = createPubSubManager(
  process.env.GCP_PROJECT_ID!,
  process.env.GCP_SERVICE_ACCOUNT_KEY_PATH!
)
