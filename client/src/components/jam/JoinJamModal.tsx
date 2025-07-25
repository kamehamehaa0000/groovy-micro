import React, { useState } from 'react'
import { useJamActions } from '../../store/jam-store'
import { IoClose } from 'react-icons/io5'
import { useJoinJamModalStore } from '../../store/modal-store'

export const JoinJamModal: React.FC = () => {
  const [joinCode, setJoinCode] = useState('')
  const { joinJam } = useJamActions()
  const { isOpen, close } = useJoinJamModalStore()
  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (joinCode.trim()) {
      joinJam(joinCode.trim())
      setJoinCode('')
      close()
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1000]">
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm relative">
        <button
          onClick={close}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
        >
          <IoClose className="w-6 h-6" />
        </button>
        <h2 className="text-xl font-semibold mb-4">Join a Jam Session</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Enter Jam Code (e.g., ABCDEF)"
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 mb-4"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            maxLength={6}
          />
          <button
            type="submit"
            className="w-full bg-orange-600 text-white py-2 rounded-md hover:bg-orange-700 transition-colors"
          >
            Join Jam
          </button>
        </form>
      </div>
    </div>
  )
}
