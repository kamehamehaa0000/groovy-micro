import { Route, BrowserRouter, Routes, Link } from 'react-router'
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
import { MainLayout } from './layouts/MainLayout'
import { HomePage } from './pages/Homepage'
import { CgClose } from 'react-icons/cg'
import { CreatePlaylistModal } from './components/shared/CreatePlaylistModal'
import AddToPlaylistModal from './components/shared/AddToPlaylistModal'

import SongDetailPage from './pages/SongDetailPage'
import AlbumDetailPage from './pages/AlbumDetailPage'

function App() {
  return (
    <div className="w-screen min-h-screen">
      <BrowserRouter>
        <Routes>
          {/* Routes WITHOUT MainLayout (auth pages, etc.) */}

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

          {/* Routes WITH MainLayout - catch all other routes */}
          <Route
            path="/*"
            element={
              <MainLayout>
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/home" element={<HomePage />} />
                  <Route path="/upload" element={<Upload />} />{' '}
                  <Route
                    path="/songs/song/:id"
                    element={
                      <ProtectedRoute>
                        <SongDetailPage />
                      </ProtectedRoute>
                    }
                  />{' '}
                  <Route
                    path="/albums/album/:id"
                    element={
                      <ProtectedRoute>
                        <AlbumDetailPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/profile"
                    element={
                      <ProtectedRoute>
                        <div>Profile Page</div>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/playlists"
                    element={
                      <ProtectedRoute>
                        <div>Playlists Page</div>
                      </ProtectedRoute>
                    }
                  />
                  {/* Add any other main app routes here */}
                </Routes>
              </MainLayout>
            }
          />
        </Routes>
        <PromptModal />
        <CreatePlaylistModal />
        <AddToPlaylistModal />
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
    <div className="fixed top-0 left-0 p-6 w-screen h-screen inset-0 bg-black/60 bg-opacity-50 flex items-center justify-center z-50">
      {/*container*/}
      <div className="relative flex  bg-white rounded-md shadow-xl max-w-2xl w-full h-96 overflow-hidden">
        <button
          onClick={close}
          className=" bg-black/40 rounded-full absolute right-4 top-4 z-10 text-gray-100 hover:text-gray-400 transition-colors"
        >
          <CgClose size={24} />
        </button>

        {/* Left side - Content */}
        <div className="flex-1 flex flex-col justify-center p-4 lg:p-6">
          <h2 className="text-2xl lg:text-3xl font-bold mb-4 text-gray-800">
            Sign-In to tune into your Groovy
          </h2>
          <p className="text-gray-600 mb-8 text-base lg:text-md">
            Please sign in to continue enjoying your music experience.
          </p>

          <div className="space-y-4">
            <Link
              to={'/login'}
              onClick={close}
              className="inline-block w-full text-center bg-orange-600 text-white px-6 py-3 rounded-lg hover:bg-orange-700 transition-colors font-medium"
            >
              Sign In
            </Link>

            <p className="text-sm text-gray-500 text-center">
              Don't have an account?{' '}
              <Link
                to={'/register'}
                onClick={close}
                className="text-orange-600 hover:text-orange-700 font-medium"
              >
                Sign Up
              </Link>
            </p>
          </div>
        </div>

        {/* Right side - Image */}
        <div className="flex-1 hidden md:block">
          <img
            src="https://plus.unsplash.com/premium_photo-1731612462772-0c7fa0377ccb?q=80&w=735&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
            alt="Sign In Prompt"
            className="w-full h-full object-cover"
          />
        </div>
      </div>
    </div>
  )
}
