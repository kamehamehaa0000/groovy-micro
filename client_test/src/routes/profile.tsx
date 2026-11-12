import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import {
  useState,
  useRef,
  useEffect,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../stores/auth.store'
import { useEntitlementsStore } from '../stores/entitlements.store'
import { api } from '../lib/api'
import { catalogApi } from '../lib/catalog.api'
import { subscriptionsApi } from '../lib/subscriptions.api'
import { socialApi } from '../lib/social.api'
import { artistsApi } from '../lib/artists.api'
import { isArtistAccount } from '../lib/artist-status'
import type { ArtistProfile } from '../types/artist'
import {
  notificationsApi,
  type NotificationPreferences,
} from '../lib/notifications.api'
import type { PreSavedRelease } from '../types/catalog'
import type { UserEntitlements } from '../types/subscriptions'
import { Switch } from '../Components/ui'
import { Loader2Icon } from 'lucide-react'
import { notify } from '../lib/toast'
import { ConfirmDialog } from '../Components/ui/Modal'
import { SettingsShell } from '../Components/settings/SettingsShell'
import { PlanComparison } from '../Components/subscriptions/PlanComparison'
import type { UserProfile } from '../types/auth'

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

  const entitlements = useEntitlementsStore((s) => s.entitlements)
  const upgradePlanStore = useEntitlementsStore((s) => s.upgradePlan)
  const cancelSubscriptionStore = useEntitlementsStore(
    (s) => s.cancelSubscription,
  )
  const isLoadingEntitlements = useEntitlementsStore((s) => s.isLoading)

  type ProfileTab =
    'account' | 'subscription' | 'privacy' | 'notifications' | 'security'
  const [activeTab, setActiveTab] = useState<ProfileTab>('account')

  const [displayName, setDisplayName] = useState('')
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false)

  // Pre-Saved Releases State

  // Subscriptions & Plans Selection Modal State
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false)
  const [isConfirmCancelOpen, setIsConfirmCancelOpen] = useState(false)
  const [isUpgradingPlan, setIsUpgradingPlan] = useState(false)

  // Avatar Upload State
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Password State
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [showPasswords, setShowPasswords] = useState(false)
  const [revokeOthers, setRevokeOthers] = useState(true)
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false)

  // Privacy & Social Circles State
  const [isPrivateAccount, setIsPrivateAccount] = useState(false)
  const [listeningActivityPrivacy, setListeningActivityPrivacy] = useState<
    'FRIENDS_ONLY' | 'FOLLOWERS' | 'OFF'
  >('FRIENDS_ONLY')
  const [libraryPrivacy, setLibraryPrivacy] = useState<
    'PUBLIC' | 'FOLLOWERS_ONLY' | 'PRIVATE'
  >('PUBLIC')
  const [lockerIncludeInSearch, setLockerIncludeInSearch] = useState(true)
  const [lockerIncludeInHome, setLockerIncludeInHome] = useState(false)
  const [lockerIncludeInRecentlyPlayed, setLockerIncludeInRecentlyPlayed] =
    useState(true)
  const [lockerLinkToGlobalArtists, setLockerLinkToGlobalArtists] =
    useState(false)
  const [isSavingPrivacy, setIsSavingPrivacy] = useState(false)

  // Notification Delivery Preferences State
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>({
    emailReleases: true,
    emailComments: true,
    pushSocial: true,
    pushJams: true,
  })
  /** The stored values, so the form can say whether it has unsaved changes. */
  const [savedNotifPrefs, setSavedNotifPrefs] =
    useState<NotificationPreferences | null>(null)
  const [isSavingNotifPrefs, setIsSavingNotifPrefs] = useState(false)

  // Artist Profile State

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate({ to: '/login', search: { redirect: '/profile' } })
    }
  }, [isLoading, isAuthenticated, navigate])

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName)
      setIsPrivateAccount(!!user.isPrivateAccount)
      setListeningActivityPrivacy(
        user.listeningActivityPrivacy || 'FRIENDS_ONLY',
      )
      setLibraryPrivacy(user.libraryPrivacy || 'PUBLIC')
      setLockerIncludeInSearch(user.lockerIncludeInSearch ?? true)
      setLockerIncludeInHome(user.lockerIncludeInHome ?? false)
      setLockerIncludeInRecentlyPlayed(
        user.lockerIncludeInRecentlyPlayed ?? true,
      )
      setLockerLinkToGlobalArtists(user.lockerLinkToGlobalArtists ?? false)
    }
  }, [user])

  // The three requests the profile needs are cached by React Query, so
  // switching tabs or coming back does not refetch them, and a failure in one
  // no longer cancels the others.
  const preSavesQuery = useQuery({
    queryKey: ['pre-saves', 'mine'],
    queryFn: () => catalogApi.getMyPreSaves(),
    enabled: isAuthenticated,
  })

  const notifPrefsQuery = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: () => notificationsApi.getPreferences(),
    enabled: isAuthenticated,
  })

  const artistProfileQuery = useQuery({
    queryKey: ['artist-profile', 'mine'],
    queryFn: () => artistsApi.getMyProfile(),
    enabled: isAuthenticated,
    retry: false,
  })

  const preSaves = preSavesQuery.data?.presaves ?? []
  const isLoadingPreSaves = preSavesQuery.isLoading
  const artistProfile = artistProfileQuery.data ?? null
  const isLoadingArtistProfile = artistProfileQuery.isLoading

  // The stored preferences are the baseline the form is compared against.
  useEffect(() => {
    const preferences = notifPrefsQuery.data?.preferences
    if (!preferences) return
    setNotifPrefs(preferences)
    setSavedNotifPrefs(preferences)
  }, [notifPrefsQuery.data])

  useEffect(() => {
    if (!isAuthenticated) return
    void useEntitlementsStore.getState().initializeEntitlements()
  }, [isAuthenticated])

  if (isLoading || !user) {
    return (
      <div className="py-24 text-center font-eyebrow text-caption uppercase tracking-wider text-muted-foreground animate-pulse">
        Retrieving member records...
      </div>
    )
  }

  // Owning an artist profile is what makes an account an artist. An admin
  // without a profile is still only an admin, so the studio messaging must not
  // claim an artist presence that /studio cannot find.
  const isArtist = isArtistAccount(user, artistProfile)

  // --- Profile Update (Display Name) ---
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsUpdatingProfile(true)

    try {
      await api.patch('/api/v1/users/profile', {
        displayName: displayName.trim(),
      })
      await refreshProfile()
      notify.success('Curator display name updated successfully.')
    } catch (err: any) {
      notify.error('Failed to update curator display name: ' + err.message)
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

    setIsUploadingAvatar(true)

    try {
      const { uploadUrl, publicUrl } = await api.post<{
        uploadUrl: string
        publicUrl: string
      }>('/api/v1/storage/presign', {
        preset: 'AVATAR',
        contentType: file.type,
      })

      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      })

      if (!uploadRes.ok) {
        throw new Error(
          `Direct S3/R2 storage rejected upload (${uploadRes.status})`,
        )
      }

      await api.patch('/api/v1/users/profile', { avatarUrl: publicUrl })
      await refreshProfile()

      notify.success(
        'Avatar uploaded directly to Cloudflare R2 storage archive.',
      )
    } catch (err: any) {
      notify.error('Failed to upload avatar: ' + err.message)
    } finally {
      setIsUploadingAvatar(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // --- Password Update ---
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
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

      if (res.accessToken) {
        useAuthStore.getState().setAccessToken(res.accessToken)
      }

      notify.success(res.message || 'Password updated successfully.')
      setCurrentPassword('')
      setNewPassword('')
    } catch (err: any) {
      notify.error(err.message || 'Failed to update password')
    } finally {
      setIsUpdatingPassword(false)
    }
  }

  // --- Privacy: dirty state -------------------------------------------------
  // Toggling a switch and leaving the page used to discard the edit silently.
  const isPrivacyDirty =
    isPrivateAccount !== !!user?.isPrivateAccount ||
    listeningActivityPrivacy !==
      (user?.listeningActivityPrivacy || 'FRIENDS_ONLY') ||
    libraryPrivacy !== (user?.libraryPrivacy || 'PUBLIC') ||
    lockerIncludeInSearch !== (user?.lockerIncludeInSearch ?? true) ||
    lockerIncludeInHome !== (user?.lockerIncludeInHome ?? false) ||
    lockerIncludeInRecentlyPlayed !==
      (user?.lockerIncludeInRecentlyPlayed ?? true) ||
    lockerLinkToGlobalArtists !== (user?.lockerLinkToGlobalArtists ?? false)

  const revertPrivacy = () => {
    if (!user) return
    setIsPrivateAccount(!!user.isPrivateAccount)
    setListeningActivityPrivacy(user.listeningActivityPrivacy || 'FRIENDS_ONLY')
    setLibraryPrivacy(user.libraryPrivacy || 'PUBLIC')
    setLockerIncludeInSearch(user.lockerIncludeInSearch ?? true)
    setLockerIncludeInHome(user.lockerIncludeInHome ?? false)
    setLockerIncludeInRecentlyPlayed(user.lockerIncludeInRecentlyPlayed ?? true)
    setLockerLinkToGlobalArtists(user.lockerLinkToGlobalArtists ?? false)
  }

  // --- Privacy Settings Update ---
  const handleUpdatePrivacy = async (e: React.FormEvent) => {    e.preventDefault()
    setIsSavingPrivacy(true)

    try {
      await socialApi.updatePrivacySettings({
        isPrivateAccount,
        listeningActivityPrivacy,
        libraryPrivacy,
        lockerIncludeInSearch,
        lockerIncludeInHome,
        lockerIncludeInRecentlyPlayed,
        lockerLinkToGlobalArtists,
      })
      await refreshProfile()
      notify.success(
        'Privacy and social circle permissions updated successfully.',
      )
    } catch (err: any) {
      notify.error(err.message || 'Failed to update privacy settings')
    } finally {
      setIsSavingPrivacy(false)
    }
  }

  // --- Notification Preferences Update ---
  const handleUpdateNotifPrefs = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSavingNotifPrefs(true)

    try {
      const res = await notificationsApi.updatePreferences(notifPrefs)
      if (res.preferences) {
        setNotifPrefs(res.preferences)
        setSavedNotifPrefs(res.preferences)
      }
      notify.success(
        'Notification channels and delivery preferences updated successfully.',
      )
    } catch (err: any) {
      notify.error(err.message || 'Failed to update notification preferences')
    } finally {
      setIsSavingNotifPrefs(false)
    }
  }

  const isNotifPrefsDirty = !!savedNotifPrefs &&
    (notifPrefs.emailReleases !== savedNotifPrefs.emailReleases ||
      notifPrefs.emailComments !== savedNotifPrefs.emailComments ||
      notifPrefs.pushSocial !== savedNotifPrefs.pushSocial ||
      notifPrefs.pushJams !== savedNotifPrefs.pushJams)

  const revertNotifPrefs = () => {
    if (!savedNotifPrefs) return
    setNotifPrefs(savedNotifPrefs)
  }

  // --- Subscription Handlers ---
  // The plans and the feature catalogue are a query: they change rarely, and
  // every account page needs the same pair.
  const plansQuery = useQuery({
    queryKey: ['subscriptions', 'plans'],
    queryFn: async () => {
      const [plansRes, featuresRes] = await Promise.all([
        subscriptionsApi.getPlans(),
        subscriptionsApi.getFeatures(),
      ])
      return {
        plans: plansRes.plans,
        features: featuresRes.features,
      }
    },
    enabled: isUpgradeModalOpen,
  })

  const handleOpenUpgradeModal = async () => {
    setIsUpgradeModalOpen(true)
  }

  const handleSwitchPlan = async (planId: string) => {
    setIsUpgradingPlan(true)
    try {
      const res = await upgradePlanStore(planId)
      await refreshProfile()
      notify.success(`🎉 Switched plan to ${res.planName}!`)
      setIsUpgradeModalOpen(false)
    } catch (err: any) {
      notify.error(err.message || 'Failed to switch plan')
    } finally {
      setIsUpgradingPlan(false)
    }
  }

  const handleCancelSubscription = async () => {
    try {
      await cancelSubscriptionStore()
      await refreshProfile()
      notify.info(
        'Subscription scheduled for cancellation at the end of current period',
      )
    } catch (err: any) {
      notify.error(err.message || 'Failed to cancel subscription')
    }
  }

  return (
    <div className="select-none space-y-6">
      {/* ===================== HERO PROFILE BANNER ===================== */}
      <div className=" rounded-2xl p-4 sm:p-4 shadow-xs">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 sm:gap-6">
          {/* Avatar with Camera Overlay */}
          <div className="relative group shrink-0">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden border-2 border-border bg-muted flex items-center justify-center shadow-xs">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.displayName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="font-serif italic text-2xl sm:text-3xl font-semibold text-foreground">
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
              className="absolute bottom-0 right-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-foreground text-background border-2 border-card flex items-center justify-center hover:opacity-90 transition-opacity cursor-pointer shadow-xs disabled:opacity-50"
              title="Change Avatar"
              aria-label="Change Avatar"
            >
              {isUploadingAvatar ? (
                <div className="w-3.5 h-3.5 rounded-full border-2 border-background/30 border-t-background animate-spin" />
              ) : (
                <svg
                  className="w-3.5 h-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              )}
            </button>
          </div>

          {/* Identity & Status */}
          <div className="flex-1 text-center sm:text-left min-w-0">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-1">
              <h1 className="text-heading sm:text-2xl font-bold font-sans text-foreground tracking-tight truncate">
                {user.displayName}
              </h1>
              {user.isEmailVerified ? (
                <span className="inline-flex items-center gap-1 font-eyebrow text-eyebrow uppercase tracking-wider px-2 py-0.5 rounded-full border border-success/30 bg-success-soft text-success font-semibold">
                  <span>Verified</span>
                  <span>✓</span>
                </span>
              ) : (
                <span className="font-eyebrow text-eyebrow uppercase tracking-wider px-2 py-0.5 rounded-full border border-warning/30 bg-warning-soft text-warning font-semibold">
                  Unverified
                </span>
              )}
            </div>

            <p className="text-caption text-muted-foreground font-sans truncate mb-3">
              {user.email}
            </p>

            {/* Quick Status Badges & CTAs */}
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <span className="font-eyebrow text-eyebrow uppercase tracking-wider px-2.5 py-1 rounded-full border border-border bg-background text-muted-foreground">
                Role:{' '}
                <strong className="text-foreground">
                  {isArtist && user.role !== 'ADMIN' ? 'ARTIST' : user.role}
                </strong>
              </span>
              <span className="font-eyebrow text-eyebrow uppercase tracking-wider px-2.5 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary font-semibold">
                {entitlements?.planName || user.plan?.name || 'Groovy Free'}
              </span>
              {user.id && (
                <Link
                  to="/users/$id"
                  params={{ id: user.id }}
                  className="inline-flex items-center gap-1 font-eyebrow text-eyebrow uppercase tracking-wider px-2.5 py-1 rounded-full border border-border hover:border-foreground/50 bg-background text-foreground transition-colors no-underline"
                >
                  <span>Public Profile</span>
                  <span className="text-eyebrow">↗</span>
                </Link>
              )}
              {isArtist ? (
                <Link
                  to="/studio"
                  className="inline-flex items-center gap-1 font-eyebrow text-eyebrow uppercase tracking-wider px-2.5 py-1 rounded-full border border-info/30 bg-info-soft text-info hover:opacity-90 font-semibold transition-opacity no-underline"
                >
                  <span>Studio Desk</span>
                  <span>→</span>
                </Link>
              ) : (
                <Link
                  to="/studio"
                  className="inline-flex items-center gap-1 font-eyebrow text-eyebrow uppercase tracking-wider px-2.5 py-1 rounded-full border border-border hover:border-foreground/40 bg-background text-muted-foreground hover:text-foreground transition-colors no-underline"
                >
                  <span>Become Artist</span>
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ===================== SETTINGS AREA ===================== */}
      <SettingsShell
        nav={[
          { id: 'account', label: 'Account' },
          { id: 'subscription', label: 'Subscription' },
          { id: 'privacy', label: 'Privacy' },
          { id: 'notifications', label: 'Notifications' },
          { id: 'security', label: 'Security' },
        ]}
        value={activeTab}
        onChange={(id) => setActiveTab(id as ProfileTab)}
      >
        {/* 1. ACCOUNT & IDENTITY */}
        {activeTab === 'account' &&
          AccountIdentityTab(
            isArtist,
            artistProfile,
            handleUpdateProfile,
            displayName,
            setDisplayName,
            isUpdatingProfile,
            user,
            isLoadingArtistProfile,
            entitlements,
            isLoadingPreSaves,
            preSaves,
          )}

        {/* 2. SUBSCRIPTION & MEMBERSHIP */}
        {activeTab === 'subscription' &&
          SubscriptionTab(
            entitlements,
            user,
            isLoadingEntitlements,
            handleOpenUpgradeModal,
            () => setIsConfirmCancelOpen(true),
          )}

      {/* 3. PRIVACY & SOCIAL CIRCLES */}
      {activeTab === 'privacy' &&
        PrivacyTab(
          handleUpdatePrivacy,
          isPrivateAccount,
          setIsPrivateAccount,
          listeningActivityPrivacy,
          setListeningActivityPrivacy,
          libraryPrivacy,
          setLibraryPrivacy,
          lockerIncludeInSearch,
          setLockerIncludeInSearch,
          lockerIncludeInRecentlyPlayed,
          setLockerIncludeInRecentlyPlayed,
          lockerIncludeInHome,
          setLockerIncludeInHome,
          lockerLinkToGlobalArtists,
          setLockerLinkToGlobalArtists,
          isSavingPrivacy,
          isPrivacyDirty,
          revertPrivacy,
        )}

      {/* 4. NOTIFICATION DELIVERY */}
      {activeTab === 'notifications' &&
        NotificationPreferenceTab(
          handleUpdateNotifPrefs,
          notifPrefs,
          setNotifPrefs,
          isSavingNotifPrefs,
          isNotifPrefsDirty,
          revertNotifPrefs,
        )}

      {/* 5. SECURITY & SESSIONS */}
      {activeTab === 'security' &&
        SecurityTab(
          handleUpdatePassword,
          showPasswords,
          currentPassword,
          setCurrentPassword,
          newPassword,
          setNewPassword,
          revokeOthers,
          setRevokeOthers,
          setShowPasswords,
          isUpdatingPassword,
          logout,
          revokeAll,
        )}
      </SettingsShell>

      {/* ===================== UPGRADE / CHANGE PLAN MODAL ===================== */}
      <ConfirmDialog
        open={isConfirmCancelOpen}
        title="Cancel your plan?"
        description="Your plan stays active until the end of the current billing cycle, then it is cancelled."
        confirmLabel="Cancel plan"
        cancelLabel="Keep my plan"
        tone="danger"
        onConfirm={() => {
          setIsConfirmCancelOpen(false)
          void handleCancelSubscription()
        }}
        onCancel={() => setIsConfirmCancelOpen(false)}
      />

      <PlanComparison
        open={isUpgradeModalOpen}
        onClose={() => setIsUpgradeModalOpen(false)}
        plans={plansQuery.data?.plans ?? []}
        featureCatalog={plansQuery.data?.features ?? []}
        currentPlanId={entitlements?.planId}
        isBusy={isUpgradingPlan}
        onSelectPlan={(planId) => void handleSwitchPlan(planId)}
      />
    </div>
  )
}
function SecurityTab(
  handleUpdatePassword: (e: React.FormEvent) => Promise<void>,
  showPasswords: boolean,
  currentPassword: string,
  setCurrentPassword: Dispatch<SetStateAction<string>>,
  newPassword: string,
  setNewPassword: Dispatch<SetStateAction<string>>,
  revokeOthers: boolean,
  setRevokeOthers: Dispatch<SetStateAction<boolean>>,
  setShowPasswords: Dispatch<SetStateAction<boolean>>,
  isUpdatingPassword: boolean,
  logout: () => Promise<void>,
  revokeAll: () => Promise<void>,
): import('react').ReactNode {
  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Change Password */}
      <div className="p-2 sm:p-4 rounded-2xl shadow-xs">
        <h3 className="font-sans font-bold text-title sm:text-lg text-foreground mb-1">
          Change Password
        </h3>
        <p className="font-sans text-caption text-muted-foreground mb-5">
          Update your account credentials to keep your session and collection
          safe.
        </p>

        <form onSubmit={handleUpdatePassword} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label
                htmlFor="curr-pass"
                className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground block"
              >
                Current Password
              </label>
              <input
                id="curr-pass"
                type={showPasswords ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-border bg-background px-4 py-2.5 sm:py-3 text-body text-foreground focus:outline-none focus:border-primary transition-colors font-sans"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="new-pass"
                className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground block"
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
                className="w-full rounded-xl border border-border bg-background px-4 py-2.5 sm:py-3 text-body text-foreground focus:outline-none focus:border-primary transition-colors font-sans"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={revokeOthers}
                onChange={(e) => setRevokeOthers(e.target.checked)}
                className="accent-foreground w-4 h-4 rounded-control cursor-pointer"
              />
              <span className="font-sans text-caption text-muted-foreground">
                Revoke all other active sessions across devices
              </span>
            </label>

            <button
              type="button"
              onClick={() => setShowPasswords(!showPasswords)}
              className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground hover:text-foreground cursor-pointer self-start sm:self-auto"
            >
              {showPasswords ? 'Hide Passwords' : 'Show Passwords'}
            </button>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isUpdatingPassword}
              className="w-full sm:w-auto bg-foreground text-background font-eyebrow text-eyebrow uppercase tracking-wider font-semibold py-2.5 px-6 rounded-full hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer shadow-xs"
            >
              {isUpdatingPassword ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>

      {/* Session & Device Controls */}
      <div className="border border-border bg-card/90 p-5 sm:p-4 rounded-2xl shadow-xs space-y-4">
        <div>
          <h3 className="font-sans font-bold text-title sm:text-lg text-foreground">
            Session &amp; Device Controls
          </h3>
          <p className="font-sans text-caption text-muted-foreground mt-0.5 leading-relaxed">
            Manage active authentication tokens and sign out of remote browsers.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-1">
          <button
            type="button"
            onClick={() => logout()}
            className="font-eyebrow text-eyebrow uppercase tracking-wider border border-border bg-background hover:bg-muted text-foreground px-5 py-2.5 rounded-full transition-colors cursor-pointer text-center font-medium"
          >
            Sign Out This Device
          </button>
          <button
            type="button"
            onClick={() => revokeAll()}
            className="font-eyebrow text-eyebrow uppercase tracking-wider border border-destructive/40 bg-destructive-soft hover:bg-destructive/20 text-destructive px-5 py-2.5 rounded-full transition-colors cursor-pointer text-center font-medium"
          >
            Revoke All Sessions Everywhere
          </button>
        </div>
      </div>
    </div>
  )
}

function PrivacyTab(
  handleUpdatePrivacy: (e: React.FormEvent) => Promise<void>,
  isPrivateAccount: boolean,
  setIsPrivateAccount: Dispatch<SetStateAction<boolean>>,
  listeningActivityPrivacy: string,
  setListeningActivityPrivacy: Dispatch<
    SetStateAction<'FRIENDS_ONLY' | 'FOLLOWERS' | 'OFF'>
  >,
  libraryPrivacy: string,
  setLibraryPrivacy: Dispatch<
    SetStateAction<'PUBLIC' | 'FOLLOWERS_ONLY' | 'PRIVATE'>
  >,
  lockerIncludeInSearch: boolean,
  setLockerIncludeInSearch: Dispatch<SetStateAction<boolean>>,
  lockerIncludeInRecentlyPlayed: boolean,
  setLockerIncludeInRecentlyPlayed: Dispatch<SetStateAction<boolean>>,
  lockerIncludeInHome: boolean,
  setLockerIncludeInHome: Dispatch<SetStateAction<boolean>>,
  lockerLinkToGlobalArtists: boolean,
  setLockerLinkToGlobalArtists: Dispatch<SetStateAction<boolean>>,
  isSavingPrivacy: boolean,
  isDirty: boolean,
  onRevert: () => void,
): import('react').ReactNode {
  return (
    <div className="space-y-3 animate-in fade-in duration-150">
      <form onSubmit={handleUpdatePrivacy} className="space-y-3">
        {/* Account Privacy Toggle */}
        <div className=" p-2 sm:p-4 rounded-2xl shadow-xs flex items-center justify-between gap-3 min-w-0">
          <div className="min-w-0 flex-1 pr-2 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-sans text-body sm:text-title font-bold text-foreground">
                Private Account
              </span>
              <span
                className={`font-eyebrow text-eyebrow uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                  isPrivateAccount
                    ? 'border-warning/40 bg-warning-soft text-warning'
                    : 'border-border bg-background text-muted-foreground'
                }`}
              >
                {isPrivateAccount ? 'Gated Approval' : 'Open / Public'}
              </span>
            </div>
            <p className="font-sans text-caption text-muted-foreground max-w-xl leading-relaxed">
              When your account is private, other curators must request to
              follow you. You review each follow request in your Activity desk
              before they gain access to your follower-only library.
            </p>
          </div>

          <Switch
            id="private-account-toggle"
            checked={isPrivateAccount}
            onChange={setIsPrivateAccount}
            aria-label="Toggle private account"
          />
        </div>

        {/* Live Listening Presence Tier */}
        <div className=" p-2 sm:p-4 rounded-2xl shadow-xs space-y-3">
          <div>
            <span className="font-sans text-body sm:text-title font-bold text-foreground block">
              Live Turntable &bull; Listening Activity
            </span>
            <p className="font-sans text-caption text-muted-foreground mt-0.5 leading-relaxed">
              Choose who can see your real-time playback in the &quot;What
              Friends Are Listening To&quot; live deck.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
            {[
              {
                id: 'FRIENDS_ONLY' as const,
                title: 'Mutual Friends',
                desc: 'Only curators you both follow back can see your live vinyl turntable.',
              },
              {
                id: 'FOLLOWERS' as const,
                title: 'All Followers',
                desc: 'Any member following your profile can see your live playback session.',
              },
              {
                id: 'OFF' as const,
                title: 'Incognito / Off',
                desc: 'Never broadcast live playback. Listening history stays completely private.',
              },
            ].map((opt) => {
              const isSelected = listeningActivityPrivacy === opt.id
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setListeningActivityPrivacy(opt.id)}
                  className={`p-3.5 text-left rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-foreground bg-background shadow-xs font-medium'
                      : 'border-border bg-background/40 hover:border-foreground/40'
                  }`}
                >
                  <div className="font-eyebrow text-eyebrow uppercase tracking-wider font-semibold text-foreground flex items-center justify-between">
                    <span>{opt.title}</span>
                    {isSelected && (
                      <span className="text-success font-bold">✓</span>
                    )}
                  </div>
                  <p className="font-sans text-eyebrow text-muted-foreground mt-1 leading-snug">
                    {opt.desc}
                  </p>
                </button>
              )
            })}
          </div>
        </div>

        {/* Library Privacy Tier */}
        <div className=" p-2 sm:p-4 rounded-2xl shadow-xs space-y-3">
          <div>
            <span className="font-sans text-body sm:text-title font-bold text-foreground block">
              Library &amp; Presaves Visibility
            </span>
            <p className="font-sans text-caption text-muted-foreground mt-0.5 leading-relaxed">
              Choose who can browse your public playlists, liked songs, and
              pre-saved releases.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
            {[
              {
                id: 'PUBLIC' as const,
                title: 'Public',
                desc: 'Anyone in the community can discover your public playlists and drops.',
              },
              {
                id: 'FOLLOWERS_ONLY' as const,
                title: 'Followers Only',
                desc: 'Only approved followers can view your saved playlists and collections.',
              },
              {
                id: 'PRIVATE' as const,
                title: 'Private / Only Me',
                desc: 'Hidden from all outside visitors. Only accessible to your authenticated session.',
              },
            ].map((opt) => {
              const isSelected = libraryPrivacy === opt.id
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setLibraryPrivacy(opt.id)}
                  className={`p-3.5 text-left rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-foreground bg-background shadow-xs font-medium'
                      : 'border-border bg-background/40 hover:border-foreground/40'
                  }`}
                >
                  <div className="font-eyebrow text-eyebrow uppercase tracking-wider font-semibold text-foreground flex items-center justify-between">
                    <span>{opt.title}</span>
                    {isSelected && (
                      <span className="text-success font-bold">✓</span>
                    )}
                  </div>
                  <p className="font-sans text-eyebrow text-muted-foreground mt-1 leading-snug">
                    {opt.desc}
                  </p>
                </button>
              )
            })}
          </div>
        </div>

        {/* Personal Audio Locker & Offline Music Controls */}
        <div className=" p-2 sm:p-4 rounded-2xl shadow-xs space-y-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-sans text-body sm:text-title font-bold text-foreground">
                Personal Collection &amp; Audio Vault
              </span>
            </div>
            <p className="font-sans text-caption text-muted-foreground mt-0.5 leading-relaxed">
              Granularly control where your privately uploaded audio collection
              surfaces throughout Groovy.
            </p>
          </div>

          <div className="space-y-3">
            {/* Toggle 1: Search */}
            <div className="pt-3 first:pt-0 flex items-center justify-between gap-3 min-w-0">
              <div className="min-w-0 flex-1 pr-2">
                <div className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground font-medium">
                  Include in Global Search
                </div>
                <p className="font-sans text-eyebrow text-muted-foreground leading-snug">
                  Surface personal collection tracks in your own search bar
                  (never visible to other curators).
                </p>
              </div>
              <Switch
                checked={lockerIncludeInSearch}
                onChange={setLockerIncludeInSearch}
                aria-label="Include personal collection in search"
              />
            </div>

            {/* Toggle 2: Recently Played */}
            <div className="pt-3 flex items-center justify-between gap-3 min-w-0">
              <div className="min-w-0 flex-1 pr-2">
                <div className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground font-medium">
                  Include in Recently Played &amp; Activity
                </div>
                <p className="font-sans text-eyebrow text-muted-foreground leading-snug">
                  Record personal collection playback on your Recent shelf and
                  listening history.
                </p>
              </div>
              <Switch
                checked={lockerIncludeInRecentlyPlayed}
                onChange={setLockerIncludeInRecentlyPlayed}
                aria-label="Include in recently played"
              />
            </div>

            {/* Toggle 3: Home Feed */}
            <div className="pt-3 flex items-center justify-between gap-3 min-w-0">
              <div className="min-w-0 flex-1 pr-2">
                <div className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground font-medium">
                  Mix with Home Feed &amp; Recommendations
                </div>
                <p className="font-sans text-eyebrow text-muted-foreground leading-snug">
                  Blend your personal collection uploads into home discovery
                  shelves and mixes.
                </p>
              </div>
              <Switch
                checked={lockerIncludeInHome}
                onChange={setLockerIncludeInHome}
                aria-label="Mix with home feed"
              />
            </div>

            {/* Toggle 4: Verified Artists Link */}
            <div className="pt-3 flex items-center justify-between gap-3 min-w-0">
              <div className="min-w-0 flex-1 pr-2">
                <div className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground font-medium">
                  Link to Verified Global Artists
                </div>
                <p className="font-sans text-eyebrow text-muted-foreground leading-snug">
                  Show an &quot;In Your Collection&quot; shelf on verified
                  artist pages when you have personal tracks matching that
                  artist.
                </p>
              </div>
              <Switch
                checked={lockerLinkToGlobalArtists}
                onChange={setLockerLinkToGlobalArtists}
                aria-label="Link to verified global artists"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
          {isDirty ? (
            <>
              <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-warning">
                Unsaved changes
              </span>
              <button
                type="button"
                onClick={onRevert}
                disabled={isSavingPrivacy}
                className="rounded-full border border-border px-5 py-2.5 font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                Revert
              </button>
            </>
          ) : null}
          <button
            type="submit"
            disabled={isSavingPrivacy || !isDirty}
            className="w-full sm:w-auto bg-foreground text-background font-eyebrow text-eyebrow uppercase tracking-wider font-semibold py-2.5 px-6 rounded-full hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer shadow-xs"
          >
            {isSavingPrivacy ? 'Saving Privacy...' : 'Save Privacy Preferences'}
          </button>
        </div>
      </form>
    </div>
  )
}

function NotificationPreferenceTab(
  handleUpdateNotifPrefs: (e: React.FormEvent) => Promise<void>,
  notifPrefs: NotificationPreferences,
  setNotifPrefs: Dispatch<SetStateAction<NotificationPreferences>>,
  isSavingNotifPrefs: boolean,
  isDirty: boolean,
  onRevert: () => void,
): import('react').ReactNode {
  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      <form onSubmit={handleUpdateNotifPrefs} className="space-y-6">
        <div className=" p-5 sm:p-2 rounded-2xl shadow-xs space-y-4">
          <div>
            <span className="font-sans text-body sm:text-title font-bold text-foreground block">
              Notification Channels &amp; Delivery
            </span>
            <p className="font-sans text-caption text-muted-foreground mt-0.5 leading-relaxed">
              Configure real-time alerts for release drops, social interactions,
              and community jams.
            </p>
          </div>

          <div className="space-y-3 ">
            {/* Toggle 1: Catalog Drops */}
            <div className="pt-3 first:pt-0 flex items-center justify-between gap-3 min-w-0">
              <div className="min-w-0 flex-1 pr-2">
                <div className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground font-medium">
                  Catalog Drops &amp; New Releases
                </div>
                <p className="font-sans text-eyebrow text-muted-foreground leading-snug">
                  Alerts when followed artists publish new albums, singles, or
                  EPs.
                </p>
              </div>
              <Switch
                checked={notifPrefs.emailReleases}
                onChange={(val) =>
                  setNotifPrefs((prev) => ({ ...prev, emailReleases: val }))
                }
                aria-label="Alerts for catalog drops and releases"
              />
            </div>

            {/* Toggle 2: Discussion Replies */}
            <div className="pt-3 flex items-center justify-between gap-3 min-w-0">
              <div className="min-w-0 flex-1 pr-2">
                <div className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground font-medium">
                  Discussion Replies &amp; Mentions
                </div>
                <p className="font-sans text-eyebrow text-muted-foreground leading-snug">
                  Alerts when curators reply to your comments on tracks and
                  public playlists.
                </p>
              </div>
              <Switch
                checked={notifPrefs.emailComments}
                onChange={(val) =>
                  setNotifPrefs((prev) => ({ ...prev, emailComments: val }))
                }
                aria-label="Alerts for discussion replies"
              />
            </div>

            {/* Toggle 3: Social Circles */}
            <div className="pt-3 flex items-center justify-between gap-3 min-w-0">
              <div className="min-w-0 flex-1 pr-2">
                <div className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground font-medium">
                  Social Circles &amp; Follow Requests
                </div>
                <p className="font-sans text-eyebrow text-muted-foreground leading-snug">
                  Alerts for incoming follow requests on private accounts and
                  newly joined followers.
                </p>
              </div>
              <Switch
                checked={notifPrefs.pushSocial}
                onChange={(val) =>
                  setNotifPrefs((prev) => ({ ...prev, pushSocial: val }))
                }
                aria-label="Alerts for social circles and requests"
              />
            </div>

            {/* Toggle 4: Jam Invites */}
            <div className="pt-3 flex items-center justify-between gap-3 min-w-0">
              <div className="min-w-0 flex-1 pr-2">
                <div className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground font-medium">
                  Live Jam Session Invites
                </div>
                <p className="font-sans text-eyebrow text-muted-foreground leading-snug">
                  Real-time pulses when friends invite you to synchronize
                  playback in a shared listening room.
                </p>
              </div>
              <Switch
                checked={notifPrefs.pushJams}
                onChange={(val) =>
                  setNotifPrefs((prev) => ({ ...prev, pushJams: val }))
                }
                aria-label="Alerts for live jam session invites"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
          {isDirty ? (
            <>
              <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-warning">
                Unsaved changes
              </span>
              <button
                type="button"
                onClick={onRevert}
                disabled={isSavingNotifPrefs}
                className="rounded-full border border-border px-5 py-2.5 font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                Revert
              </button>
            </>
          ) : null}
          <button
            type="submit"
            disabled={isSavingNotifPrefs || !isDirty}
            className="w-full sm:w-auto bg-foreground text-background font-eyebrow text-eyebrow uppercase tracking-wider font-semibold py-2.5 px-6 rounded-full hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer shadow-xs"
          >
            {isSavingNotifPrefs
              ? 'Saving Preferences...'
              : 'Save Notification Preferences'}
          </button>
        </div>
      </form>
    </div>
  )
}

function SubscriptionTab(
  entitlements: UserEntitlements | null,
  user: UserProfile,
  isLoadingEntitlements: boolean,
  handleOpenUpgradeModal: () => void,
  onRequestCancel: () => void,
): import('react').ReactNode {
  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Active Plan Card */}
      <div className="border border-border bg-card p-5 sm:p-4 rounded-2xl shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
          <div>
            <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-primary block mb-1">
              Active Subscription Tier
            </span>
            <div className="flex items-center gap-2.5">
              <h3 className="font-serif italic text-2xl sm:text-3xl text-foreground font-normal">
                {entitlements?.planName || user.plan?.name || 'Groovy Free'}
              </h3>
              <span
                className={`font-eyebrow text-eyebrow uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                  isLoadingEntitlements
                    ? 'border-border bg-background text-muted-foreground animate-pulse'
                    : entitlements?.status === 'active'
                      ? 'border-success/40 bg-success-soft text-success'
                      : entitlements?.cancelAtPeriodEnd
                        ? 'border-warning/40 bg-warning-soft text-warning'
                        : 'border-border bg-background text-muted-foreground'
                }`}
              >
                {isLoadingEntitlements
                  ? 'Verifying...'
                  : entitlements?.cancelAtPeriodEnd
                    ? 'Cancels at Period End'
                    : entitlements?.status?.toUpperCase() || 'ACTIVE'}
              </span>
            </div>
            {entitlements?.currentPeriodEnd && (
              <p className="font-mono text-eyebrow text-muted-foreground mt-1">
                Current billing period ends:{' '}
                {new Date(entitlements.currentPeriodEnd).toLocaleDateString()}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleOpenUpgradeModal}
              className="bg-foreground text-background font-eyebrow text-eyebrow uppercase tracking-wider py-2.5 px-4 rounded-full hover:opacity-90 transition-opacity cursor-pointer font-semibold shadow-xs"
            >
              ✦ Change Plan / Upgrade
            </button>
            {entitlements &&
              entitlements.planId !== 'free' &&
              !entitlements.cancelAtPeriodEnd && (
                <button
                  type="button"
                  onClick={onRequestCancel}
                  className="font-eyebrow text-eyebrow uppercase tracking-wider py-2.5 px-3.5 rounded-full border border-border text-muted-foreground hover:text-destructive hover:border-destructive bg-background transition-colors cursor-pointer"
                >
                  Cancel Plan
                </button>
              )}
          </div>
        </div>

        {/* Audio & Perks Checklist */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <div className="p-3 rounded-xl bg-background border border-border">
            <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block">
              Audio Quality
            </span>
            <span className="font-mono text-body font-bold text-foreground mt-0.5 block">
              {entitlements?.features?.max_bitrate_kbps ?? 128} kbps
            </span>
          </div>
          <div className="p-3 rounded-xl bg-background border border-border">
            <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block">
              Lossless FLAC
            </span>
            <span
              className={`font-mono text-body font-bold mt-0.5 block ${entitlements?.features?.lossless ? 'text-success' : 'text-muted-foreground'}`}
            >
              {entitlements?.features?.lossless ? 'Enabled ✓' : 'Standard'}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-background border border-border">
            <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block">
              Live Jam Rooms
            </span>
            <span
              className={`font-mono text-body font-bold mt-0.5 block ${entitlements?.features?.can_host_jam ? 'text-success' : 'text-muted-foreground'}`}
            >
              {entitlements?.features?.can_host_jam
                ? `Host (${entitlements.features.max_jam_participants ?? 3})`
                : 'Listener'}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-background border border-border">
            <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block">
              Ad-Free Audio
            </span>
            <span
              className={`font-mono text-body font-bold mt-0.5 block ${entitlements?.features?.ad_free ? 'text-success' : 'text-muted-foreground'}`}
            >
              {entitlements?.features?.ad_free ? 'Ad-Free ✓' : 'Sponsored'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function AccountIdentityTab(
  isArtist: boolean,
  artistProfile: ArtistProfile | null,
  handleUpdateProfile: (e: React.FormEvent) => Promise<void>,
  displayName: string,
  setDisplayName: Dispatch<SetStateAction<string>>,
  isUpdatingProfile: boolean,
  user: UserProfile,
  isLoadingArtistProfile: boolean,
  entitlements: UserEntitlements | null,
  isLoadingPreSaves: boolean,
  preSaves: PreSavedRelease[],
): import('react').ReactNode {
  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      {/* Musician or Recording Artist Card (Moved to Account View) */}
      <div className="p-2 sm:p-4 rounded-2xl shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="font-eyebrow text-eyebrow uppercase tracking-widest text-primary mb-1">
            Maison Artist Presence
          </div>
          <h3 className="font-sans font-bold text-title sm:text-lg text-foreground">
            {artistProfile
              ? 'Artist Studio Suite Active'
              : isArtist
                ? 'Artist Studio Setup Incomplete'
                : 'Musician or Recording Artist?'}
          </h3>
          <p className="font-sans text-caption text-muted-foreground mt-0.5 max-w-xl leading-relaxed">
            {artistProfile
              ? `Publishing as "${artistProfile.stageName}". Manage stage identity, discographies, verification badge, and listener telemetry.`
              : isArtist
                ? 'Your account has artist access but no artist profile yet. Create your stage identity to start releasing music.'
                : 'Upgrade to an Artist account to upload music, build your discography, and release albums to the world.'}
          </p>
          {isArtist && artistProfile?.slug && (
            <div className="mt-2.5">
              <Link
                to="/artists/$idOrSlug"
                params={{
                  idOrSlug: artistProfile.slug || artistProfile.id,
                }}
                className="font-mono text-eyebrow text-primary hover:underline inline-flex items-center gap-1.5"
              >
                <span>View Public Artist Page</span>
                <span className="text-caption">↗</span>
              </Link>
            </div>
          )}
        </div>

        <Link
          to="/studio"
          className="self-start sm:self-auto shrink-0 font-eyebrow text-eyebrow uppercase tracking-wider py-2.5 px-5 rounded-full bg-foreground text-background hover:opacity-90 transition-opacity font-semibold shadow-xs no-underline text-center"
        >
          {artistProfile
            ? 'Open Artist Studio →'
            : isArtist
              ? 'Finish Artist Setup →'
              : '✦ Become an Artist'}
        </Link>
      </div>

      {/* Edit Display Name */}
      <div className="p-2 sm:p-4 rounded-2xl shadow-xs">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-sans font-bold text-title sm:text-lg text-foreground">
            Curator Display Name
          </h3>
        </div>
        <p className="font-sans text-caption text-muted-foreground mb-5">
          This name will be displayed across your public playlists, comments,
          and community interactions.
        </p>
        <form
          onSubmit={handleUpdateProfile}
          className="flex w-full flex-col gap-3 sm:flex-row sm:items-end"
        >
          <div className="min-w-0 flex-1 space-y-1.5">
            <label
              htmlFor="edit-display-name"
              className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground block"
            >
              Name
            </label>
            <input
              id="edit-display-name"
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-4 py-2.5 sm:py-3 text-body text-foreground focus:outline-none focus:border-primary transition-colors placeholder:text-muted-foreground/50 font-sans"
              placeholder="Your curator name"
            />
          </div>

          <button
            type="submit"
            disabled={isUpdatingProfile}
            className="w-full sm:w-auto shrink-0 bg-foreground text-background font-eyebrow text-eyebrow uppercase tracking-wider font-semibold py-2.5 px-6 rounded-full hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer shadow-xs"
          >
            {isUpdatingProfile ? (
              <Loader2Icon className="w-5 h-5 animate-spin" />
            ) : (
              'Save Changes'
            )}
          </button>
        </form>
      </div>

      {/* Account Overview Card */}
      <div className=" p-2 sm:p-4 rounded-2xl shadow-xs space-y-4">
        <h3 className="font-sans font-bold text-title sm:text-lg text-foreground">
          Account Overview
        </h3>

        <div className="divide-y divide-border/60 font-sans text-caption">
          <div className="py-3 flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Email Address</span>
            <span className="text-foreground font-medium">{user.email}</span>
          </div>
          <div className="py-3 flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Email Verification</span>
            <span
              className={
                user.isEmailVerified
                  ? 'text-success font-semibold'
                  : 'text-warning font-semibold'
              }
            >
              {user.isEmailVerified ? 'Verified' : 'Unverified'}
            </span>
          </div>
          <div className="py-3 flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Role</span>
            <span className="font-eyebrow text-eyebrow uppercase text-foreground">
              {isArtist && user.role !== 'ADMIN' ? 'ARTIST' : user.role}
            </span>
          </div>
          {isArtist && (
            <div className="py-3 flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Artist Profile</span>
              <span className="font-mono text-eyebrow text-info font-semibold">
                {isLoadingArtistProfile
                  ? 'Verifying...'
                  : artistProfile
                    ? `${artistProfile.stageName}${artistProfile.verified ? ' ✓' : ''}`
                    : 'Not set up yet'}
              </span>
            </div>
          )}
          <div className="py-3 flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Active Plan</span>
            <span className="font-eyebrow text-eyebrow uppercase text-primary font-semibold">
              {entitlements?.planName || user.plan?.name || 'Groovy Free'}
            </span>
          </div>
          <div className="py-3 flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Pre-Saved Releases</span>
            <span className="font-mono text-eyebrow text-foreground font-medium">
              {isLoadingPreSaves
                ? 'Loading...'
                : `${preSaves.length} drops scheduled`}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
