import mongoose from 'mongoose'

export const connectToDatabase = async (mongoURI: string) => {
  try {
    if (!mongoURI) {
      throw new Error('MONGODB_URI env is not defined in environment variables')
    }
    await mongoose.connect(mongoURI)
  } catch (error) {
    throw new Error('Database connection failed: ' + (error as Error).message)
  }
}
export const closeDatabaseConnections = async () => {
  try {
    await mongoose.connection.close()
  } catch (error) {
    throw new Error(
      'Failed to close database connection: ' + (error as Error).message
    )
  }
}

export const getMongoDb = () => {
  return mongoose.connection.db
}
