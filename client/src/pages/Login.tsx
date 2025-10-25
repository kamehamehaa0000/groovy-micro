import { Link, useNavigate } from 'react-router'
import { LoginTypeToggle } from '../components/auth/LoginTypeToggle'
import React, { useState } from 'react'
import { BsMailbox } from 'react-icons/bs'
import { BiLock } from 'react-icons/bi'
import { FiEyeOff } from 'react-icons/fi'
import { FaEye } from 'react-icons/fa6'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { FcGoogle } from 'react-icons/fc'
import { useAuthStore } from '../store/auth-store'
import { ArrowLeftCircle } from 'lucide-react'

const Login = () => {
  const [type, setType] = useState<'password' | 'password-less'>('password')
  const [isLoading, setIsLoading] = useState(false)

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-stone-950 flex flex-col justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md ">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-gray-900 dark:text-stone-300">
            Welcome to Groovy
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-stone-400">
            Your streaming platform
          </p>
        </div>
      </div>
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-stone-900 py-8 px-4 shadow rounded-md sm:rounded-lg sm:px-10">
          <div className="text-center mb-6">
            <h3 className="text-base font-medium text-gray-900 dark:text-stone-300">
              Choose your login method
            </h3>
          </div>
          <SigninWithGoogleButton />
          <div className="space-y-4 ">
            <LoginTypeToggle
              type={type}
              setType={setType}
              isLoading={isLoading}
            />
            {type === 'password' ? (
              <PasswordLogin loading={isLoading} setLoading={setIsLoading} />
            ) : (
              <PasswordlessLogin
                loading={isLoading}
                setLoading={setIsLoading}
              />
            )}
          </div>
        </div>
        <div className="mt-2 text-sm text-center space-y-3 text-stone-400">
          <span> Don't have an account?</span>
          <Link
            to="/register"
            className="ml-1 text-orange-600  hover:text-orange-500"
          >
            Register now
          </Link>
          <br />
          <span> Need to verify email? </span>
          <Link
            to="/verify-email"
            className="ml-1 text-orange-600  hover:text-orange-500"
          >
            Verify now
          </Link>
        </div>

        <Link
          to="/"
          className="text-sm text-orange-600 hover:text-orange-500 flex items-center justify-center mt-4 gap-2"
        >
          <ArrowLeftCircle /> Back to Home
        </Link>
      </div>
    </div>
  )
}

const SigninWithGoogleButton = () => {
  return (
    <button
      onClick={() =>
        (window.location.href = 'http://localhost:3001/api/auth/google')
      }
      className=" w-full flex items-center gap-2 justify-center  bg-orange-600/40 hover:bg-orange-600/80 border border-orange-400/30 py-1.5 px-4 text-sm text-white font-medium rounded-lg transition"
    >
      <FcGoogle size={24} /> Sign-in with Google
    </button>
  )
}

const PasswordLogin = ({
  loading,
  setLoading,
}: {
  loading: boolean
  setLoading: React.Dispatch<React.SetStateAction<boolean>>
}) => {
  const { login } = useAuthStore()
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ email: string; password: string }>()
  const navigate = useNavigate()
  const onSubmit = async (data: { email: string; password: string }) => {
    setLoading(true)
    try {
      await login(data.email, data.password)
      navigate('/')
    } catch (error: any) {
      const errors = error.response.data.errors
      errors.forEach((err: { message: string; reason: string }) => {
        toast.error(err.reason)
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        {/* Email */}
        <div>
          <label
            htmlFor="email"
            className="block text-md font-medium text-stone-400 mb-2"
          >
            Email
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <BsMailbox size={16} className="text-stone-500" />
            </div>
            <input
              id="email"
              type="email"
              {...register('email', {
                required: 'Email is required',
                pattern: {
                  value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                  message: 'Invalid email address',
                },
              })}
              className="text-sm w-full pl-10 py-2.5 bg-zinc-100 dark:bg-stone-950 border border-zinc-700 dark:border-stone-700 rounded-lg text-black dark:text-stone-400 focus:ring-1 focus:ring-orange-500 focus:border-orange-500 outline-none"
              placeholder="Enter your email"
              disabled={loading}
              autoComplete="email"
            />
          </div>
          {errors.email && (
            <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
          )}
        </div>

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
              {...register('password', {
                required: 'Password is required',
                minLength: {
                  value: 6,
                  message: 'Password must be at least 6 characters long',
                },
              })}
              className="text-sm w-full pl-10 py-2.5 bg-zinc-100 dark:bg-stone-950 border border-zinc-700 dark:border-stone-700 rounded-lg text-black dark:text-stone-400 focus:ring-1 focus:ring-orange-500 focus:border-orange-500 outline-none"
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
          {errors.password && (
            <p className="mt-1 text-sm text-red-600">
              {errors.password.message}
            </p>
          )}
        </div>
        <div className="flex justify-end items-center">
          <Link
            to="/forgot-password"
            className="text-sm  text-orange-600 hover:text-orange-500"
          >
            Forgot Password?
          </Link>
        </div>

        <div>
          <button
            type="submit"
            className={`w-full py-2.5 px-4 hover:bg-orange-600 hover:text-white bg-zinc-100 dark:hover:bg-stone-900 dark:bg-stone-950 border border-orange-700 text-orange-700 font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 transition-colors duration-200 ${
              loading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            disabled={loading}
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </div>
      </form>
    </div>
  )
}

const PasswordlessLogin = ({
  loading,
  setLoading,
}: {
  loading: boolean
  setLoading: React.Dispatch<React.SetStateAction<boolean>>
}) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ email: string }>()
  const { requestMagicLink } = useAuthStore()
  const onSubmit = async (data: { email: string }) => {
    setLoading(true)
    try {
      await requestMagicLink(data.email)
    } catch (error) {
      error && toast.error('Failed to send a magic link')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
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
            {...register('email', {
              required: 'Email is required',
              pattern: {
                value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                message: 'Invalid email address',
              },
            })}
            className="text-sm w-full pl-10 py-2.5 bg-zinc-100 dark:bg-stone-950 border border-zinc-700 dark:border-stone-700 rounded-lg text-black dark:text-stone-400 focus:ring-1 focus:ring-orange-500 focus:border-orange-500 outline-none"
            placeholder="Enter your email"
            disabled={loading}
            autoComplete="email"
          />
        </div>
        {errors.email && (
          <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
        )}
      </div>

      <div>
        <button
          type="submit"
          className={`w-full py-2.5 px-4 hover:bg-orange-600 hover:text-white bg-zinc-100 dark:hover:bg-stone-900 dark:bg-stone-950 border border-orange-700 text-orange-700 font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 transition-colors duration-200 ${
            loading ? 'opacity-50 cursor-not-allowed' : ''
          }`}
          disabled={loading}
        >
          {loading ? 'Sending...' : 'Send Magic Link'}
        </button>
      </div>
    </form>
  )
}

export default Login
