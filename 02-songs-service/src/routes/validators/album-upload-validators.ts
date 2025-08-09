import { body } from 'express-validator'

export const albumPresignedUrlValidator = [
  body('coverFilename')
    .notEmpty()
    .withMessage('Cover filename is required')
    .matches(/\.(jpg|jpeg|png)$/i)
    .withMessage('Cover art must be a JPG or PNG file'),
  body('tracks')
    .isArray({ min: 1, max: 20 })
    .withMessage('Album must have between 1 and 20 tracks'),
  body('tracks.*.filename')
    .notEmpty()
    .withMessage('Track filename is required')
    .matches(/\.mp3$/i)
    .withMessage('Track must be an MP3 file'),
  body('tracks.*.songName')
    .notEmpty()
    .withMessage('Track name is required')
    .isLength({ max: 50 })
    .withMessage('Track name must not exceed 50 characters'),
  body('tracks.*.trackNumber')
    .isInt({ min: 1, max: 20 })
    .withMessage('Track number must be between 1 and 20'),
]
export const albumConfirmationValidator = [
  body('albumId').isUUID().withMessage('Valid album ID is required'),
  body('albumName')
    .notEmpty()
    .withMessage('Album name is required')
    .isLength({ max: 60 })
    .withMessage('Album name must not exceed 60 characters'),
  body('genre').notEmpty().withMessage('Genre is required'),
  body('tags').isArray().withMessage('Tags must be an array'),
  body('visibility')
    .isIn(['public', 'private'])
    .withMessage('Visibility must be public or private'),
  body('collaborators')
    .isArray({ max: 5 })
    .withMessage('Maximum 5 collaborators allowed'),
  body('tracksData')
    .isArray({ min: 1, max: 20 })
    .withMessage('Album must have between 1 and 20 tracks'),
  body('tracksData.*.songId')
    .isUUID()
    .withMessage('Valid song ID is required for each track'),
  body('tracksData.*.songUploadKey')
    .notEmpty()
    .withMessage('Song upload key is required for each track'),
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
  body('coverUploadKey').notEmpty().withMessage('Cover upload key is required'),
]
