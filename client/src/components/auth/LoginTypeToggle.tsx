export const LoginTypeToggle = ({
  type,
  setType,
  isLoading,
}: {
  type: 'password' | 'password-less'
  isLoading?: boolean
  setType: (type: 'password' | 'password-less') => void
}) => {
  return (
    <div className="w-full bg-zinc-100 dark:bg-stone-950 relative flex my-4  rounded-lg px-1 py-1 border">
      <div
        className={`absolute border  top-1 bottom-1 bg-white dark:bg-stone-900 rounded-lg transition-all duration-300 ease-in-out ${
          type === 'password'
            ? 'left-1 right-1/2 mr-0.5'
            : 'left-1/2 right-1 ml-0.5'
        }`}
      />
      <button
        onClick={() => setType('password')}
        disabled={isLoading}
        className={`disabled:cursor-not-allowed relative z-10 flex-1 px-4 py-1.5 text-sm font-medium rounded-md transition-colors duration-1  ${
          type === 'password'
            ? 'text-orange-600'
            : 'text-stone-600 dark:text-stone-400 hover:text-gray-900'
        }`}
      >
        Password
      </button>
      <button
        onClick={() => setType('password-less')}
        disabled={isLoading}
        className={`disabled:cursor-not-allowed relative z-10 flex-1 px-4 py-1.5 text-sm font-medium rounded-md transition-colors duration-1  ${
          type === 'password-less'
            ? 'text-orange-600'
            : 'text-stone-600 dark:text-stone-400 hover:text-gray-900'
        }`}
      >
        Password-less
      </button>
    </div>
  )
}
