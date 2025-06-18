import { useState, type FC } from 'react'
import { IoClose } from 'react-icons/io5'
import { FaEye } from 'react-icons/fa6'
import { useNavigate } from 'react-router'
import {
  SigninModal,
  SignupModal,
  useForgotPasswordModal,
} from '../store/modal-store'
import { BiLock } from 'react-icons/bi'
import { BsMailbox } from 'react-icons/bs'
import { authStore } from '../store/auth-store'
import { FiEyeOff } from 'react-icons/fi'
import axios from 'axios'
import { FcGoogle } from 'react-icons/fc'
const Signin = () => {
  return (
    <div className=" bg-zinc-950 relative flex flex-col items-center justify-center min-h-screen w-full  text-white">
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 h-[50%] w-[50%] bg-blue-400 rounded-full filter blur-[200px] opacity-50 z-0" />
      <div className="my-2 w-full mx-auto max-w-sm z-10">
        <CombinedSignin forModal={false} />
      </div>
    </div>
  )
}

export default Signin

const SigninWithGoogleButton: FC = () => {
  return (
    <button
      onClick={() =>
        window.open(
          'api/v1/auth/google?popup=true', // Using proxy path defined in vite.config.ts
          'googleLogin',
          'width=500,height=600,scrollbars=yes,resizable=yes'
        )
      }
      className=" w-full flex items-center gap-2 justify-center  bg-blue-600/20 hover:bg-blue-700/80 border border-blue-600/30 py-2.5 px-4 text-white font-medium rounded-lg transition"
    >
      <FcGoogle size={24} /> Sign-in with Google
    </button>
  )
}

export const CombinedSignin: FC<{
  forModal?: boolean
}> = ({ forModal = true }) => {
  const {
    isOpen: isSigninModalOpen,
    close: closeSigninModal,
    toggleMethod: toggleSigninMethod,
    method: signinMethod,
  } = SigninModal()
  const { open: openSignupModal } = SignupModal()
  const { open: openForgotPasswordModal } = useForgotPasswordModal()
  const [message, setMessage] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = authStore()
  const navigate = useNavigate()

  const closeModal = () => {
    closeSigninModal()
  }

  const switchToSignup = () => {
    if (forModal) {
      closeModal()
      openSignupModal()
    } else {
      navigate('/signup')
    }
  }

  const handleForgotPassword = () => {
    if (forModal) {
      closeModal()
      openForgotPasswordModal()
    } else {
      navigate('/forgot-password')
    }
  }

  const toggleMethod = () => {
    if (toggleSigninMethod) toggleSigninMethod()
  }

  const handlePasswordLogin = async () => {
    if (!email || !password) {
      throw new Error('Please fill in all fields')
    }
    await login(email, password)
  }

  const handlePasswordlessLogin = async () => {
    if (!email) {
      throw new Error('Please enter your email')
    }
    const res = await axios.post(
      'http://localhost:4000/api/v1/auth/magic-link/request',
      { email }
    )
    setMessage(res.data.message)
    if (forModal) {
      closeModal()
    }
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      if (signinMethod === 'password') {
        await handlePasswordLogin()
      } else if (signinMethod === 'passwordless') {
        await handlePasswordlessLogin()
        return
      }

      if (forModal) {
        closeModal()
      } else {
        navigate('/')
      }
    } catch (error: any) {
      if (error.response && error.response.data.errors) {
        console.log(error.response.data.errors[0])
        setError(error.response.data.errors[0].reason ?? 'An error occurred')
      } else {
        setError(error.message ?? 'An error occurred')
      }
    } finally {
      setLoading(false)
    }
  }

  // Return null if modal is closed
  if (forModal && signinMethod === 'password' && !isSigninModalOpen) {
    return null
  }

  return (
    <div className="w-full max-w-md absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-zinc-900/50 backdrop-blur-md rounded-xl shadow-2xl p-8 ">
      {/* Close button for modal*/}
      {forModal && (
        <button
          aria-label="Close"
          onClick={closeModal}
          className="absolute top-4 right-4 text-zinc-400 hover:text-white"
        >
          <IoClose size={20} />
        </button>
      )}

      <div className="my-2 w-full mx-auto max-w-xs z-10">
        <SigninWithGoogleButton />{' '}
      </div>
      <div className="flex justify-center my-1">
        <span className="text-zinc-400">or</span>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit}>
        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-700 text-red-200 text-sm rounded-lg">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* Email */}
          <div>
            <label
              htmlFor="email"
              className="block text-md font-medium text-zinc-400 mb-2"
            >
              Email
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <BsMailbox size={16} className="text-zinc-500" />
              </div>
              <input
                id="email"
                type="email"
                value={email}
                required
                onChange={(e) => setEmail(e.target.value)}
                className="text-sm w-full pl-10 py-2.5 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="Enter your email"
                disabled={loading}
                autoComplete="email"
              />
            </div>
          </div>

          {/* Password - only shown for password method */}
          {signinMethod === 'password' && (
            <div>
              <label
                htmlFor="password"
                className="block text-md font-medium text-zinc-400 mb-1"
              >
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <BiLock size={16} className="text-zinc-500" />
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  required
                  onChange={(e) => setPassword(e.target.value)}
                  className="text-sm w-full pl-10 py-2.5 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="Enter your password"
                  disabled={loading}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-zinc-500 hover:text-zinc-300"
                >
                  {showPassword ? <FiEyeOff size={16} /> : <FaEye size={16} />}
                </button>
              </div>
            </div>
          )}

          {/* Passwordless info message */}
          {signinMethod === 'passwordless' && (
            <div className="mb-4 p-4 bg-blue-900/30 border border-blue-700 text-blue-200 text-xs rounded-lg">
              {message ||
                'You will receive a secure link on your mail to sign in.'}
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            className={`w-full bg-green-500/20 hover:bg-green-700/80 border border-green-600/30 py-2.5 px-4 text-white font-medium rounded-lg transition ${
              loading ? 'opacity-70 cursor-not-allowed' : ''
            }`}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
          {/* Action buttons */}
          <div className="flex justify-center">
            {signinMethod === 'password' ? (
              <button
                type="button"
                className="text-sm text-blue-500 hover:text-blue-400"
                onClick={handleForgotPassword}
                disabled={loading}
              >
                Forgot password?
              </button>
            ) : (
              <button
                type="button"
                className="text-sm text-blue-500 hover:text-blue-400"
                onClick={toggleMethod}
                disabled={loading}
              >
                Signin with Password?
              </button>
            )}
          </div>
          {signinMethod === 'password' && (
            <div className="flex justify-center mt-1">
              <button
                type="button"
                className="text-sm text-blue-500 hover:text-blue-400"
                onClick={toggleMethod}
                disabled={loading}
              >
                Use passwordless login
              </button>
            </div>
          )}

          {/* Register option */}
          <div className="text-center text-zinc-400 text-sm mt-4">
            Don't have an account?{' '}
            <button
              type="button"
              onClick={switchToSignup}
              className="text-blue-500 hover:text-blue-400 font-medium"
            >
              Sign up
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
