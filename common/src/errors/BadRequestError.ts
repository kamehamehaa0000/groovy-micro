import CustomError from './CustomError'

class BadRequestError extends CustomError {
  constructor(message: string, reason?: string) {
    super(message, 400, reason)
  }
  serializeErrors(): { message: string; reason?: string }[] {
    return [{ message: this.message, reason: this.reason }]
  }
}

export default BadRequestError
