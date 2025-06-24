export interface QueueMessage<T> {
  id: string
  timestamp: number
  data: T
}
