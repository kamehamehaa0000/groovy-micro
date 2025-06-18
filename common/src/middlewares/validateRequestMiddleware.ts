const { validationResult } = require('express-validator')
import RequestValidationError from '../errors/RequestValidationError'
import { NextFunction, Request, Response } from 'express'

const validateRequest = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    throw new RequestValidationError(errors.array())
  }
  next()
}

export default validateRequest
