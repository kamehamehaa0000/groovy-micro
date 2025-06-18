class CustomError extends Error {
  public statusCode: number
  public reason?: string

  constructor(message: string, statusCode: number, reason?: string) {
    super(message)
    this.statusCode = statusCode
    this.reason = reason
    Object.setPrototypeOf(this, CustomError.prototype)
  }

  serializeErrors(): { message: string; reason?: string }[] {
    return [{ message: this.message, reason: this.reason }]
  }
}

export default CustomError
