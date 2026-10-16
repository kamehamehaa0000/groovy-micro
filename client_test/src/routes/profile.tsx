import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useState, useRef, useEffect } from 'react'
import { useAuthStore } from '../stores/auth.store'
import { useEntitlementsStore } from '../stores/entitlements.store'
import { api } from '../lib/api'
import { catalogApi } from '../lib/catalog.api'
import { subscriptionsApi } from '../lib/subscriptions.api'
import { socialApi } from '../lib/social.api'
import { artistsApi } from '../lib/artists.api'
import type { ArtistProfile } from '../types/artist'
import {
  notificationsApi,
  type NotificationPreferences,
} from '../lib/notifications.api'
import type { PreSavedRelease } from '../types/catalog'
import type {
  SubscriptionPlan,
  PlanFeatureDefinition,
} from '../types/subscriptions'

export const Route = createFileRoute('/profile')({
  component: ProfileComponent,
})

interface ToggleSwitchProps {
  id?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  'aria-label'?: string
}

function ToggleSwitch({
  id,
  checked,
  onChange,
  disabled = false,
  'aria-label': ariaLabel,
}: ToggleSwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-border transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
        checked ? 'bg-foreground' : 'bg-muted'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow-xs transition duration-200 ease-in-out border border-border/40 ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        } mt-0.2`}
      />
    </button>
  )
}

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
    | 'account'
    | 'subscription'
    | 'privacy'
    | 'notifications'
    | 'security'
  const [activeTab, setActiveTab] = useState<ProfileTab>('account')

  const [displayName, setDisplayName] = useState('')
  const [profileMsg, setProfileMsg] = useState<{
    text: string
    type: 'success' | 'error'
  } | null>(null)
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false)

  // Pre-Saved Releases State
  const [preSaves, setPreSaves] = useState<PreSavedRelease[]>([])
  const [isLoadingPreSaves, setIsLoadingPreSaves] = useState(false)

  // Subscriptions & Plans Selection Modal State
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false)
  const [availablePlans, setAvailablePlans] = useState<SubscriptionPlan[]>([])
  const [featureCatalog, setFeatureCatalog] = useState<PlanFeatureDefinition[]>(
    [],
  )
  const [isLoadingPlans, setIsLoadingPlans] = useState(false)
  const [isUpgradingPlan, setIsUpgradingPlan] = useState(false)
  const [subNotice, setSubNotice] = useState<{
    text: string
    type: 'success' | 'error'
  } | null>(null)

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
  const [privacyMsg, setPrivacyMsg] = useState<{
    text: string
    type: 'success' | 'error'
  } | null>(null)

  // Notification Delivery Preferences State
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>({
    emailReleases: true,
    emailComments: true,
    pushSocial: true,
    pushJams: true,
  })
  const [isSavingNotifPrefs, setIsSavingNotifPrefs] = useState(false)
  const [notifPrefsMsg, setNotifPrefsMsg] = useState<{
    text: string
    type: 'success' | 'error'
  } | null>(null)

  // Artist Profile State
  const [artistProfile, setArtistProfile] = useState<ArtistProfile | null>(
    (user as any)?.artistProfile || null,
  )
  const [isLoadingArtistProfile, setIsLoadingArtistProfile] = useState(false)

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

  useEffect(() => {
    if (isAuthenticated) {
      setIsLoadingPreSaves(true)
      catalogApi
        .getMyPreSaves()
        .then((res) => setPreSaves(res.presaves))
        .catch((err) => console.warn('Could not load pre-saves:', err))
        .finally(() => setIsLoadingPreSaves(false))

      notificationsApi
        .getPreferences()
        .then((res) => {
          if (res.preferences) setNotifPrefs(res.preferences)
        })
        .catch((err) =>
          console.warn('Could not load notification preferences:', err),
        )

      setIsLoadingArtistProfile(true)
      artistsApi
        .getMyProfile()
        .then((res) => setArtistProfile(res))
        .catch(() => setArtistProfile(null))
        .finally(() => setIsLoadingArtistProfile(false))

      useEntitlementsStore.getState().initializeEntitlements()
    }
  }, [isAuthenticated])

  if (isLoading || !user) {
    return (
      <div className="py-24 text-center font-eyebrow text-caption uppercase tracking-wider text-muted-foreground animate-pulse">
        Retrieving member records...
      </div>
    )
  }

  const isArtist =
    user.role === 'ARTIST' ||
    user.role === 'ADMIN' ||
    !!artistProfile ||
    !!(user as any)?.artistProfile

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

  // --- Privacy Settings Update ---
  const handleUpdatePrivacy = async (e: React.FormEvent) => {
    e.preventDefault()
    setPrivacyMsg(null)
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
      setPrivacyMsg({
        text: 'Privacy and social circle permissions updated successfully.',
        type: 'success',
      })
    } catch (err: any) {
      setPrivacyMsg({
        text: err.message || 'Failed to update privacy settings',
        type: 'error',
      })
    } finally {
      setIsSavingPrivacy(false)
    }
  }

  // --- Notification Preferences Update ---
  const handleUpdateNotifPrefs = async (e: React.FormEvent) => {
    e.preventDefault()
    setNotifPrefsMsg(null)
    setIsSavingNotifPrefs(true)

    try {
      const res = await notificationsApi.updatePreferences(notifPrefs)
      if (res.preferences) setNotifPrefs(res.preferences)
      setNotifPrefsMsg({
        text: 'Notification channels and delivery preferences updated successfully.',
        type: 'success',
      })
    } catch (err: any) {
      setNotifPrefsMsg({
        text: err.message || 'Failed to update notification preferences',
        type: 'error',
      })
    } finally {
      setIsSavingNotifPrefs(false)
    }
  }

  // --- Subscription Handlers ---
  const handleOpenUpgradeModal = async () => {
    setIsUpgradeModalOpen(true)
    setIsLoadingPlans(true)
    setSubNotice(null)
    try {
      const [plansRes, featRes] = await Promise.all([
        subscriptionsApi.getPlans(),
        subscriptionsApi.getFeatures(),
      ])
      setAvailablePlans(plansRes.plans)
      setFeatureCatalog(featRes.features)
    } catch (err: any) {
      setSubNotice({
        text: err.message || 'Failed to retrieve plans',
        type: 'error',
      })
    } finally {
      setIsLoadingPlans(false)
    }
  }

  const handleSwitchPlan = async (planId: string) => {
    setIsUpgradingPlan(true)
    setSubNotice(null)
    try {
      const res = await upgradePlanStore(planId)
      await refreshProfile()
      setSubNotice({
        text: `🎉 Switched plan to ${res.planName}!`,
        type: 'success',
      })
      setIsUpgradeModalOpen(false)
    } catch (err: any) {
      setSubNotice({
        text: err.message || 'Failed to switch plan',
        type: 'error',
      })
    } finally {
      setIsUpgradingPlan(false)
    }
  }

  const handleCancelSubscription = async () => {
    if (
      !confirm(
        'Are you sure you want to cancel your plan at the end of the current billing cycle?',
      )
    )
      return
    setSubNotice(null)
    try {
      await cancelSubscriptionStore()
      await refreshProfile()
      setSubNotice({
        text: 'Subscription scheduled for cancellation at the end of current period',
        type: 'success',
      })
    } catch (err: any) {
      setSubNotice({
        text: err.message || 'Failed to cancel subscription',
        type: 'error',
      })
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-2 pb-24 md:pb-16 select-none space-y-6">
      {/* ===================== HERO PROFILE BANNER ===================== */}
      <div className="bg-card border border-border rounded-2xl p-5 sm:p-7 shadow-xs">
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
                Role: <strong className="text-foreground">{isArtist && user.role !== 'ADMIN' ? 'ARTIST' : user.role}</strong>
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

      {/* ===================== STICKY TAB NAVIGATION ===================== */}
      <div className="sticky top-14 z-30 bg-background/95 backdrop-blur-md pt-2 pb-2.5 transition-colors border-b border-border/40">
        <nav className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scrollbar-none py-0.5 select-none -mx-1">
          {[
            { id: 'account' as const, label: 'Account' },
            { id: 'subscription' as const, label: 'Subscription' },
            { id: 'privacy' as const, label: 'Privacy' },
            { id: 'notifications' as const, label: 'Notifications' },
            { id: 'security' as const, label: 'Security' },
          ].map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`shrink-0 font-eyebrow text-eyebrow rounded-md uppercase tracking-wider px-3.5 py-1.5 transition-all cursor-pointer font-medium whitespace-nowrap ${
                  isActive
                    ? 'bg-foreground text-background font-semibold shadow-xs'
                    : 'bg-card text-muted-foreground hover:text-foreground border border-border'
                }`}
              >
                {tab.label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* ===================== TAB PANELS ===================== */}

      {/* 1. ACCOUNT & IDENTITY */}
      {activeTab === 'account' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {profileMsg && (
            <div
              className={`p-3.5 rounded-xl border font-mono text-caption ${
                profileMsg.type === 'success'
                  ? 'border-success/40 bg-success-soft text-success'
                  : 'border-destructive/40 bg-destructive-soft text-destructive'
              }`}
            >
              {profileMsg.text}
            </div>
          )}

          {/* Edit Display Name */}
          <div className="border border-border bg-card p-5 sm:p-7 rounded-2xl shadow-xs">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-sans font-bold text-title sm:text-lg text-foreground">
                Curator Display Name
              </h3>
              <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground">
                Public Identity
              </span>
            </div>
            <p className="font-sans text-caption text-muted-foreground mb-5">
              This name will be displayed across your public playlists, comments, and community interactions.
            </p>

            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div className="space-y-1.5">
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

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={isUpdatingProfile}
                  className="w-full sm:w-auto bg-foreground text-background font-eyebrow text-eyebrow uppercase tracking-wider font-semibold py-2.5 px-6 rounded-full hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer shadow-xs"
                >
                  {isUpdatingProfile ? 'Saving...' : 'Save Identity'}
                </button>
              </div>
            </form>
          </div>

          {/* Musician or Recording Artist Card (Moved to Account View) */}
          <div className="border border-border bg-card p-5 sm:p-7 rounded-2xl shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="font-eyebrow text-eyebrow uppercase tracking-widest text-primary mb-1">
                Maison Artist Presence
              </div>
              <h3 className="font-sans font-bold text-title sm:text-lg text-foreground">
                {isArtist
                  ? 'Artist Studio Suite Active'
                  : 'Musician or Recording Artist?'}
              </h3>
              <p className="font-sans text-caption text-muted-foreground mt-0.5 max-w-xl leading-relaxed">
                {isArtist
                  ? artistProfile
                    ? `Publishing as "${artistProfile.stageName}". Manage stage identity, discographies, verification badge, and listener telemetry.`
                    : 'Manage stage identity, discographies, verification badge, and listener telemetry.'
                  : 'Upgrade to an Artist account to upload music, build your discography, and release albums to the world.'}
              </p>
              {isArtist && artistProfile?.slug && (
                <div className="mt-2.5">
                  <Link
                    to="/artists/$idOrSlug"
                    params={{ idOrSlug: artistProfile.slug || artistProfile.id }}
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
              {isArtist ? 'Open Artist Studio →' : '✦ Become an Artist'}
            </Link>
          </div>

          {/* Account Overview Card */}
          <div className="border border-border bg-card p-5 sm:p-7 rounded-2xl shadow-xs space-y-4">
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
                <span className={user.isEmailVerified ? "text-success font-semibold" : "text-warning font-semibold"}>
                  {user.isEmailVerified ? "Verified" : "Unverified"}
                </span>
              </div>
              <div className="py-3 flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Role</span>
                <span className="font-eyebrow text-eyebrow uppercase text-foreground">{isArtist && user.role !== 'ADMIN' ? 'ARTIST' : user.role}</span>
              </div>
              {isArtist && (
                <div className="py-3 flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Artist Profile</span>
                  <span className="font-mono text-eyebrow text-info font-semibold">
                    {isLoadingArtistProfile
                      ? 'Verifying...'
                      : artistProfile
                        ? `${artistProfile.stageName}${artistProfile.verified ? ' ✓' : ''}`
                        : 'Studio Active'}
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
                  {isLoadingPreSaves ? 'Loading...' : `${preSaves.length} drops scheduled`}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. SUBSCRIPTION & MEMBERSHIP */}
      {activeTab === 'subscription' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {subNotice && (
            <div
              className={`p-3.5 rounded-xl border font-mono text-caption ${
                subNotice.type === 'success'
                  ? 'border-success/40 bg-success-soft text-success'
                  : 'border-destructive/40 bg-destructive-soft text-destructive'
              }`}
            >
              {subNotice.text}
            </div>
          )}

          {/* Active Plan Card */}
          <div className="border border-border bg-card p-5 sm:p-7 rounded-2xl shadow-xs space-y-5">
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
                      onClick={handleCancelSubscription}
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
                <span className={`font-mono text-body font-bold mt-0.5 block ${entitlements?.features?.lossless ? 'text-success' : 'text-muted-foreground'}`}>
                  {entitlements?.features?.lossless ? 'Enabled ✓' : 'Standard'}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-background border border-border">
                <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block">
                  Live Jam Rooms
                </span>
                <span className={`font-mono text-body font-bold mt-0.5 block ${entitlements?.features?.can_host_jam ? 'text-success' : 'text-muted-foreground'}`}>
                  {entitlements?.features?.can_host_jam ? `Host (${entitlements.features.max_jam_participants ?? 3})` : 'Listener'}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-background border border-border">
                <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block">
                  Ad-Free Audio
                </span>
                <span className={`font-mono text-body font-bold mt-0.5 block ${entitlements?.features?.ad_free ? 'text-success' : 'text-muted-foreground'}`}>
                  {entitlements?.features?.ad_free ? 'Ad-Free ✓' : 'Sponsored'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. PRIVACY & SOCIAL CIRCLES */}
      {activeTab === 'privacy' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {privacyMsg && (
            <div
              className={`p-3.5 rounded-xl border font-mono text-caption ${
                privacyMsg.type === 'success'
                  ? 'border-success/40 bg-success-soft text-success'
                  : 'border-destructive/40 bg-destructive-soft text-destructive'
              }`}
            >
              {privacyMsg.text}
            </div>
          )}

          <form onSubmit={handleUpdatePrivacy} className="space-y-6">
            {/* Account Privacy Toggle */}
            <div className="border border-border bg-card p-5 sm:p-6 rounded-2xl shadow-xs flex items-center justify-between gap-3 min-w-0">
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
                  When your account is private, other curators must request to follow you. You review each follow request in your Activity desk before they gain access to your follower-only library.
                </p>
              </div>

              <ToggleSwitch
                id="private-account-toggle"
                checked={isPrivateAccount}
                onChange={setIsPrivateAccount}
                aria-label="Toggle private account"
              />
            </div>

            {/* Live Listening Presence Tier */}
            <div className="border border-border bg-card p-5 sm:p-6 rounded-2xl shadow-xs space-y-3">
              <div>
                <span className="font-sans text-body sm:text-title font-bold text-foreground block">
                  Live Turntable &bull; Listening Activity
                </span>
                <p className="font-sans text-caption text-muted-foreground mt-0.5 leading-relaxed">
                  Choose who can see your real-time playback in the &quot;What Friends Are Listening To&quot; live deck.
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
                        {isSelected && <span className="text-success font-bold">✓</span>}
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
            <div className="border border-border bg-card p-5 sm:p-6 rounded-2xl shadow-xs space-y-3">
              <div>
                <span className="font-sans text-body sm:text-title font-bold text-foreground block">
                  Library &amp; Presaves Visibility
                </span>
                <p className="font-sans text-caption text-muted-foreground mt-0.5 leading-relaxed">
                  Choose who can browse your public playlists, liked songs, and pre-saved releases.
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
                        {isSelected && <span className="text-success font-bold">✓</span>}
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
            <div className="border border-border bg-card p-5 sm:p-6 rounded-2xl shadow-xs space-y-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-sans text-body sm:text-title font-bold text-foreground">
                    Personal Collection &amp; Audio Vault
                  </span>
                  <span className="font-eyebrow text-eyebrow uppercase tracking-wider px-2 py-0.5 rounded-full border border-primary/40 bg-primary/10 text-primary font-semibold">
                    Sandboxed Storage
                  </span>
                </div>
                <p className="font-sans text-caption text-muted-foreground mt-0.5 leading-relaxed">
                  Granularly control where your privately uploaded audio collection surfaces throughout Groovy.
                </p>
              </div>

              <div className="space-y-3 divide-y divide-border/60">
                {/* Toggle 1: Search */}
                <div className="pt-3 first:pt-0 flex items-center justify-between gap-3 min-w-0">
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground font-medium">
                      Include in Global Search
                    </div>
                    <p className="font-sans text-eyebrow text-muted-foreground leading-snug">
                      Surface personal collection tracks in your own search bar (never visible to other curators).
                    </p>
                  </div>
                  <ToggleSwitch
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
                      Record personal collection playback on your Recent shelf and listening history.
                    </p>
                  </div>
                  <ToggleSwitch
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
                      Blend your personal collection uploads into home discovery shelves and mixes.
                    </p>
                  </div>
                  <ToggleSwitch
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
                      Show an &quot;In Your Collection&quot; shelf on verified artist pages when you have personal tracks matching that artist.
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={lockerLinkToGlobalArtists}
                    onChange={setLockerLinkToGlobalArtists}
                    aria-label="Link to verified global artists"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={isSavingPrivacy}
                className="w-full sm:w-auto bg-foreground text-background font-eyebrow text-eyebrow uppercase tracking-wider font-semibold py-2.5 px-6 rounded-full hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer shadow-xs"
              >
                {isSavingPrivacy ? 'Saving Privacy...' : 'Save Privacy Preferences'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 4. NOTIFICATION DELIVERY */}
      {activeTab === 'notifications' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {notifPrefsMsg && (
            <div
              className={`p-3.5 rounded-xl border font-mono text-caption ${
                notifPrefsMsg.type === 'success'
                  ? 'border-success/40 bg-success-soft text-success'
                  : 'border-destructive/40 bg-destructive-soft text-destructive'
              }`}
            >
              {notifPrefsMsg.text}
            </div>
          )}

          <form onSubmit={handleUpdateNotifPrefs} className="space-y-6">
            <div className="border border-border bg-card p-5 sm:p-6 rounded-2xl shadow-xs space-y-4">
              <div>
                <span className="font-sans text-body sm:text-title font-bold text-foreground block">
                  Notification Channels &amp; Delivery
                </span>
                <p className="font-sans text-caption text-muted-foreground mt-0.5 leading-relaxed">
                  Configure real-time alerts for release drops, social interactions, and community jams.
                </p>
              </div>

              <div className="space-y-3 divide-y divide-border/60">
                {/* Toggle 1: Catalog Drops */}
                <div className="pt-3 first:pt-0 flex items-center justify-between gap-3 min-w-0">
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground font-medium">
                      Catalog Drops &amp; New Releases
                    </div>
                    <p className="font-sans text-eyebrow text-muted-foreground leading-snug">
                      Alerts when followed artists publish new albums, singles, or EPs.
                    </p>
                  </div>
                  <ToggleSwitch
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
                      Alerts when curators reply to your comments on tracks and public playlists.
                    </p>
                  </div>
                  <ToggleSwitch
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
                      Alerts for incoming follow requests on private accounts and newly joined followers.
                    </p>
                  </div>
                  <ToggleSwitch
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
                      Real-time pulses when friends invite you to synchronize playback in a shared listening room.
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={notifPrefs.pushJams}
                    onChange={(val) =>
                      setNotifPrefs((prev) => ({ ...prev, pushJams: val }))
                    }
                    aria-label="Alerts for live jam session invites"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={isSavingNotifPrefs}
                className="w-full sm:w-auto bg-foreground text-background font-eyebrow text-eyebrow uppercase tracking-wider font-semibold py-2.5 px-6 rounded-full hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer shadow-xs"
              >
                {isSavingNotifPrefs
                  ? 'Saving Preferences...'
                  : 'Save Notification Preferences'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 5. SECURITY & SESSIONS */}
      {activeTab === 'security' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {passwordMsg && (
            <div
              className={`p-3.5 rounded-xl border font-mono text-caption ${
                passwordMsg.type === 'success'
                  ? 'border-success/40 bg-success-soft text-success'
                  : 'border-destructive/40 bg-destructive-soft text-destructive'
              }`}
            >
              {passwordMsg.text}
            </div>
          )}

          {/* Change Password */}
          <div className="border border-border bg-card p-5 sm:p-7 rounded-2xl shadow-xs">
            <h3 className="font-sans font-bold text-title sm:text-lg text-foreground mb-1">
              Change Password
            </h3>
            <p className="font-sans text-caption text-muted-foreground mb-5">
              Update your account credentials to keep your session and collection safe.
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
          <div className="border border-border bg-card p-5 sm:p-7 rounded-2xl shadow-xs space-y-4">
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
      )}

      {/* ===================== UPGRADE / CHANGE PLAN MODAL ===================== */}
      {isUpgradeModalOpen && (
        <div className="fixed inset-0 bg-foreground/50 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="max-w-4xl w-full bg-card border border-border rounded-2xl shadow-2xl p-5 sm:p-8 space-y-6 my-auto max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-primary block mb-1">
                  Maison Sound Tiers &bull; Dev Mock Checkout
                </span>
                <h3 className="font-serif italic text-2xl sm:text-3xl text-foreground">
                  Select Your Audio Experience
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsUpgradeModalOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-body font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {isLoadingPlans ? (
              <div className="py-20 text-center font-mono text-caption text-muted-foreground animate-pulse">
                Querying active subscription tiers and feature catalog...
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
                {availablePlans.map((plan) => {
                  const isCurrent = entitlements?.planId === plan.id
                  return (
                    <div
                      key={plan.id}
                      className={`p-5 rounded-2xl border flex flex-col justify-between space-y-5 transition-all ${
                        isCurrent
                          ? 'border-foreground bg-background shadow-xs'
                          : 'border-border bg-card hover:border-foreground/50'
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-eyebrow text-eyebrow uppercase tracking-wider px-2 py-0.5 rounded-full border border-border bg-card font-semibold text-primary">
                            {plan.id}
                          </span>
                          {isCurrent && (
                            <span className="font-eyebrow text-eyebrow uppercase tracking-wider px-2 py-0.5 rounded-full border border-success/40 bg-success-soft text-success font-semibold">
                              Current Plan
                            </span>
                          )}
                        </div>

                        <div>
                          <h4 className="font-serif italic text-2xl text-foreground font-medium">
                            {plan.name}
                          </h4>
                          <div className="font-mono text-caption text-muted-foreground mt-1">
                            <span className="text-heading font-bold text-foreground">
                              {(plan.priceCents / 100).toLocaleString(
                                undefined,
                                {
                                  style: 'currency',
                                  currency: plan.currency || 'USD',
                                },
                              )}
                            </span>
                            <span> / {plan.interval}</span>
                          </div>
                        </div>

                        {/* Feature comparison checklist */}
                        <div className="pt-3 border-t border-border-soft space-y-2 font-sans text-caption">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-success font-bold">
                              ✓
                            </span>
                            <span>
                              Audio:{' '}
                              <strong className="font-mono text-caption">
                                {plan.features.max_bitrate_kbps ?? 128} kbps
                              </strong>
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-mono font-bold ${
                                plan.features.lossless
                                  ? 'text-success'
                                  : 'text-muted-foreground/40'
                              }`}
                            >
                              {plan.features.lossless ? '✓' : '✕'}
                            </span>
                            <span
                              className={
                                plan.features.lossless
                                  ? 'text-foreground'
                                  : 'text-muted-foreground line-through'
                              }
                            >
                              FLAC Lossless Audio
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-mono font-bold ${
                                plan.features.can_host_jam
                                  ? 'text-success'
                                  : 'text-muted-foreground/40'
                              }`}
                            >
                              {plan.features.can_host_jam ? '✓' : '✕'}
                            </span>
                            <span
                              className={
                                plan.features.can_host_jam
                                  ? 'text-foreground'
                                  : 'text-muted-foreground line-through'
                              }
                            >
                              Host Live Jams ({plan.features.max_jam_participants ?? 3} listeners)
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-mono font-bold ${
                                plan.features.ad_free
                                  ? 'text-success'
                                  : 'text-muted-foreground/40'
                              }`}
                            >
                              {plan.features.ad_free ? '✓' : '✕'}
                            </span>
                            <span
                              className={
                                plan.features.ad_free
                                  ? 'text-foreground'
                                  : 'text-muted-foreground'
                              }
                            >
                              {plan.features.ad_free
                                ? 'Ad-Free Playback'
                                : 'Sponsored Audio'}
                            </span>
                          </div>

                          {/* Dynamic Extra Perks */}
                          {Object.entries(plan.features)
                            .filter(
                              ([k]) =>
                                ![
                                  'max_bitrate_kbps',
                                  'lossless',
                                  'can_host_jam',
                                  'max_jam_participants',
                                  'ad_free',
                                ].includes(k),
                            )
                            .map(([k, v]) => {
                              const featDef = featureCatalog.find(
                                (f) => f.key === k,
                              )
                              return (
                                <div
                                  key={k}
                                  className="flex items-center gap-2"
                                >
                                  <span className="font-mono text-success font-bold">
                                    ✓
                                  </span>
                                  <span className="font-mono text-eyebrow text-foreground">
                                    {featDef?.name || k}:{' '}
                                    {typeof v === 'boolean'
                                      ? v
                                        ? 'Enabled'
                                        : 'Disabled'
                                      : String(v)}
                                  </span>
                                </div>
                              )
                            })}
                        </div>
                      </div>

                      <div className="pt-3 border-t border-border">
                        <button
                          type="button"
                          disabled={isCurrent || isUpgradingPlan}
                          onClick={() => handleSwitchPlan(plan.id)}
                          className={`w-full font-eyebrow text-eyebrow uppercase tracking-wider py-2.5 px-4 rounded-full transition-all cursor-pointer font-semibold ${
                            isCurrent
                              ? 'bg-border/40 text-muted-foreground cursor-not-allowed border border-border'
                              : 'bg-foreground text-background hover:opacity-90'
                          }`}
                        >
                          {isCurrent
                            ? 'Active Tier'
                            : isUpgradingPlan
                              ? 'Switching...'
                              : plan.priceCents === 0
                                ? 'Switch to Free Tier'
                                : `Upgrade to ${plan.name}`}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
