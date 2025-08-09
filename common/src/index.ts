export { default as BadRequestError } from './errors/BadRequestError'
export { default as NotFoundError } from './errors/NotFoundError'
export { default as CustomError } from './errors/CustomError'
export { default as RequestValidationError } from './errors/RequestValidationError'
export { default as globalErrorHandler } from './middlewares/globalErrorHandler'
export { default as validateRequest } from './middlewares/validateRequestMiddleware'
export { default as verifyEnv } from './util/verifyEnv'
export { TOPICS, EventTypes, SUBSCRIPTIONS } from './events/types'
export {
  closeDatabaseConnections,
  connectToDatabase,
  getMongoDb,
} from './configs/mongoDatabase'
export { default as connectToQueue, channel } from './configs/cloudAMQP'
export { createR2Client, testR2Connection } from './configs/cloudflareR2'
export {
  PubSubManager,
  createPubSubManager,
  BaseEvent,
} from './events/PubSubManager'
export { requireSyncAuth } from './middlewares/requireSyncAuth'
export {
  authenticate,
  optionalAuth,
  requireAuth,
  AuthenticatedRequest,
  AuthOptions,
} from './middlewares/authenticate'

export { extractKeyFromR2Url } from './util/extractKeyFromR2Url'

export {
  StatusEnum,
  SongCreatedEventData,
  SongUpdatedEventData,
  SongDeletedEventData,
  AlbumCreatedEventData,
  AlbumUpdatedEventData,
  AlbumDeletedEventData,
  PlaylistCreatedEventData,
  PlaylistUpdatedEventData,
  PlaylistDeletedEventData,
  LibraryCreatedEventData,
  LibraryUpdatedEventData,
  SongStreamedEventData,
} from './events/song-service-events'
export {
  UserCreatedEventData,
  UserUpdatedEventData,
  UserDeletedEventData,
} from './events/user-service-events'
