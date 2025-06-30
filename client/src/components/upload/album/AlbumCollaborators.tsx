import type { UseFormReturn } from 'react-hook-form'
import type { AlbumUploadForm } from '../../../types/UploadComponentTypes'
import axiosInstance from '../../../utils/axios-interceptor'
import toast from 'react-hot-toast'

interface AlbumCollaboratorsProps {
  form: UseFormReturn<AlbumUploadForm>
  collaboratorEmail: string
  setCollaboratorEmail: (email: string) => void
}

export const AlbumCollaborators = ({
  form,
  collaboratorEmail,
  setCollaboratorEmail,
}: AlbumCollaboratorsProps) => {
  const { watch, setValue, getValues } = form
  const collaborators = watch('collaborators') || []

  const addCollaborator = async () => {
    if (collaboratorEmail.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(collaboratorEmail.trim())) {
        return
      }
      try {
        await axiosInstance.post(
          'http://localhost:4000/api/v1/auth/artist-email-check',
          {
            email: collaboratorEmail.trim(),
          }
        )
      } catch (error: any) {
        toast.error(
          error.response.data.errors[0].reason ??
            'Error checking collaborator email'
        )
        return
      }

      const currentCollaborators = getValues('collaborators') || []
      if (
        !currentCollaborators.includes(collaboratorEmail.trim()) &&
        currentCollaborators.length < 5
      ) {
        setValue('collaborators', [
          ...currentCollaborators,
          collaboratorEmail.trim(),
        ])
        setCollaboratorEmail('')
      }
    }
  }

  const removeCollaborator = (emailToRemove: string) => {
    const currentCollaborators = getValues('collaborators') || []
    setValue(
      'collaborators',
      currentCollaborators.filter((email) => email !== emailToRemove)
    )
  }

  return (
    <div>
      <label className="block text-sm font-medium mb-2">
        Album Collaborators ({collaborators.length}/5)
      </label>
      <div className="flex space-x-2 mb-2">
        <input
          type="email"
          value={collaboratorEmail}
          onChange={(e) => setCollaboratorEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addCollaborator()
            }
          }}
          className="flex-1 p-2 border rounded"
          placeholder="Enter collaborator's email"
          disabled={collaborators.length >= 5}
        />
        <button
          type="button"
          onClick={addCollaborator}
          disabled={!collaboratorEmail.trim() || collaborators.length >= 5}
          className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          Add
        </button>
      </div>
      {collaborators.length > 0 && (
        <div className="space-y-1">
          {collaborators.map((email) => (
            <div
              key={email}
              className="flex items-center justify-between bg-gray-100 p-2 rounded"
            >
              <span className="text-sm">{email}</span>
              <button
                type="button"
                onClick={() => removeCollaborator(email)}
                className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-gray-500 mt-1">
        Add up to 5 collaborating artists for the entire album
      </p>
    </div>
  )
}
