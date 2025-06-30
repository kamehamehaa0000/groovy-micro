import React, { useState } from 'react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { BiLock } from 'react-icons/bi'
import { BsMailbox } from 'react-icons/bs'
import { FiEye, FiEyeOff } from 'react-icons/fi'
import { Link } from 'react-router'
import { useAuthStore } from '../store/auth-store'

export const Register = () => {
  const [isLoading, setIsLoading] = useState(false)

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-gray-900">
            Welcome to Groovy
          </h2>
          <p className="mt-2 text-sm text-gray-600">Your streaming platform</p>
        </div>
      </div>
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <div className="text-center mb-6">
            <h3 className="text-base font-medium text-gray-900">
              Create an Account
            </h3>
          </div>
          <div className="space-y-4">
            <RegisterForm loading={isLoading} setIsLoading={setIsLoading} />
          </div>
        </div>
        <div className="mt-6 text-center  ">
          <span>Already Have an Account ? </span>
          <Link
            to="/login"
            className="ml-1 text-orange-700 underline hover:text-orange-500"
          >
            Login Now!!!
          </Link>
        </div>
        <div className="mt-6 text-center">
          <Link
            to="/"
            className="text-sm text-orange-700 hover:text-orange-500"
          >
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  )
}

const RegisterForm = ({
  loading,
  setIsLoading,
}: {
  loading: boolean
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>
}) => {
  const [showPassword, setShowPassword] = useState(false)
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<{
    email: string
    password: string
    confirmPassword: string
    displayName: string
  }>()

  const {
    register: registerAuthStore,
    error: storeError,
    clearError,
  } = useAuthStore()

  const onSubmitHandler = async (data: {
    email: string
    password: string
    confirmPassword: string
    displayName: string
  }) => {
    clearError()
    if (data.confirmPassword !== data.password) {
      toast.error('Passwords do not match')
      return
    }
    setIsLoading(true)
    try {
      await registerAuthStore({
        email: data.email,
        password: data.password,
        displayName: data.displayName,
      })
      toast.success(
        'Registration successful! Please check your email to verify.'
      )
      reset() //clears Form fields after successful registration
    } catch (error) {
      toast.error('Registration failed.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmitHandler)}>
      <div>
        {storeError &&
          (Array.isArray(storeError) ? (
            storeError.map((error) => (
              <p key={error} className="mt-1 text-sm text-red-600">
                {error}
              </p>
            ))
          ) : (
            <p className="mt-1 text-sm text-red-600">{storeError}</p>
          ))}
      </div>
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
            {...register('email', {
              required: 'Email is required',
              pattern: {
                value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                message: 'Invalid email address',
              },
            })}
            className="text-sm w-full pl-10 py-2.5 bg-zinc-100 border border-zinc-700 rounded-lg text-black focus:ring-1 focus:ring-orange-500 focus:border-orange-500 outline-none"
            placeholder="Enter your email"
            disabled={loading}
            autoComplete="email"
          />
        </div>
        {errors.email && (
          <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
        )}
      </div>
      {/* DisplayName */}
      <div>
        <label
          htmlFor="displayName"
          className="block text-md font-medium text-zinc-400 mb-2"
        >
          Display Name
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <BsMailbox size={16} className="text-zinc-500" />
          </div>
          <input
            id="displayName"
            type="text"
            {...register('displayName', {
              required: 'displayName is required',
              minLength: 2,
              maxLength: 20,
            })}
            className="text-sm w-full pl-10 py-2.5 bg-zinc-100 border border-zinc-700 rounded-lg text-black focus:ring-1 focus:ring-orange-500 focus:border-orange-500 outline-none"
            placeholder="Enter your display name"
            disabled={loading}
          />
        </div>
        {errors.displayName && (
          <p className="mt-1 text-sm text-red-600">
            {errors.displayName.message}
          </p>
        )}
      </div>
      {/* Password */}
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
            className="text-sm w-full pl-10 py-2.5 bg-zinc-100 border border-zinc-700 rounded-lg text-black focus:ring-1 focus:ring-orange-500 focus:border-orange-500 outline-none"
            placeholder="Enter your password"
            disabled={loading}
            autoComplete="current-password"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-zinc-500 hover:text-zinc-300"
          >
            {showPassword ? <FiEyeOff size={16} /> : <FiEye size={16} />}
          </button>
        </div>
        {errors.password && (
          <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
        )}
      </div>
      {/* Confirm Password */}
      <div>
        <label
          htmlFor="confirmPassword"
          className="block text-md font-medium text-zinc-400 mb-1"
        >
          Confirm Password
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <BiLock size={16} className="text-zinc-500" />
          </div>
          <input
            id="confirmPassword"
            type={showPassword ? 'text' : 'password'}
            {...register('confirmPassword', {
              required: 'Confirm Password is required',
              validate: (value) =>
                value === watch('password') || 'Passwords do not match',
            })}
            className="text-sm w-full pl-10 py-2.5 bg-zinc-100 border border-zinc-700 rounded-lg text-black focus:ring-1 focus:ring-orange-500 focus:border-orange-500 outline-none"
            placeholder="Confirm your password"
            disabled={loading}
            autoComplete="current-password"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-zinc-500 hover:text-zinc-300"
          >
            {showPassword ? <FiEyeOff size={16} /> : <FiEye size={16} />}
          </button>
        </div>
        {errors.confirmPassword && (
          <p className="mt-1 text-sm text-red-600">
            {errors.confirmPassword.message}
          </p>
        )}
      </div>

      <div>
        <button
          type="submit"
          className={`w-full py-2.5 px-4 mt-2 hover:bg-orange-600 hover:text-white bg-zinc-100 border border-orange-700 text-orange-700 font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 transition-colors duration-200 ${
            loading ? 'opacity-50 cursor-not-allowed' : ''
          }`}
          disabled={loading}
        >
          {loading ? 'Registering...' : 'Register'}
        </button>
      </div>
    </form>
  )
}
