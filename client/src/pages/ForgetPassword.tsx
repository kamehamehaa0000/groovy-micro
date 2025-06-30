import { useState } from 'react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { BsMailbox } from 'react-icons/bs'
import { Link } from 'react-router'
import { useAuthStore } from '../store/auth-store'

export const ForgotPassword = () => {
  const { requestPasswordReset } = useAuthStore()

  const [isLoading, setIsLoading] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ email: string }>()
  const onSubmit = async (data: { email: string }) => {
    setIsLoading(true)
    try {
      await requestPasswordReset(data.email)
      toast.success('Password reset link sent to your email')
    } catch (error) {
      console.log(error)
      toast.error('Failed to send password reset link')
    } finally {
      setIsLoading(false)
    }
  }
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
      <div className=" mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <div className="text-center mb-6">
            <h3 className="text-base font-medium text-gray-900">
              Reset Your Password
            </h3>
          </div>

          <div className="space-y-4">
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
                    className="text-sm w-full pl-10 py-2.5 bg-zinc-100 border border-zinc-700 rounded-lg text-black focus:ring-1 focus:ring-orange-500 focus:border-orange-500 outline-none"
                    placeholder="Enter your email"
                    disabled={isLoading}
                    autoComplete="email"
                  />
                </div>
                {errors.email && (
                  <p className="mt-1 text-sm text-red-600">
                    {errors.email.message}
                  </p>
                )}
              </div>

              <div>
                <button
                  type="submit"
                  className={`w-full py-2.5 px-4 hover:bg-orange-600 hover:text-white bg-zinc-100 border border-orange-700 text-orange-700 font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 transition-colors duration-200 ${
                    isLoading ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  disabled={isLoading}
                >
                  {isLoading ? 'Sending...' : 'Send Reset Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
        <div className="mt-6 text-center">
          <Link
            to="/login"
            className="text-sm text-orange-700 hover:text-orange-500"
          >
            ← Back to login
          </Link>
        </div>
      </div>
    </div>
  )
}
