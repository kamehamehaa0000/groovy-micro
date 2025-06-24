import { body } from 'express-validator'

export const albumUploadValidator = [
  body('tracks').isArray().withMessage('Tracks must be an array'),
  body('tracks.*.filename')
    .isString()
    .withMessage('Track filename must be a string'),
  body('tracks.*.songName')
    .isString()
    .withMessage('Track song name must be a string'),
  body('tracks.*.trackNumber')
    .isNumeric()
    .withMessage('Track number must be a number'),
  body('tracks.*.genre').isString().withMessage('Track genre must be a string'),
  body('tracks.*.tags')
    .isArray({
      min: 0,
      max: 10,
    })
    .withMessage('Track tags must be an array'),
  body('tracks.*.collaborators')
    .isArray({
      min: 0,
      max: 5,
    })
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
  body('coverFilename')
    .isString()
    .withMessage('Cover filename must be a string'),
  body('visibility').notEmpty().isIn(['public', 'private']),
]

export const albumConfirmUploadValidator = [
  body('albumName')
    .isString()
    .isLength({ min: 1, max: 60 })
    .withMessage('Album name must be a string'),
  body('coverUploadKey')
    .isString()
    .withMessage('Cover upload key must be a string'),
  body('genre').isString().withMessage('Genre must be a string'),
  body('tags')
    .isArray({
      min: 0,
      max: 10,
    })
    .withMessage('Tags must be an array'),
  body('collaborators')
    .isArray({
      min: 0,
      max: 5,
    })
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
  body('visibility').notEmpty().isIn(['public', 'private']),

  body('tracksData')
    .isArray({
      min: 1,
      max: 20,
    })
    .withMessage('Tracks data must be an array'),
  body('tracksData.*.songId')
    .isString()
    .withMessage('Track song ID must be a string'),
  body('tracksData.*.songUploadKey')
    .isString()
    .withMessage('Track upload key must be a string'),
]
