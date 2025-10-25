import { CgClose } from 'react-icons/cg'
import { Link } from 'react-router'
import { useSigninPromptModalStore } from '../../store/modal-store'
import promptModalImage from '../../assets/promptModalImage.avif'

export const PromptModal = () => {
  const { isOpen, close } = useSigninPromptModalStore()
  if (!isOpen) return null
  return (
    <div className="fixed top-0 left-0 p-6 w-screen h-screen inset-0 bg-black/60 bg-opacity-50 flex items-center justify-center z-50">
      {/*container*/}
      <div className="relative flex  bg-white dark:bg-stone-950 rounded-md shadow-xl max-w-2xl w-full h-96 overflow-hidden">
        <button
          onClick={close}
          className=" bg-black/40 rounded-full absolute right-4 top-4 z-10 text-gray-100 hover:text-gray-400 transition-colors"
        >
          <CgClose size={24} />
        </button>

        {/* Left side - Content */}
        <div className="flex-1 flex flex-col justify-center p-4 lg:p-6">
          <h2 className="text-2xl lg:text-3xl font-bold mb-4 text-gray-400">
            <span className="text-orange-500">Sign-In</span> to tune into your{' '}
            <span className="text-orange-500">Groovy</span>
          </h2>
          <p className="text-gray-400 mb-8 text-base lg:text-md">
            Please sign in to continue enjoying your music experience.
          </p>

          <div className="space-y-4">
            <Link
              to={'/login'}
              onClick={close}
              className="inline-block w-full text-center bg-orange-700 text-white px-6 py-3 rounded-lg hover:bg-orange-900 transition-colors font-medium"
            >
              Sign In
            </Link>

            <p className="text-sm text-gray-500 text-center">
              Don't have an account?{' '}
              <Link
                to={'/register'}
                onClick={close}
                className="text-orange-700 hover:text-orange-700 font-medium"
              >
                Sign Up
              </Link>
            </p>
          </div>
        </div>

        {/* Right side - Image */}
        <div className="flex-1 hidden md:block">
          <img
            src={promptModalImage}
            alt="Sign In Prompt"
            className="w-full h-full object-cover"
          />
        </div>
      </div>
    </div>
  )
}
