import { Link, Route, BrowserRouter, Routes } from 'react-router'
import { authStore } from './store/auth-store'
import Upload from './pages/upload'
import Login from './pages/Login'
import { Toaster } from 'react-hot-toast'
import { LoginSuccessHandler } from './components/auth/LoginSuccessHandler'
import { MagicLinkHandler } from './components/auth/MagicLinkHandler'
import { PasswordResetPage } from './components/auth/PasswordResetPage'
import { EmailVerificationPage } from './components/auth/EmailVerificationPage'
import { Register } from './pages/Register'

import { ForgotPassword } from './pages/ForgetPassword'
import { SendVerificationEmail } from './pages/SendVerificationEmail'
import ProtectedRoute from './components/shared/ProtectedRoute'
import { useSigninPromptModalStore } from './store/modal-store'

function App() {
  const { isAuthenticated } = authStore()

  return (
    <div className="w-screen min-h-screen ">
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={
              <div className="relative h-full flex flex-col items-center justify-center">
                <h1 className="text-2xl font-bold text-center mt-10">
                  Welcome to the Groovy Microservices Project
                  <br />
                  <button
                    onClick={() =>
                      !isAuthenticated
                        ? useSigninPromptModalStore.getState().open()
                        : alert('You are already logged in!')
                    }
                    className="bg-blue-500 text-white px-4 py-2 rounded mt-5 hover:bg-blue-600 transition-colors"
                  >
                    Play
                  </button>
                </h1>
                {!isAuthenticated ? (
                  <div>
                    <Link
                      to="/login"
                      className="block text-center mt-5 text-blue-500 hover:underline"
                    >
                      login
                    </Link>
                  </div>
                ) : (
                  <div className="text-center">
                    <li>{authStore.getState().user?.displayName}</li>
                    <li>{authStore.getState().user?.email}</li>
                    <li>{authStore.getState().user?.id}</li>
                    <button
                      className="mx-auto block text-center mt-5 text-blue-500 hover:underline"
                      onClick={() => authStore.getState().logout()}
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <div> PROFILE BOLTE</div>
              </ProtectedRoute>
            }
          />
          <Route path="/upload" element={<Upload />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify-email" element={<SendVerificationEmail />} />
          <Route
            path="/auth/verify-email"
            element={<EmailVerificationPage />}
          />
          <Route path="/auth/reset-password" element={<PasswordResetPage />} />
          <Route path="/auth/magic-link" element={<MagicLinkHandler />} />
          <Route path="/login-success" element={<LoginSuccessHandler />} />
        </Routes>
        <PromptModal />
      </BrowserRouter>
      <Toaster />
    </div>
  )
}

export default App

const PromptModal = () => {
  const { isOpen, close } = useSigninPromptModalStore()
  if (!isOpen) return null
  return (
    <div className="fixed top-0 left-0 w-screen h-screen inset-0 bg-gray-500 bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded shadow-lg">
        <h2 className="text-xl font-bold mb-4">Sign In Required</h2>
        <p className="mb-4">Please sign in to continue.</p>
        <button
          onClick={close}
          className="bg-blue-500 text-white px-4 py-2 rounded mt-5 hover:bg-blue-600 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  )
}
