import { Request, Response, NextFunction } from 'express'
import CustomError from '../errors/CustomError'

const globalErrorHandler = (
  err: Error | CustomError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Log the error for debugging purposes, especially for unexpected errors
  console.error('Error caught by global error handler:', err)

  if (err instanceof CustomError) {
    res.status(err.statusCode).json({
      errors: err.serializeErrors(),
    })
    return
  }
  // Handle unexpected errors
  const statusCode = 500
  const message = 'Something went wrong'
  const reason = 'An unexpected error occurred'

  res.status(statusCode).json({
    errors: [
      {
        message,
        reason,
      },
    ],
  })
}

export default globalErrorHandler
