import { Link } from 'react-router'
import { useAuthStore } from '../store/auth-store'
import { useSigninPromptModalStore } from '../store/modal-store'

export const HomePage = () => {
  const { isAuthenticated, user, logout } = useAuthStore()
  const { open } = useSigninPromptModalStore()

  return (
    <div className="p-8 flex flex-col items-center justify-center h-full">
      <h1 className="text-2xl font-bold text-center mb-8">
        Welcome to the Groovy Microservices Project
      </h1>

      <button
        onClick={() =>
          !isAuthenticated ? open() : alert('You are already logged in!')
        }
        className="bg-orange-500 text-white px-6 py-3 rounded-lg hover:bg-orange-600 transition-colors mb-6"
      >
        Play Music
      </button>

      {!isAuthenticated ? (
        <Link to="/login" className="text-blue-500 hover:underline">
          Sign In
        </Link>
      ) : (
        <div className="text-center space-y-2">
          <p className="font-semibold">{user?.displayName}</p>
          <p className="text-gray-600">{user?.email}</p>
          <button
            className="text-red-500 hover:underline"
            onClick={() => logout()}
          >
            Logout
          </button>
        </div>
      )}
    </div>
  )
}
