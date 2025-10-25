import { Route, BrowserRouter, Routes } from 'react-router'
import Upload from './pages/Upload'
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
import { MainLayout } from './layouts/MainLayout'
import { HomePage } from './pages/Homepage'
import { CreatePlaylistModal } from './components/modals/CreatePlaylistModal'
import SongDetailPage from './pages/SongDetailPage'
import AlbumDetailPage from './pages/AlbumDetailPage'
import ArtistDetailPage from './pages/ArtistDetailPage'
import PlaylistDetailPage from './pages/PlaylistDetailPage'
import { useAuthStore } from './store/auth-store'
import { useEffect, useState } from 'react'
import AllSongsPage from './pages/AllSongsPage'
import AllAlbumsPage from './pages/AllAlbumsPage'
import AllPlaylistsPage from './pages/AllPlaylistsPage'
import SearchPage from './pages/SearchPage'
import SearchSongsPage from './pages/SearchSongsPage'
import SearchAlbumsPage from './pages/SearchAlbumsPage'
import SearchPlaylistsPage from './pages/SearchPlaylistsPage'
import SearchArtistsPage from './pages/SearchArtistsPage'
import LikedAlbumsPage from './pages/LikedAlbumsPage'
import LikedSongsPage from './pages/LikedSongsPage'
import LikedPlaylistsPage from './pages/LikedPlaylistsPage'
import { PromptModal } from './components/modals/PromtModal'
import AllArtistsPage from './pages/AllArtistsPage'
import {
  useAddAlbumToPlaylistModalStore,
  useAddToPlaylistModalStore,
  useChangeDisplayNameModalStore,
  useCreatePlaylistModalStore,
} from './store/modal-store'
import { ChangeDisplayNameModal } from './components/modals/ChangeDisplayNameModal'
import { AddAlbumToPlaylistModal } from './components/modals/AddAlbumToPlaylistModal'
import { AddSongToPlaylistModal } from './components/modals/AddToPlaylistModal'
import MyUploads from './pages/MyUploads'

function App() {
  const { initializeAuth, isLoading, isInitialized } = useAuthStore()
  const [appReady, setAppReady] = useState<boolean>(false)
  useEffect(() => {
    const initialize = async () => {
      try {
        await initializeAuth()
      } catch (error) {
        console.error('Failed to initialize auth:', error)
      } finally {
        setAppReady(true)
      }
    }

    initialize()
  }, [initializeAuth])

  // Show loading while initializing
  if (!appReady || (isLoading && !isInitialized)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-700 mx-auto"></div>
          <p className="mt-4 text-gray-600">Initializing app...</p>
        </div>
      </div>
    )
  }

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
                  <Route
                    path="/upload"
                    element={
                      <ProtectedRoute>
                        <Upload />
                      </ProtectedRoute>
                    }
                  />{' '}
                  <Route
                    path="/search"
                    element={
                      <ProtectedRoute>
                        <SearchPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/search/songs"
                    element={
                      <ProtectedRoute>
                        <SearchSongsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/search/albums"
                    element={
                      <ProtectedRoute>
                        <SearchAlbumsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/search/playlists"
                    element={
                      <ProtectedRoute>
                        <SearchPlaylistsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/search/artists"
                    element={
                      <ProtectedRoute>
                        <SearchArtistsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/songs"
                    element={
                      <ProtectedRoute>
                        <AllSongsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/songs/song/:id"
                    element={
                      <ProtectedRoute>
                        <SongDetailPage />
                      </ProtectedRoute>
                    }
                  />{' '}
                  <Route
                    path="/albums"
                    element={
                      <ProtectedRoute>
                        <AllAlbumsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/albums/album/:id"
                    element={
                      <ProtectedRoute>
                        <AlbumDetailPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/artists"
                    element={
                      <ProtectedRoute>
                        <AllArtistsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/artists/artist/:artistId"
                    element={
                      <ProtectedRoute>
                        <ArtistDetailPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/playlists"
                    element={
                      <ProtectedRoute>
                        <AllPlaylistsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/playlists/playlist/:id"
                    element={
                      <ProtectedRoute>
                        <PlaylistDetailPage />
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
                  <Route
                    path="/liked-songs"
                    element={
                      <ProtectedRoute>
                        <LikedSongsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/liked-albums"
                    element={
                      <ProtectedRoute>
                        <LikedAlbumsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/liked-playlists"
                    element={
                      <ProtectedRoute>
                        <LikedPlaylistsPage />
                      </ProtectedRoute>
                    }
                  />{' '}
                  <Route
                    path="/my-uploads"
                    element={
                      <ProtectedRoute>
                        <MyUploads />
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
        <CreatePlaylistModal
          useStore={useCreatePlaylistModalStore}
          title="Create New Playlist"
        />
        <ChangeDisplayNameModal
          title="Change Display Name"
          useStore={useChangeDisplayNameModalStore}
        />
        <AddAlbumToPlaylistModal
          title="Add Album to Playlist"
          useStore={useAddAlbumToPlaylistModalStore}
        />
        <AddSongToPlaylistModal
          title="Add Song to Playlist"
          useStore={useAddToPlaylistModalStore}
        />
      </BrowserRouter>
      <Toaster />
    </div>
  )
}

export default App
