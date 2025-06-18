import { ValidationError } from 'express-validator'
import CustomError from './CustomError'

class RequestValidationError extends CustomError {
  constructor(public errors: ValidationError[]) {
    super('Invalid request parameters', 400)
    Object.setPrototypeOf(this, RequestValidationError.prototype)
  }

  // provides detailed error messages
  serializeErrors() {
    return this.errors.map((err) => {
      if (err.type === 'field') {
        return { message: err.msg, reason: err.path }
      }
      return { message: err.msg }
    })
  }
}

export default RequestValidationError
