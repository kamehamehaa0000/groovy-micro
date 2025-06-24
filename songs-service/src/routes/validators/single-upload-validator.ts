import { body } from 'express-validator'

export const singleSongUploadValidator = [
  body('songName')
    .isString()
    .withMessage('Song name must be a string')
    .notEmpty()
    .withMessage('Song name cannot be empty'),
  body('genre')
    .isString()
    .withMessage('Genre must be a string')
    .notEmpty()
    .withMessage('Genre cannot be empty'),
  body('coverArtFileName')
    .isString()
    .withMessage('Cover art file name must be a string')
    .notEmpty()
    .withMessage('Cover art file name cannot be empty')
    .matches(/\.(jpg|png)$/i)
    .withMessage('Cover art file name must end with .jpg or .png'),

  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array of strings')
    .custom((value) => {
      if (!value.every((item: any) => typeof item === 'string')) {
        throw new Error('Each tag must be a string')
      }
      return true
    }),
  body('collaborators')
    .optional()
    .isArray()
    .withMessage('Collaborators must be an array of emails')
    .custom((value) => {
      if (
        !value.every(
          (item: any) =>
            typeof item === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)
        )
      ) {
        throw new Error('Each collaborator must be a valid email address')
      }
      return true
    }),
  body('visibility')
    .notEmpty()
    .isIn(['public', 'private'])
    .withMessage('Visibility must be either "public" or "private"'),
]

export const singleSongUploadConfirmationBodyValidator = [
  body('songId')
    .isString()
    .withMessage('Song ID must be a string')
    .notEmpty()
    .withMessage('Song ID cannot be empty'),
  body('songUploadKey')
    .isString()
    .withMessage('Song key must be a string')
    .notEmpty()
    .withMessage('Song key cannot be empty'),

  body('coverUploadKey')
    .isString()
    .withMessage('Cover art key must be a string')
    .notEmpty()
    .withMessage('Cover art key cannot be empty'),
]
