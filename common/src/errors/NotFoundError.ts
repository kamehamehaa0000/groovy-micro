import CustomError from './CustomError'

export class NotFoundError extends CustomError {
  constructor(message: string, reason?: string) {
    super(message, 404, reason)
    Object.setPrototypeOf(this, NotFoundError.prototype)
  }
  serializeErrors(): { message: string; reason?: string }[] {
    return [{ message: this.message, reason: this.reason }]
  }
}
export default NotFoundError
