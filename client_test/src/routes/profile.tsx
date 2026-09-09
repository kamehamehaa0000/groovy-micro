import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useState, useRef, useEffect } from 'react'
import { useAuthStore } from '../stores/auth.store'
import { api } from '../lib/api'

export const Route = createFileRoute('/profile')({
  component: ProfileComponent,
})

function ProfileComponent() {
  const navigate = useNavigate()
  const {
    user,
    isAuthenticated,
    isLoading,
    refreshProfile,
    logout,
    revokeAll,
  } = useAuthStore()

  const [displayName, setDisplayName] = useState('')
  const [profileMsg, setProfileMsg] = useState<{
    text: string
    type: 'success' | 'error'
  } | null>(null)
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false)

  // Avatar Upload State
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Password State
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [showPasswords, setShowPasswords] = useState(false)
  const [revokeOthers, setRevokeOthers] = useState(true)
  const [passwordMsg, setPasswordMsg] = useState<{
    text: string
    type: 'success' | 'error'
  } | null>(null)
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false)

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate({ to: '/login' })
    }
  }, [isLoading, isAuthenticated, navigate])

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName)
    }
  }, [user])

  if (isLoading || !user) {
    return (
      <div className="py-24 text-center font-mono text-xs uppercase tracking-[0.16em] text-ink-soft animate-pulse">
        Retrieving member records...
      </div>
    )
  }

  // --- Profile Update (Display Name) ---
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setProfileMsg(null)
    setIsUpdatingProfile(true)

    try {
      await api.patch('/api/v1/users/profile', { displayName })
      await refreshProfile()
      setProfileMsg({
        text: 'Curator display name updated successfully.',
        type: 'success',
      })
    } catch (err: any) {
      setProfileMsg({ text: err.message, type: 'error' })
    } finally {
      setIsUpdatingProfile(false)
    }
  }

  // --- Avatar Pre-Signed URL Direct Upload ---
  const handleAvatarFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0]
    if (!file) return

    setProfileMsg(null)
    setIsUploadingAvatar(true)

    try {
      const ext = file.name.split('.').pop() || 'webp'

      // 1. Request Pre-Signed URL from Backend
      const presignedRes = await api.post<{
        uploadUrl: string
        storageKey: string
        publicUrl: string
      }>('/api/v1/storage/presigned-url', {
        category: 'USER_AVATAR',
        resourceId: user.id,
        mimeType: file.type || 'image/webp',
        fileExtension: ext,
        fileSizeBytes: file.size,
      })

      // 2. Direct binary PUT upload to Cloudflare R2
      const uploadRes = await fetch(presignedRes.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type || 'image/webp',
        },
        body: file,
      })

      if (!uploadRes.ok) {
        throw new Error(
          `Direct R2 upload failed with status ${uploadRes.status}`,
        )
      }

      // 3. Commit avatar URL to PostgreSQL profile
      await api.patch('/api/v1/users/profile', {
        avatarUrl: presignedRes.publicUrl,
      })

      await refreshProfile()
      setProfileMsg({
        text: 'Avatar uploaded directly to Cloudflare R2 storage archive.',
        type: 'success',
      })
    } catch (err: any) {
      setProfileMsg({
        text: `Avatar upload failed: ${err.message}`,
        type: 'error',
      })
    } finally {
      setIsUploadingAvatar(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // --- Password Update ---
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordMsg(null)
    setIsUpdatingPassword(true)

    try {
      const res = await api.patch<{ message: string; accessToken?: string }>(
        '/api/v1/users/password',
        {
          currentPassword,
          newPassword,
          revokeOtherSessions: revokeOthers,
        },
      )

      // If other sessions were revoked, backend returned fresh access token
      if (res.accessToken) {
        useAuthStore.getState().setAccessToken(res.accessToken)
      }

      setPasswordMsg({ text: res.message, type: 'success' })
      setCurrentPassword('')
      setNewPassword('')
    } catch (err: any) {
      setPasswordMsg({ text: err.message, type: 'error' })
    } finally {
      setIsUpdatingPassword(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <div className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-blue-deep mb-2">
          Curator Identity & Account
        </div>
        <h1 className="font-serif italic text-3xl sm:text-4xl text-ink leading-tight font-normal">
          User Profile & Account
        </h1>
        <p className="font-sans text-xs text-ink-soft mt-1 leading-relaxed">
          Manage member identity, high-fidelity storage uploads, and
          cryptographic credentials.
        </p>
      </div>

      {/* User Identity Card */}
      <div className="border border-line bg-panel p-8 shadow-xs flex flex-col sm:flex-row items-center gap-8">
        <div className="flex flex-col items-center">
          <div className="w-24 h-24 rounded-full overflow-hidden border border-line bg-canvas-deep flex items-center justify-center relative shadow-xs">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.displayName}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="font-serif italic text-3xl font-semibold text-ink">
                {user.displayName.charAt(0).toUpperCase()}
              </span>
            )}
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleAvatarFileChange}
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadingAvatar}
            className="mt-3 font-mono text-[9.5px] uppercase tracking-widest px-3 py-1.5 border border-line bg-canvas hover:bg-canvas-deep text-ink transition-colors cursor-pointer disabled:opacity-50"
          >
            {isUploadingAvatar ? 'Transferring...' : 'Upload to R2'}
          </button>
        </div>

        <div className="flex-1 text-center sm:text-left space-y-2">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
            <h2 className="font-serif italic text-2xl font-medium text-ink">
              {user.displayName}
            </h2>
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] px-2 py-0.5 border border-line bg-canvas-deep text-ink-soft">
              {user.role}
            </span>
            {user.isEmailVerified ? (
              <span className="font-mono text-[9px] uppercase tracking-[0.12em] px-2 py-0.5 border border-emerald-800/30 bg-emerald-900/10 text-emerald-600 dark:text-emerald-400">
                Verified ✓
              </span>
            ) : (
              <span className="font-mono text-[9px] uppercase tracking-[0.12em] px-2 py-0.5 border border-amber-800/30 bg-amber-900/10 text-amber-600 dark:text-amber-400">
                Unverified
              </span>
            )}
          </div>

          <p className="font-sans text-xs text-ink-soft">{user.email}</p>

          <div className="pt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
            Catalog Access Tier:{' '}
            <span className="text-blue font-medium">
              {user.plan?.name || 'Standard Member'}
            </span>
          </div>
        </div>
      </div>

      {/* Artist Studio Card */}
      <div className="border border-line bg-panel p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-blue mb-1">
            Artist Presence · Maison Studio
          </div>
          <h3 className="font-serif italic text-lg text-ink">
            {user.role === 'ARTIST'
              ? 'Artist Studio Suite Active'
              : 'Musician or Recording Artist?'}
          </h3>
          <p className="font-sans text-xs text-ink-soft mt-0.5">
            {user.role === 'ARTIST'
              ? 'Manage your stage name, Cloudflare R2 banner, verification desk, and telemetry.'
              : 'Upgrade to an Artist account in seconds. Create your identity, upload banners, and release tracks.'}
          </p>
        </div>

        <Link
          to="/studio"
          className="self-start sm:self-auto shrink-0 font-mono text-[10.5px] uppercase tracking-[0.14em] py-2 px-4 bg-ink text-canvas hover:opacity-90 transition-opacity"
        >
          {user.role === 'ARTIST' ? 'Open Artist Studio →' : '✦ Become an Artist'}
        </Link>
      </div>

      {/* Display Name Form */}
      <div className="border border-line bg-panel p-8 shadow-xs">
        <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-blue-deep mb-1">
          Identity · Display
        </div>
        <h3 className="font-serif italic text-xl text-ink mb-4 font-normal">
          Curator Name
        </h3>

        {profileMsg && (
          <div
            className={`mb-5 p-3.5 border text-xs ${
              profileMsg.type === 'success'
                ? 'border-emerald-800/30 bg-emerald-900/10 text-emerald-600 dark:text-emerald-400'
                : 'border-red-800/30 bg-red-900/10 text-red-600 dark:text-red-400'
            }`}
          >
            {profileMsg.text}
          </div>
        )}

        <form
          onSubmit={handleUpdateProfile}
          className="flex flex-col sm:flex-row gap-4 items-end"
        >
          <div className="flex-1 w-full flex flex-col gap-1.5">
            <label
              htmlFor="edit-display-name"
              className="font-mono text-[9.5px] uppercase tracking-widest text-ink-soft"
            >
              Address As
            </label>
            <input
              id="edit-display-name"
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full border-0 border-b border-line bg-transparent outline-none font-sans text-sm text-ink py-2 focus:border-ink placeholder:text-stone transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={isUpdatingProfile}
            className="w-full sm:w-auto bg-ink text-canvas border border-ink py-2.5 px-6 font-mono text-[11px] uppercase tracking-[0.12em] font-medium transition-all hover:bg-canvas hover:text-ink disabled:opacity-50 cursor-pointer"
          >
            {isUpdatingProfile ? 'Recording...' : 'Save Identity'}
          </button>
        </form>
      </div>

      {/* Password Update Form */}
      <div className="border border-line bg-panel p-8 shadow-xs">
        <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-blue-deep mb-1">
          Security
        </div>
        <h3 className="font-serif italic text-xl text-ink mb-4 font-normal">
          Change Password
        </h3>

        {passwordMsg && (
          <div
            className={`mb-5 p-3.5 border text-xs ${
              passwordMsg.type === 'success'
                ? 'border-emerald-800/30 bg-emerald-900/10 text-emerald-600 dark:text-emerald-400'
                : 'border-red-800/30 bg-red-900/10 text-red-600 dark:text-red-400'
            }`}
          >
            {passwordMsg.text}
          </div>
        )}

        <form onSubmit={handleUpdatePassword} className="flex flex-col gap-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="curr-pass"
                className="font-mono text-[9.5px] uppercase tracking-widest text-ink-soft"
              >
                Current Password
              </label>
              <input
                id="curr-pass"
                type={showPasswords ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full border-0 border-b border-line bg-transparent outline-none font-sans text-sm text-ink py-2 focus:border-ink placeholder:text-stone transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="new-pass"
                className="font-mono text-[9.5px] uppercase tracking-widest text-ink-soft"
              >
                New Password
              </label>
              <input
                id="new-pass"
                type={showPasswords ? 'text' : 'password'}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full border-0 border-b border-line bg-transparent outline-none font-sans text-sm text-ink py-2 focus:border-ink placeholder:text-stone transition-colors"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={revokeOthers}
                onChange={(e) => setRevokeOthers(e.target.checked)}
                className="accent-ink w-3.5 h-3.5"
              />
              <span className="font-sans text-xs text-ink-soft">
                Revoke all other active sessions across devices
              </span>
            </label>

            <button
              type="button"
              onClick={() => setShowPasswords(!showPasswords)}
              className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-ink-soft hover:text-ink cursor-pointer"
            >
              {showPasswords ? 'Hide Passwords' : 'Show Passwords'}
            </button>
          </div>

          <button
            type="submit"
            disabled={isUpdatingPassword}
            className="w-full sm:w-auto self-start mt-2 border border-line bg-panel hover:bg-canvas-deep text-ink py-2.5 px-6 font-mono text-[11px] uppercase tracking-[0.12em] transition-all disabled:opacity-50 cursor-pointer"
          >
            {isUpdatingPassword ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>

      {/* Session & Device Controls */}
      <div className="border border-line bg-panel p-8 shadow-xs">
        <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-blue-deep mb-1">
          Session Management
        </div>
        <h3 className="font-serif italic text-xl text-ink mb-1 font-normal">
          Session & Device Controls
        </h3>
        <p className="font-sans text-xs text-ink-soft mb-6 leading-relaxed">
          Manage active sessions and revoke access for all other devices.
        </p>

        <div className="flex flex-wrap gap-4">
          <button
            type="button"
            onClick={() => logout()}
            className="font-mono text-[10.5px] uppercase tracking-widest border border-line bg-canvas hover:bg-canvas-deep text-ink px-5 py-2.5 transition-colors cursor-pointer"
          >
            Sign Out This Device
          </button>
          <button
            type="button"
            onClick={() => revokeAll()}
            className="font-mono text-[10.5px] uppercase tracking-widest border border-red-800/40 bg-red-900/10 hover:bg-red-900/20 text-red-600 dark:text-red-400 px-5 py-2.5 transition-colors cursor-pointer"
          >
            Revoke All Sessions Everywhere
          </button>
        </div>
      </div>
    </div>
  )
}
