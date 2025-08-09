import { useChangeDisplayNameModalStore } from '@/store/modal-store'
import React, { useState } from 'react'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { BiEdit, BiLoader, BiXCircle } from 'react-icons/bi'
import { withModal } from './withModal'
import { useAuthStore } from '@/store/auth-store'
import toast from 'react-hot-toast'

const ChangeDisplayNameModalContent = () => {
  const { close } = useChangeDisplayNameModalStore()
  const [isLoading, setIsLoading] = useState(false)
  const [name, setName] = useState('')
  const { changeDisplayName, isAuthenticated } = useAuthStore()

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!name) return
    if (!isAuthenticated) {
      toast.error('You must be logged in to change your display name.')
      return
    }
    setIsLoading(true)
    try {
      await changeDisplayName(name)
      toast.success('Display name updated successfully!')
      close()
    } catch (error) {
      error && toast.error('Failed to update display name.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-4 space-y-4">
      <div className="space-y-3 ">
        <Input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New Display/Artist Name *"
          disabled={isLoading}
        />
      </div>

      <div className="flex space-x-2 pt-1">
        {' '}
        <Button
          variant="default"
          type="submit"
          disabled={!name || isLoading}
          onClick={() => handleSubmit}
          className="w-2/3  border border-orange-600 bg-white text-orange-600 hover:bg-orange-50"
        >
          {isLoading ? (
            <>
              <BiLoader />
              Updating...
            </>
          ) : (
            <>
              <BiEdit /> Update
            </>
          )}
        </Button>
        <Button
          variant="outline"
          onClick={close}
          disabled={isLoading}
          className="w-fit "
          title="Cancel creating playlist"
        >
          <BiXCircle /> Cancel
        </Button>
      </div>
    </form>
  )
}

export const ChangeDisplayNameModal = withModal(ChangeDisplayNameModalContent)
