import React from 'react'
import { useJamActions, useJamSession } from '../../store/jam-store'
import { useAuthStore } from '../../store/auth-store'
import { BiX } from 'react-icons/bi'
import { useHostControlModalStore } from '../../store/modal-store'

interface HostControlModalProps {}

const HostControlModal: React.FC<HostControlModalProps> = ({}) => {
  const session = useJamSession()
  const { giveControlPermission, revokeControlPermission } = useJamActions()
  const { user } = useAuthStore()
  const { isOpen, close } = useHostControlModalStore()

  const isCreator = user?.id === session?.creator

  if (!isCreator || !isOpen) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        <button
          className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 p-2"
          onClick={close}
        >
          <BiX className="w-6 h-6" />
        </button>
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Jam Session Settings</h2>
          <p className="text-sm text-gray-500">
            Manage playback settings and control permissions for your jam
            session.
          </p>
        </div>

        <div className="bg-gray-100 px-1 rounded-lg">
          {session?.participants &&
            session.participants.length > 0 &&
            session.participants.map((participant) => (
              <div
                key={participant._id}
                className="flex items-center justify-between py-2 text-sm px-1"
              >
                <span>{participant.displayName}</span>
                {participant._id == user?.id ? (
                  <span className="text-xs bg-amber-600/50 border border-amber-600/70 px-1 py-0.5 rounded-full">
                    Creator
                  </span>
                ) : (
                  user?.id === session?.creator && (
                    <button
                      title={
                        session.hasControlPermissions.includes(participant._id)
                          ? `Revoke control from ${participant.displayName}`
                          : `Give control to ${participant.displayName}`
                      }
                      className={
                        session.hasControlPermissions.includes(participant._id)
                          ? `bg-red-500/80 border border-red-500/50 text-white px-3 py-0.5 rounded-full hover:bg-red-600 text-xs`
                          : `bg-blue-500/80 border border-blue-500/50 text-white px-3 py-0.5 rounded-full hover:bg-blue-600 text-xs`
                      }
                      onClick={() => {
                        session.hasControlPermissions.includes(participant._id)
                          ? revokeControlPermission(participant._id)
                          : giveControlPermission(participant._id)
                      }}
                    >
                      {session.hasControlPermissions.includes(participant._id)
                        ? `Revoke Control`
                        : `Give Control`}
                    </button>
                  )
                )}
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}

export default HostControlModal
