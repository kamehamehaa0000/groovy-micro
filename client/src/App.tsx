import { useEffect, useState } from 'react'
import { Link, Route, BrowserRouter, Routes } from 'react-router'

import Signin, { CombinedSignin } from './pages/Signin'
import { authStore } from './store/auth-store'
import VerifyMagicLink from './components/VerifyMagicLink'
import { SigninModal } from './store/modal-store'
import Upload from './pages/upload'

function App() {
  const { isLoggedIn } = authStore()
  const { open: openSigninModal } = SigninModal()
  return (
    <div className="w-screen min-h-screen ">
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={
              <div className="relative">
                <h1 className="text-2xl font-bold text-center mt-10">
                  Welcome to the Groovy Microservices Project
                </h1>
                {!isLoggedIn ? (
                  <>
                    <button
                      onClick={() => {
                        openSigninModal()
                      }}
                    >
                      login modal
                    </button>
                    <Link
                      to="/login"
                      className="block text-center mt-5 text-blue-500 hover:underline"
                    >
                      login
                    </Link>
                  </>
                ) : (
                  <Link
                    to="/songs"
                    className="block text-center mt-5 text-blue-500 hover:underline"
                  >
                    songs
                  </Link>
                )}
              </div>
            }
          />
          <Route path="/upload" element={<Upload />} />
          <Route path="/login" element={<Signin />} />
          <Route path="/login-success" element={<SuccessPage />} />
          <Route path="/auth/magic-link" element={<VerifyMagicLink />} />
        </Routes>
      </BrowserRouter>
    </div>
  )
}

export default App

const SuccessPage = () => {
  const { setToken, setIsLoggedIn } = authStore()
  const [isValidRequest, setIsValidRequest] = useState(true)

  useEffect(() => {
    console.log('SuccessPage mounted')
    const urlParams = new URLSearchParams(window.location.search)
    const accessToken = urlParams.get('token')
    if (accessToken) {
      setToken(accessToken)
      setIsLoggedIn(true)
      window.history.replaceState({}, document.title, window.location.pathname)
      window.close()
    }
  }, [])

  if (!isValidRequest) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen w-full bg-zinc-900 text-white">
        <div className="text-2xl font-bold mb-4 text-center">
          Invalid request please back to
          <br />
          <a href="/login">Login page</a>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen w-full bg-zinc-900 text-white">
      <div className="text-center">
        <div className="text-6xl mb-4">✅</div>
        <h1 className="text-2xl font-bold mb-4">Login Successful!</h1>
        <p className="mt-4 text-gray-300">You have successfully logged in!</p>

        {window.opener ? (
          <p className="mt-2 text-sm text-gray-400">
            This window will close automatically...
          </p>
        ) : (
          <p className="mt-2 text-sm text-gray-400">
            Redirecting to dashboard...
          </p>
        )}
      </div>
    </div>
  )
}
