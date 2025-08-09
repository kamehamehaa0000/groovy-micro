import type { UseFormReturn } from 'react-hook-form'
import type { AlbumUploadForm } from '../../../types/UploadComponentTypes'
import axiosInstance from '../../../utils/axios-interceptor'
import toast from 'react-hot-toast'
import { BiXCircle } from 'react-icons/bi'
import { Button } from '@/components/ui/button'

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
        <Button
          type="button"
          onClick={addCollaborator}
          disabled={!collaboratorEmail.trim() || collaborators.length >= 5}
          variant="outline"
          className="border-orange-600 text-orange-600"
        >
          Add
        </Button>
      </div>
      {collaborators.length > 0 && (
        <div className="space-y-1 flex items-center flex-wrap gap-2">
          {collaborators.map((email) => (
            <div
              key={email}
              className="flex items-center bg-gray-100 px-4 py-1 rounded-full gap-1"
            >
              <span className="text-xs">{email}</span>
              <button
                type="button"
                title="Remove collaborator"
                onClick={() => removeCollaborator(email)}
                className="px-2 py-1 text-gray-500 rounded-full "
              >
                <BiXCircle />
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
