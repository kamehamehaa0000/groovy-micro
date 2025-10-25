import type { UseFormReturn } from 'react-hook-form'
import type { AlbumUploadForm } from '../../../types/UploadComponentTypes'
import { genres } from '../../../pages/Upload'

interface AlbumBasicInfoProps {
  form: UseFormReturn<AlbumUploadForm>
}

export const AlbumBasicInfo = ({ form }: AlbumBasicInfoProps) => {
  const {
    register,
    watch,
    formState: { errors },
  } = form
  const coverArtFile = watch('coverArt')
  const coverArtSize = coverArtFile?.[0]?.size || 0
  const albumName = watch('albumName')

  return (
    <>
      {/* Album Name */}
      <div>
        <label htmlFor="albumName" className="block text-sm font-medium mb-2">
          Album Name
        </label>
        <input
          id="albumName"
          type="text"
          {...register('albumName', {
            required: 'Album name is required',
            validate: (value) => {
              if (!value || !value.trim()) return 'Album name is required'
              const charCount = value.trim().length
              return (
                charCount <= 60 || 'Album name must not exceed 60 characters'
              )
            },
          })}
          className="w-full p-2 border rounded"
          placeholder="Enter album name"
        />
        {albumName && albumName.trim() && (
          <p
            className={`text-sm mt-1 ${
              albumName.trim().length > 60 ? 'text-red-500' : 'text-green-500'
            }`}
          >
            Character count: {albumName.trim().length}/60
          </p>
        )}
        {errors.albumName && (
          <p className="text-red-500 text-sm mt-1">
            {errors.albumName.message}
          </p>
        )}
      </div>

      {/* Cover Art and Genre */}
      <div className="flex gap-4 flex-col sm:flex-row">
        <div className="sm:w-1/2">
          <label htmlFor="coverArt" className="block text-sm font-medium mb-2">
            Album Cover Art (JPG/PNG, max 1MB)
          </label>
          <input
            id="coverArt"
            type="file"
            accept=".jpg,.jpeg,.png,image/jpeg,image/png"
            {...register('coverArt', {
              required: 'Album cover art is required',
              validate: (files) => {
                const file = files?.[0]
                if (!file) return 'Album cover art is required'
                if (!['image/jpeg', 'image/png'].includes(file.type)) {
                  return 'Only JPG and PNG files are allowed'
                }
                if (file.size > 1024 * 1024) {
                  return 'File size must be less than 1MB'
                }
                return true
              },
            })}
            className="w-full p-2 border rounded"
          />
          {coverArtSize > 0 && (
            <p
              className={`text-sm mt-1 ${
                coverArtSize > 1024 * 1024 ? 'text-red-500' : 'text-green-500'
              }`}
            >
              File size: {(coverArtSize / 1024).toFixed(1)}KB
            </p>
          )}
          {errors.coverArt && (
            <p className="text-red-500 text-sm mt-1">
              {errors.coverArt.message}
            </p>
          )}
        </div>

        <div className="sm:w-1/2">
          <label htmlFor="genre" className="block text-sm font-medium mb-2">
            Genre
          </label>
          <select
            id="genre"
            {...register('genre', { required: 'Genre is required' })}
            className="w-full p-2 border rounded"
          >
            <option value="">Select a genre</option>
            {genres.map((genre) => (
              <option key={genre} value={genre}>
                {genre}
              </option>
            ))}
          </select>
          {errors.genre && (
            <p className="text-red-500 text-sm mt-1">{errors.genre.message}</p>
          )}
        </div>
      </div>

      {/* Tags and Visibility */}
      <div className="flex gap-4 flex-col sm:flex-row">
        <div className="sm:w-1/2">
          <label htmlFor="tags" className="block text-sm font-medium mb-2">
            Tags
          </label>
          <input
            id="tags"
            type="text"
            {...register('tags', { required: 'Tags are required' })}
            className="w-full p-2 border rounded"
            placeholder="Enter tags separated by commas"
          />
          {errors.tags && (
            <p className="text-red-500 text-sm mt-1">{errors.tags.message}</p>
          )}
        </div>

        <div className="sm:w-1/2">
          <label
            htmlFor="visibility"
            className="block text-sm font-medium mb-2"
          >
            Visibility
          </label>
          <select
            id="visibility"
            {...register('visibility', {
              required: 'Visibility setting is required',
            })}
            className="w-full p-2 border rounded"
          >
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </div>
      </div>
    </>
  )
}
