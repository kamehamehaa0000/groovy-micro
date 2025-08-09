import React from 'react'

interface ModalStore {
  isOpen: boolean
  close: () => void
}
interface WithModalProps {
  title: string
  useStore: () => ModalStore
  className?: string
}

export const withModal = <P extends object>(
  WrappedComponent: React.ComponentType<P>
) => {
  const ModalComponent: React.FC<P & WithModalProps> = (props) => {
    const { useStore, title, className, ...rest } = props
    const { isOpen, close } = useStore()
    if (!isOpen) return null
    return (
      <div className="fixed inset-0 bg-black/30 bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg w-full max-w-sm max-h-[90vh] overflow-hidden shadow-xl">
          {/* Compact Header */}
          <div className=" border-b px-4 py-3 border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
              <button
                onClick={close}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                ×
              </button>
            </div>
          </div>
          <div>
            <WrappedComponent {...(rest as P)} />
          </div>
        </div>
      </div>
    )
  }

  return ModalComponent
}
