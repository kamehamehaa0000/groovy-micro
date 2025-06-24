import mongoose from 'mongoose'

export const connectToDatabase = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is not defined in environment variables')
    }
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('✅ Database connected')
  } catch (error) {
    throw new Error('Database connection failed: ' + (error as Error).message)
  }
}
export const closeDatabaseConnections = async () => {
  try {
    await mongoose.connection.close()
    console.log('✅ Database connection closed')
  } catch (error) {
    throw new Error(
      'Failed to close database connection: ' + (error as Error).message
    )
  }
}

export const getMongoDb = () => {
  return mongoose.connection.db
}
