import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useState, useRef, useEffect } from 'react'
import { useAuthStore } from '../stores/auth.store'
import { useEntitlementsStore } from '../stores/entitlements.store'
import { api } from '../lib/api'
import { catalogApi } from '../lib/catalog.api'
import { subscriptionsApi } from '../lib/subscriptions.api'
import { socialApi } from '../lib/social.api'
import type { PreSavedRelease } from '../types/catalog'
import type {
  SubscriptionPlan,
  PlanFeatureDefinition,
} from '../types/subscriptions'
import { DiscIconSVG, CalendarIconSVG, UploadCloudSVG, PlayIconSVG, PauseIconSVG, TrashIconSVG } from '../components/icons'
import { RecentlyPlayedShelf } from '../components/player/RecentlyPlayedShelf'
import { ProceduralCover } from '../components/common/ProceduralCover'
import { storageApi, type LockerQuota } from '../lib/storage.api'
import { useLockerStore } from '../stores/locker.store'
import { usePlayerStore } from '../stores/player.store'

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
  const cancelSubscriptionStore = useEntitlementsStore((s) => s.cancelSubscription)
  const isLoadingEntitlements = useEntitlementsStore((s) => s.isLoading)

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
  const [featureCatalog, setFeatureCatalog] = useState<PlanFeatureDefinition[]>([])
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
  const [lockerIncludeInRecentlyPlayed, setLockerIncludeInRecentlyPlayed] = useState(true)
  const [lockerLinkToGlobalArtists, setLockerLinkToGlobalArtists] = useState(false)
  const [isSavingPrivacy, setIsSavingPrivacy] = useState(false)
  const [privacyMsg, setPrivacyMsg] = useState<{
    text: string
    type: 'success' | 'error'
  } | null>(null)

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate({ to: '/login' })
    }
  }, [isLoading, isAuthenticated, navigate])

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName)
      setIsPrivateAccount(!!user.isPrivateAccount)
      setListeningActivityPrivacy(user.listeningActivityPrivacy || 'FRIENDS_ONLY')
      setLibraryPrivacy(user.libraryPrivacy || 'PUBLIC')
      setLockerIncludeInSearch(user.lockerIncludeInSearch ?? true)
      setLockerIncludeInHome(user.lockerIncludeInHome ?? false)
      setLockerIncludeInRecentlyPlayed(user.lockerIncludeInRecentlyPlayed ?? true)
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

      useEntitlementsStore.getState().initializeEntitlements()
    }
  }, [isAuthenticated])

  // Cloud Locker State & Controls
  const [lockerQuota, setLockerQuota] = useState<LockerQuota | null>(null)
  const [lockerReleases, setLockerReleases] = useState<any[]>([])
  const [isLoadingLocker, setIsLoadingLocker] = useState(false)
  const [expandedReleaseId, setExpandedReleaseId] = useState<string | null>(null)
  const lockerRefreshTrigger = useLockerStore((s) => s.refreshTrigger)
  const openLockerModal = useLockerStore((s) => s.openLockerModal)
  const triggerRefresh = useLockerStore((s) => s.triggerRefresh)
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null)

  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const playbackStatus = usePlayerStore((s) => s.playbackStatus)
  const playTrack = usePlayerStore((s) => s.playTrack)
  const togglePlay = usePlayerStore((s) => s.togglePlay)

  useEffect(() => {
    if (isAuthenticated) {
      setIsLoadingLocker(true)
      Promise.all([
        storageApi.getQuota().catch(() => null),
        storageApi.getLockerReleases().catch(() => null),
      ])
        .then(([quotaRes, releasesRes]) => {
          if (quotaRes?.quota) setLockerQuota(quotaRes.quota)
          if (releasesRes?.releases) setLockerReleases(releasesRes.releases)
        })
        .finally(() => setIsLoadingLocker(false))
    }
  }, [isAuthenticated, lockerRefreshTrigger])

  const handlePlayLockerTrack = (release: any, track: any, trackIdx: number) => {
    if (currentTrack?.id === track.id) {
      togglePlay()
      return
    }
    const contextTracks = release.tracks.map((t: any) => ({
      id: t.id,
      title: t.title,
      artistId: release.artistId || '',
      artistName: release.artistName || 'Unknown Artist',
      artistSlug: release.artistSlug,
      albumTitle: release.title,
      coverImageUrl: release.coverImageUrl || undefined,
      durationSeconds: t.durationSeconds,
      audioUrl: t.audioUrl,
      hlsManifestUrl: t.hlsManifestUrl,
      rawAudioKey: t.rawAudioKey,
      isExplicit: t.isExplicit ?? false,
    }))

    playTrack(
      contextTracks[trackIdx],
      contextTracks,
      trackIdx,
      `personal:release:${release.id}`,
      `Personal Collection: ${release.title}`
    )
  }

  const handleDeleteLockerSong = async (songId: string, releaseId: string) => {
    if (!window.confirm('Remove this track from your Personal Collection? This will immediately free 1 quota slot.')) {
      return
    }
    try {
      setDeletingItemId(songId)
      await storageApi.deletePersonalSong(songId)
      setLockerReleases((prev) =>
        prev
          .map((r) => {
            if (r.id !== releaseId) return r
            const updated = r.tracks.filter((t: any) => t.id !== songId)
            return {
              ...r,
              tracks: updated,
              totalTracks: updated.length,
              totalDurationSeconds: updated.reduce(
                (acc: number, t: any) => acc + (t.durationSeconds || 0),
                0
              ),
            }
          })
          .filter((r) => r.tracks.length > 0)
      )
      setLockerQuota((prev) =>
        prev
          ? {
              ...prev,
              usedSongs: Math.max(0, prev.usedSongs - 1),
              remainingSongs: Math.min(prev.maxSongs, prev.remainingSongs + 1),
            }
          : null
      )
      triggerRefresh()
    } catch (err: any) {
      alert(err.message || 'Failed to delete track')
    } finally {
      setDeletingItemId(null)
    }
  }

  const handleDeleteLockerRelease = async (
    releaseId: string,
    releaseTitle: string,
    trackCount: number
  ) => {
    if (
      !window.confirm(
        `Delete "${releaseTitle}" and all ${trackCount} track(s) from your Personal Collection? This will immediately free ${trackCount} quota slot(s).`
      )
    ) {
      return
    }
    try {
      setDeletingItemId(releaseId)
      const res = await storageApi.deletePersonalRelease(releaseId)
      const deletedCount = res.deletedTracks ?? trackCount
      setLockerReleases((prev) => prev.filter((r) => r.id !== releaseId))
      setLockerQuota((prev) =>
        prev
          ? {
              ...prev,
              usedSongs: Math.max(0, prev.usedSongs - deletedCount),
              remainingSongs: Math.min(prev.maxSongs, prev.remainingSongs + deletedCount),
            }
          : null
      )
      triggerRefresh()
    } catch (err: any) {
      alert(err.message || 'Failed to delete release')
    } finally {
      setDeletingItemId(null)
    }
  }

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
      setSubNotice({ text: 'Subscription scheduled for cancellation at the end of current period', type: 'success' })
    } catch (err: any) {
      setSubNotice({
        text: err.message || 'Failed to cancel subscription',
        type: 'error',
      })
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <div className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-blue-deep mb-2">
          Curator Identity &amp; Account
        </div>
        <h1 className="font-serif italic text-3xl sm:text-4xl text-ink leading-tight font-normal">
          User Profile &amp; Account
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
            Active Tier:{' '}
            <span className="text-blue font-medium">
              {entitlements?.planName || user.plan?.name || 'Groovy Free'}
            </span>
          </div>
        </div>
      </div>

      {/* Membership & Subscription Tier Card */}
      <div className="border border-line bg-panel p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
          <div>
            <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-blue mb-1">
              Membership &bull; Entitlements Engine
            </div>
            <div className="flex items-center gap-3">
              <h3 className="font-serif italic text-2xl text-ink font-normal">
                {entitlements?.planName || user.plan?.name || 'Groovy Free'}
              </h3>
              <span
                className={`font-mono text-[8.5px] uppercase tracking-wider px-2 py-0.5 border ${
                  isLoadingEntitlements
                    ? 'border-line bg-canvas text-ink-soft animate-pulse'
                    : entitlements?.status === 'active'
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      : entitlements?.cancelAtPeriodEnd
                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                        : 'border-line bg-canvas text-ink-soft'
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
              <p className="font-mono text-[10px] text-ink-soft mt-1">
                Current billing period ends:{' '}
                {new Date(entitlements.currentPeriodEnd).toLocaleDateString()}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleOpenUpgradeModal}
              className="font-mono text-[10.5px] uppercase tracking-[0.14em] py-2 px-4 bg-ink text-canvas hover:opacity-90 transition-opacity cursor-pointer font-semibold"
            >
              ✦ Change Plan / Upgrade
            </button>
            {entitlements &&
              entitlements.planId !== 'free' &&
              !entitlements.cancelAtPeriodEnd && (
                <button
                  type="button"
                  onClick={handleCancelSubscription}
                  className="font-mono text-[10px] uppercase tracking-[0.12em] py-2 px-3 border border-line text-ink-soft hover:text-red-500 hover:border-red-400 bg-canvas transition-colors cursor-pointer"
                >
                  Cancel Plan
                </button>
              )}
          </div>
        </div>

        {subNotice && (
          <div
            className={`p-3 border font-mono text-xs ${
              subNotice.type === 'success'
                ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-200'
                : 'border-red-300 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300'
            }`}
          >
            {subNotice.text}
          </div>
        )}

        {/* Resolved Capabilities Matrix */}
        <div className="space-y-3">
          <div className="font-mono text-[9.5px] uppercase tracking-wider text-ink-soft">
            Active Capability Matrix (Enforced by Entitlement Guard)
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Audio Bitrate */}
            <div className="border border-line bg-canvas p-3.5 space-y-1">
              <span className="font-mono text-[8.5px] uppercase tracking-wider text-ink-soft block">
                Audio Bitrate
              </span>
              <div className="font-mono text-base font-semibold text-ink">
                {entitlements?.features.max_bitrate_kbps ?? 128} kbps
              </div>
              <p className="font-sans text-[11px] text-ink-soft">
                {Number(entitlements?.features.max_bitrate_kbps ?? 128) >= 320
                  ? 'High-Fidelity 320kbps MP3/AAC stream'
                  : 'Standard 128kbps AAC stream'}
              </p>
            </div>

            {/* Lossless Audio */}
            <div className="border border-line bg-canvas p-3.5 space-y-1">
              <span className="font-mono text-[8.5px] uppercase tracking-wider text-ink-soft block">
                Lossless Audio
              </span>
              <div
                className={`font-mono text-base font-semibold ${
                  entitlements?.features.lossless
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-ink-soft'
                }`}
              >
                {entitlements?.features.lossless ? '✓ FLAC Unlocked' : '✕ Standard Only'}
              </div>
              <p className="font-sans text-[11px] text-ink-soft">
                {entitlements?.features.lossless
                  ? 'Studio Master 1411kbps uncompressed'
                  : 'Upgrade to stream lossless FLAC'}
              </p>
            </div>

            {/* Live Jam Hosting */}
            <div className="border border-line bg-canvas p-3.5 space-y-1">
              <span className="font-mono text-[8.5px] uppercase tracking-wider text-ink-soft block">
                Live Jam Hosting
              </span>
              <div
                className={`font-mono text-base font-semibold ${
                  entitlements?.features.can_host_jam
                    ? 'text-blue'
                    : 'text-ink-soft'
                }`}
              >
                {entitlements?.features.can_host_jam ? '✓ Jam Host' : '✕ Listener Only'}
              </div>
              <p className="font-sans text-[11px] text-ink-soft">
                {entitlements?.features.can_host_jam
                  ? `Host rooms up to ${entitlements.features.max_jam_participants} listeners`
                  : `Can join jams up to ${entitlements?.features.max_jam_participants ?? 3} listeners`}
              </p>
            </div>

            {/* Ad Experience */}
            <div className="border border-line bg-canvas p-3.5 space-y-1">
              <span className="font-mono text-[8.5px] uppercase tracking-wider text-ink-soft block">
                Ad Experience
              </span>
              <div
                className={`font-mono text-base font-semibold ${
                  entitlements?.features.ad_free
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-ink-soft'
                }`}
              >
                {entitlements?.features.ad_free ? '✓ Ad-Free' : 'Sponsored Audio'}
              </div>
              <p className="font-sans text-[11px] text-ink-soft">
                {entitlements?.features.ad_free
                  ? 'Zero interruptions or audio spots'
                  : 'Occasional promotional inserts'}
              </p>
            </div>
          </div>

          {/* Dynamic Extra Features from Catalog */}
          {entitlements &&
            Object.keys(entitlements.features).some(
              (k) =>
                ![
                  'max_bitrate_kbps',
                  'lossless',
                  'can_host_jam',
                  'max_jam_participants',
                  'ad_free',
                ].includes(k),
            ) && (
              <div className="pt-2 border-t border-line-soft">
                <span className="font-mono text-[9px] uppercase tracking-wider text-ink-soft block mb-2">
                  Additional Entitled Perks
                </span>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(entitlements.features)
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
                    .map(([k, v]) => (
                      <span
                        key={k}
                        className="font-mono text-[9.5px] px-2.5 py-1 border border-line bg-canvas flex items-center gap-1.5"
                      >
                        <span className="text-ink-soft">{k}:</span>
                        <span className="font-semibold text-ink">
                          {typeof v === 'boolean'
                            ? v
                              ? '✓ Enabled'
                              : '✕ Disabled'
                            : String(v)}
                        </span>
                      </span>
                    ))}
                </div>
              </div>
            )}
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

      {/* Pre-Saved Releases Card */}
      <div className="border border-line bg-panel p-6 sm:p-8 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div>
            <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-blue mb-1">
              Library · Upcoming Vault
            </div>
            <h3 className="font-serif italic text-xl text-ink font-normal">
              Pre-Saved Releases ({preSaves.length})
            </h3>
          </div>
          <span className="font-mono text-[10px] text-ink-soft uppercase tracking-wider">
            Auto-Library Add On Drop
          </span>
        </div>

        {isLoadingPreSaves ? (
          <div className="font-mono text-xs text-ink-soft animate-pulse py-4 text-center">
            Checking upcoming releases...
          </div>
        ) : preSaves.length === 0 ? (
          <div className="p-8 border border-dashed border-line bg-canvas text-center space-y-2">
            <DiscIconSVG className="w-8 h-8 text-ink-soft/40 mx-auto" />
            <p className="font-serif italic text-sm text-ink">
              No pre-saved releases yet
            </p>
            <p className="font-sans text-xs text-ink-soft">
              When artists schedule upcoming drops, click "Pre-Save" on their release page to have them appear here and unlock automatically in your library.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {preSaves.map((item) => (
              <div
                key={item.albumId}
                className="border border-line bg-canvas p-4 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-14 h-14 bg-canvas-deep border border-line shrink-0 overflow-hidden">
                    {item.coverImageUrl ? (
                      <img
                        src={item.coverImageUrl}
                        alt={item.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <DiscIconSVG className="w-6 h-6 text-ink-soft/40" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[8px] uppercase tracking-wider px-1.5 py-0.5 border border-line bg-panel text-blue font-semibold">
                        {item.albumType}
                      </span>
                      {item.scheduledReleaseAt && (
                        <span className="font-mono text-[9px] text-ink-soft flex items-center gap-1">
                          <CalendarIconSVG className="w-2.5 h-2.5" />
                          <span>
                            {new Date(item.scheduledReleaseAt).toLocaleDateString()}
                          </span>
                        </span>
                      )}
                    </div>
                    <h4 className="font-serif italic text-base text-ink truncate mt-0.5">
                      {item.title}
                    </h4>
                    <p className="font-sans text-xs text-ink-soft truncate">
                      {item.artistStageName}
                    </p>
                  </div>
                </div>

                <Link
                  to="/albums/$idOrSlug"
                  params={{ idOrSlug: item.slug }}
                  className="font-mono text-[10px] uppercase tracking-[0.12em] py-1.5 px-3 border border-line bg-panel hover:bg-canvas-deep text-ink shrink-0 transition-colors"
                >
                  View Drop
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Listening History Shelf */}
      <RecentlyPlayedShelf
        title="Listening History"
        subtitle="Your Past Qualified Plays"
        limit={12}
      />

      {/* Privacy & Social Circles Card */}
      <div className="border border-line bg-panel p-6 sm:p-8 shadow-xs space-y-6">
        <div>
          <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-blue mb-1">
            Audience &bull; Privacy &bull; Social Circles
          </div>
          <h3 className="font-serif italic text-2xl text-ink font-normal">
            Privacy &amp; Community Visibility
          </h3>
          <p className="font-sans text-xs text-ink-soft mt-1 leading-relaxed">
            Control how other curators interact with your library, follow your profile, and see your live listening activity.
          </p>
        </div>

        {privacyMsg && (
          <div
            className={`p-3.5 border text-xs font-mono ${
              privacyMsg.type === 'success'
                ? 'border-emerald-800/30 bg-emerald-900/10 text-emerald-600 dark:text-emerald-400'
                : 'border-red-800/30 bg-red-900/10 text-red-600 dark:text-red-400'
            }`}
          >
            {privacyMsg.text}
          </div>
        )}

        <form onSubmit={handleUpdatePrivacy} className="space-y-6">
          {/* Account Privacy Toggle */}
          <div className="border border-line bg-canvas p-4 sm:p-5 flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] uppercase tracking-wider text-ink font-semibold">
                  Private Account
                </span>
                <span
                  className={`font-mono text-[8.5px] uppercase tracking-wider px-1.5 py-0.5 border ${
                    isPrivateAccount
                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      : 'border-line bg-panel text-ink-soft'
                  }`}
                >
                  {isPrivateAccount ? 'Gated Approval' : 'Open / Public'}
                </span>
              </div>
              <p className="font-sans text-xs text-ink-soft max-w-xl leading-relaxed">
                When your account is private, curators must request to follow you. You review each follow request in your Activity desk before they gain access to your follower-only library.
              </p>
            </div>

            <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
              <input
                type="checkbox"
                checked={isPrivateAccount}
                onChange={(e) => setIsPrivateAccount(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-canvas-deep border border-line peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-canvas after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-ink-soft peer-checked:after:bg-canvas after:border-line after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-ink"></div>
            </label>
          </div>

          {/* Live Listening Presence Tier */}
          <div className="border border-line bg-canvas p-4 sm:p-5 space-y-3">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-wider text-ink font-semibold">
                Live Turntable &bull; Listening Activity
              </div>
              <p className="font-sans text-xs text-ink-soft mt-0.5 leading-relaxed">
                Choose who can see your real-time playback in the "What Friends Are Listening To" live vinyl deck.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setListeningActivityPrivacy('FRIENDS_ONLY')}
                className={`p-3 text-left border transition-all cursor-pointer ${
                  listeningActivityPrivacy === 'FRIENDS_ONLY'
                    ? 'border-ink bg-panel shadow-xs'
                    : 'border-line bg-canvas-deep/40 hover:border-ink/40'
                }`}
              >
                <div className="font-mono text-[10px] uppercase tracking-wider font-semibold text-ink flex items-center justify-between">
                  <span>Mutual Friends</span>
                  {listeningActivityPrivacy === 'FRIENDS_ONLY' && (
                    <span className="text-emerald-600 font-bold">✓</span>
                  )}
                </div>
                <p className="font-sans text-[11px] text-ink-soft mt-1 leading-snug">
                  Only curators you both follow back can see your live vinyl turntable. (Recommended)
                </p>
              </button>

              <button
                type="button"
                onClick={() => setListeningActivityPrivacy('FOLLOWERS')}
                className={`p-3 text-left border transition-all cursor-pointer ${
                  listeningActivityPrivacy === 'FOLLOWERS'
                    ? 'border-ink bg-panel shadow-xs'
                    : 'border-line bg-canvas-deep/40 hover:border-ink/40'
                }`}
              >
                <div className="font-mono text-[10px] uppercase tracking-wider font-semibold text-ink flex items-center justify-between">
                  <span>All Followers</span>
                  {listeningActivityPrivacy === 'FOLLOWERS' && (
                    <span className="text-emerald-600 font-bold">✓</span>
                  )}
                </div>
                <p className="font-sans text-[11px] text-ink-soft mt-1 leading-snug">
                  Any member following your profile can see your live listening session.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setListeningActivityPrivacy('OFF')}
                className={`p-3 text-left border transition-all cursor-pointer ${
                  listeningActivityPrivacy === 'OFF'
                    ? 'border-ink bg-panel shadow-xs'
                    : 'border-line bg-canvas-deep/40 hover:border-ink/40'
                }`}
              >
                <div className="font-mono text-[10px] uppercase tracking-wider font-semibold text-ink flex items-center justify-between">
                  <span>Incognito / Off</span>
                  {listeningActivityPrivacy === 'OFF' && (
                    <span className="text-emerald-600 font-bold">✓</span>
                  )}
                </div>
                <p className="font-sans text-[11px] text-ink-soft mt-1 leading-snug">
                  Never broadcast live playback. Your personal listening history is preserved privately.
                </p>
              </button>
            </div>
          </div>

          {/* Library Privacy Tier */}
          <div className="border border-line bg-canvas p-4 sm:p-5 space-y-3">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-wider text-ink font-semibold">
                Library &amp; Presaves Visibility
              </div>
              <p className="font-sans text-xs text-ink-soft mt-0.5 leading-relaxed">
                Choose who can browse your public playlists, liked songs, and pre-saved releases.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setLibraryPrivacy('PUBLIC')}
                className={`p-3 text-left border transition-all cursor-pointer ${
                  libraryPrivacy === 'PUBLIC'
                    ? 'border-ink bg-panel shadow-xs'
                    : 'border-line bg-canvas-deep/40 hover:border-ink/40'
                }`}
              >
                <div className="font-mono text-[10px] uppercase tracking-wider font-semibold text-ink flex items-center justify-between">
                  <span>Public</span>
                  {libraryPrivacy === 'PUBLIC' && (
                    <span className="text-emerald-600 font-bold">✓</span>
                  )}
                </div>
                <p className="font-sans text-[11px] text-ink-soft mt-1 leading-snug">
                  Anyone in the Groovy community can discover your public playlists and library drops.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setLibraryPrivacy('FOLLOWERS_ONLY')}
                className={`p-3 text-left border transition-all cursor-pointer ${
                  libraryPrivacy === 'FOLLOWERS_ONLY'
                    ? 'border-ink bg-panel shadow-xs'
                    : 'border-line bg-canvas-deep/40 hover:border-ink/40'
                }`}
              >
                <div className="font-mono text-[10px] uppercase tracking-wider font-semibold text-ink flex items-center justify-between">
                  <span>Followers &amp; Friends</span>
                  {libraryPrivacy === 'FOLLOWERS_ONLY' && (
                    <span className="text-emerald-600 font-bold">✓</span>
                  )}
                </div>
                <p className="font-sans text-[11px] text-ink-soft mt-1 leading-snug">
                  Only approved followers can view your saved playlists and collections.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setLibraryPrivacy('PRIVATE')}
                className={`p-3 text-left border transition-all cursor-pointer ${
                  libraryPrivacy === 'PRIVATE'
                    ? 'border-ink bg-panel shadow-xs'
                    : 'border-line bg-canvas-deep/40 hover:border-ink/40'
                }`}
              >
                <div className="font-mono text-[10px] uppercase tracking-wider font-semibold text-ink flex items-center justify-between">
                  <span>Private / Only Me</span>
                  {libraryPrivacy === 'PRIVATE' && (
                    <span className="text-emerald-600 font-bold">✓</span>
                  )}
                </div>
                <p className="font-sans text-[11px] text-ink-soft mt-1 leading-snug">
                  Hidden from all outside visitors. Only accessible to your authenticated session.
                </p>
              </button>
            </div>
          </div>

          {/* Personal Collection & Offline Music Controls */}
          <div className="border border-line bg-canvas p-4 sm:p-5 space-y-4">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-wider text-ink font-semibold flex items-center gap-2">
                <span>Personal Collection &amp; Offline Music</span>
                <span className="font-mono text-[8.5px] uppercase tracking-wider px-1.5 py-0.5 border border-indigo-500/40 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  Sandboxed Storage
                </span>
              </div>
              <p className="font-sans text-xs text-ink-soft mt-0.5 leading-relaxed">
                Granularly control where your privately uploaded offline audio collection surfaces throughout the Groovy experience.
              </p>
            </div>

            <div className="space-y-3 divide-y divide-line/60">
              {/* Toggle 1: Search */}
              <div className="pt-3 first:pt-0 flex items-center justify-between gap-4">
                <div>
                  <div className="font-mono text-[10.5px] uppercase tracking-wider text-ink font-medium">
                    Include in Global Search
                  </div>
                  <p className="font-sans text-[11px] text-ink-soft leading-snug">
                    Surface your personal collection songs and albums in your own search bar results with a &quot;Personal Collection&quot; badge. (Never visible to other curators).
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={lockerIncludeInSearch}
                    onChange={(e) => setLockerIncludeInSearch(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-canvas-deep border border-line peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-canvas after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-ink-soft peer-checked:after:bg-canvas after:border-line after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-ink"></div>
                </label>
              </div>

              {/* Toggle 2: Recently Played & Activity */}
              <div className="pt-3 flex items-center justify-between gap-4">
                <div>
                  <div className="font-mono text-[10.5px] uppercase tracking-wider text-ink font-medium">
                    Include in Recently Played &amp; Activity
                  </div>
                  <p className="font-sans text-[11px] text-ink-soft leading-snug">
                    Record personal collection listening history on your Recent tracks shelf. When disabled, personal tracks are omitted from listening history and friend feeds.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={lockerIncludeInRecentlyPlayed}
                    onChange={(e) => setLockerIncludeInRecentlyPlayed(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-canvas-deep border border-line peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-canvas after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-ink-soft peer-checked:after:bg-canvas after:border-line after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-ink"></div>
                </label>
              </div>

              {/* Toggle 3: Home Feed */}
              <div className="pt-3 flex items-center justify-between gap-4">
                <div>
                  <div className="font-mono text-[10.5px] uppercase tracking-wider text-ink font-medium">
                    Include on Home &amp; Discovery Deck
                  </div>
                  <p className="font-sans text-[11px] text-ink-soft leading-snug">
                    Blend your personal collection releases into your personal home recommendation shelves.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={lockerIncludeInHome}
                    onChange={(e) => setLockerIncludeInHome(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-canvas-deep border border-line peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-canvas after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-ink-soft peer-checked:after:bg-canvas after:border-line after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-ink"></div>
                </label>
              </div>

              {/* Toggle 4: Verified Artists Link */}
              <div className="pt-3 flex items-center justify-between gap-4">
                <div>
                  <div className="font-mono text-[10.5px] uppercase tracking-wider text-ink font-medium">
                    Link to Verified Global Artists
                  </div>
                  <p className="font-sans text-[11px] text-ink-soft leading-snug">
                    Display an &quot;In Your Collection&quot; shelf on verified artist pages when your personal collection contains matching tracks by that artist.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={lockerLinkToGlobalArtists}
                    onChange={(e) => setLockerLinkToGlobalArtists(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-canvas-deep border border-line peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-canvas after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-ink-soft peer-checked:after:bg-canvas after:border-line after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-ink"></div>
                </label>
              </div>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={isSavingPrivacy}
              className="bg-ink text-canvas border border-ink py-2.5 px-6 font-mono text-[11px] uppercase tracking-[0.12em] font-medium transition-all hover:bg-canvas hover:text-ink disabled:opacity-50 cursor-pointer"
            >
              {isSavingPrivacy ? 'Saving Privacy...' : 'Save Privacy Preferences'}
            </button>
          </div>
        </form>
      </div>

      {/* ===================== PERSONAL COLLECTION VAULT ===================== */}
      <div className="border border-line bg-panel p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-5">
          <div>
            <div className="flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.18em] text-indigo-500 mb-1">
              <UploadCloudSVG className="w-3.5 h-3.5" />
              <span>Personal Collection &bull; Offline Music</span>
            </div>
            <h3 className="font-serif italic text-2xl text-ink font-normal">
              Private Audio Vault
            </h3>
            <p className="font-sans text-xs text-ink-soft mt-1 leading-relaxed">
              Import local audio folders (MP3, FLAC, WAV, M4A, AAC, OGG). Extracted in-browser and securely stored in your personal lossless vault.
            </p>
          </div>

          <button
            type="button"
            onClick={openLockerModal}
            className="font-mono text-[10.5px] uppercase tracking-[0.14em] py-2.5 px-5 bg-ink text-canvas hover:opacity-90 transition-opacity font-semibold flex items-center justify-center gap-2 cursor-pointer shrink-0"
          >
            <UploadCloudSVG className="w-4 h-4 text-indigo-400" />
            <span>Manage &amp; Import Music</span>
          </button>
        </div>

        {/* Quota Progress & Stats */}
        {lockerQuota && (
          <div className="bg-canvas border border-line p-4 space-y-2.5">
            <div className="flex items-center justify-between font-mono text-[10.5px] uppercase tracking-wider">
              <span className="text-ink-soft">
                Collection Quota:{' '}
                <strong className="text-ink font-bold">
                  {lockerQuota.usedSongs}
                </strong>{' '}
                / {lockerQuota.maxSongs} Songs
              </span>
              <span
                className={
                  lockerQuota.remainingSongs === 0
                    ? 'text-red-500 font-semibold'
                    : 'text-indigo-500 font-semibold'
                }
              >
                {lockerQuota.remainingSongs} Remaining
              </span>
            </div>

            <div className="w-full h-2 bg-canvas-deep border border-line rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  lockerQuota.usedSongs >= lockerQuota.maxSongs
                    ? 'bg-red-500'
                    : 'bg-indigo-500'
                }`}
                style={{
                  width: `${Math.min(
                    100,
                    Math.round((lockerQuota.usedSongs / lockerQuota.maxSongs) * 100)
                  )}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Releases Shelf / List */}
        {isLoadingLocker ? (
          <div className="py-12 text-center font-mono text-xs uppercase tracking-[0.14em] text-ink-soft animate-pulse">
            Loading private collection releases...
          </div>
        ) : lockerReleases.length === 0 ? (
          <div className="p-8 border border-dashed border-line bg-canvas/30 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 flex items-center justify-center mx-auto">
              <UploadCloudSVG className="w-6 h-6" />
            </div>
            <p className="font-serif italic text-base text-ink">
              Your Personal Collection is Empty
            </p>
            <p className="font-sans text-xs text-ink-soft max-w-md mx-auto leading-relaxed">
              No offline audio imported yet. You can drag and drop individual music files or whole albums to access them anywhere in Groovy.
            </p>
            <button
              type="button"
              onClick={openLockerModal}
              className="mt-2 inline-block font-mono text-[10px] uppercase tracking-[0.14em] py-2 px-4 border border-line bg-panel hover:bg-canvas text-ink transition-colors cursor-pointer"
            >
              + Launch Importer
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-soft">
              {lockerReleases.length} Personal {lockerReleases.length === 1 ? 'Release' : 'Releases'} in Collection
            </div>

            <div className="space-y-3">
              {lockerReleases.map((release) => {
                const isExpanded = expandedReleaseId === release.id
                const isDeletingRelease = deletingItemId === release.id

                return (
                  <div
                    key={release.id}
                    className="border border-line bg-canvas overflow-hidden transition-all shadow-2xs"
                  >
                    {/* Release Card Header */}
                    <div className="p-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        <div className="w-12 h-12 bg-panel border border-line shrink-0 overflow-hidden relative">
                          {release.coverImageUrl ? (
                            <img
                              src={release.coverImageUrl}
                              alt={release.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <ProceduralCover
                              size="sm"
                              title={release.title}
                              artistName={release.artistName}
                              className="w-full h-full rounded-none"
                            />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-serif italic text-base font-medium text-ink truncate">
                              {release.title}
                            </h4>
                            <span className="font-mono text-[8px] uppercase tracking-wider text-indigo-500 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.2 rounded font-semibold">
                              {release.albumType || 'Album'}
                            </span>
                          </div>
                          <p className="font-sans text-xs text-ink-soft truncate mt-0.5">
                            {release.artistName} &bull; {release.totalTracks}{' '}
                            {release.totalTracks === 1 ? 'track' : 'tracks'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {release.tracks?.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              handlePlayLockerTrack(release, release.tracks[0], 0)
                            }
                            className="w-8 h-8 rounded-full border border-line bg-panel hover:bg-canvas flex items-center justify-center text-ink transition-colors cursor-pointer"
                            title="Play Release"
                          >
                            <PlayIconSVG className="w-3.5 h-3.5 ml-0.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedReleaseId(isExpanded ? null : release.id)
                          }
                          className="font-mono text-[9px] uppercase tracking-wider px-2.5 py-1.5 border border-line bg-panel hover:bg-canvas text-ink transition-colors cursor-pointer"
                        >
                          {isExpanded ? 'Hide Tracks' : 'View Tracks'}
                        </button>

                        <button
                          type="button"
                          disabled={isDeletingRelease}
                          onClick={() =>
                            handleDeleteLockerRelease(
                              release.id,
                              release.title,
                              release.totalTracks || release.tracks?.length || 1
                            )
                          }
                          className="w-8 h-8 rounded-full border border-line bg-panel hover:bg-red-500/10 hover:border-red-400 hover:text-red-500 flex items-center justify-center text-ink-soft transition-colors cursor-pointer"
                          title="Delete Release from Personal Collection"
                        >
                          {isDeletingRelease ? (
                            <div className="w-3 h-3 border border-red-400 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <TrashIconSVG className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Expandable Tracks List */}
                    {isExpanded && release.tracks && (
                      <div className="border-t border-line divide-y divide-line/60 bg-panel/40">
                        {release.tracks.map((track: any, tIdx: number) => {
                          const isPlayingThis =
                            currentTrack?.id === track.id &&
                            playbackStatus === 'playing'
                          const isDeletingTrack = deletingItemId === track.id

                          return (
                            <div
                              key={track.id}
                              className={`py-2 px-4 flex items-center justify-between gap-4 hover:bg-canvas transition-colors ${
                                currentTrack?.id === track.id
                                  ? 'bg-panel-deep'
                                  : ''
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handlePlayLockerTrack(release, track, tIdx)
                                  }
                                  className="w-6 h-6 rounded-full border border-line flex items-center justify-center font-mono text-[10px] text-ink-soft hover:border-ink hover:text-ink transition-colors shrink-0 cursor-pointer bg-canvas"
                                >
                                  {isPlayingThis ? (
                                    <PauseIconSVG className="w-2.5 h-2.5" />
                                  ) : (
                                    <PlayIconSVG className="w-2.5 h-2.5 ml-0.2" />
                                  )}
                                </button>
                                <span className="font-mono text-[10px] text-ink-soft w-4 text-right">
                                  {track.trackNumber || tIdx + 1}
                                </span>
                                <span className="font-serif italic text-xs text-ink truncate">
                                  {track.title}
                                </span>
                                {track.processingStatus === 'PROCESSING' && (
                                  <span className="font-mono text-[8px] uppercase tracking-wider text-amber-500 bg-amber-500/10 border border-amber-500/20 px-1 py-0.2 rounded animate-pulse">
                                    Transcoding
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-3 shrink-0">
                                <span className="font-mono text-[10px] text-ink-soft">
                                  {Math.floor(track.durationSeconds / 60)}:
                                  {(track.durationSeconds % 60)
                                    .toString()
                                    .padStart(2, '0')}
                                </span>

                                <button
                                  type="button"
                                  disabled={isDeletingTrack}
                                  onClick={() =>
                                    handleDeleteLockerSong(track.id, release.id)
                                  }
                                  className="p-1 text-ink-soft hover:text-red-500 transition-colors cursor-pointer"
                                  title="Delete track from Personal Collection"
                                >
                                  {isDeletingTrack ? (
                                    <div className="w-2.5 h-2.5 border border-red-400 border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <TrashIconSVG className="w-3 h-3" />
                                  )}
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
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
          Session &amp; Device Controls
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

      {/* Upgrade / Change Plan Modal (Dev Mock Checkout) */}
      {isUpgradeModalOpen && (
        <div className="fixed inset-0 bg-ink/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          <div className="max-w-4xl w-full bg-panel border-2 border-line shadow-2xl p-6 sm:p-8 space-y-6 my-auto max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div>
                <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-blue block mb-1">
                  Maison Sound Tiers &bull; Dev Mock Checkout
                </span>
                <h3 className="font-serif italic text-2xl sm:text-3xl text-ink">
                  Select Your Audio Experience
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsUpgradeModalOpen(false)}
                className="font-mono text-xs text-ink-soft hover:text-ink cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            {isLoadingPlans ? (
              <div className="py-20 text-center font-mono text-xs text-ink-soft animate-pulse">
                Querying active subscription tiers and feature catalog...
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {availablePlans.map((plan) => {
                  const isCurrent = entitlements?.planId === plan.id
                  return (
                    <div
                      key={plan.id}
                      className={`p-5 border flex flex-col justify-between space-y-5 transition-all ${
                        isCurrent
                          ? 'border-ink bg-canvas shadow-xs'
                          : 'border-line bg-panel hover:border-ink/50'
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[9px] uppercase tracking-wider px-2 py-0.5 border border-line bg-panel font-semibold text-blue">
                            {plan.id}
                          </span>
                          {isCurrent && (
                            <span className="font-mono text-[8.5px] uppercase tracking-wider px-1.5 py-0.5 border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold">
                              Current Plan
                            </span>
                          )}
                        </div>

                        <div>
                          <h4 className="font-serif italic text-2xl text-ink font-medium">
                            {plan.name}
                          </h4>
                          <div className="font-mono text-xs text-ink-soft mt-1">
                            <span className="text-xl font-bold text-ink">
                              {(plan.priceCents / 100).toLocaleString(undefined, {
                                style: 'currency',
                                currency: plan.currency || 'USD',
                              })}
                            </span>
                            <span> / {plan.interval}</span>
                          </div>
                        </div>

                        {/* Feature comparison checklist */}
                        <div className="pt-3 border-t border-line-soft space-y-2 font-sans text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-emerald-600 font-bold">✓</span>
                            <span>
                              Audio:{' '}
                              <strong className="font-mono text-xs">
                                {plan.features.max_bitrate_kbps ?? 128} kbps
                              </strong>
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-mono font-bold ${
                                plan.features.lossless
                                  ? 'text-emerald-600'
                                  : 'text-ink-soft/40'
                              }`}
                            >
                              {plan.features.lossless ? '✓' : '✕'}
                            </span>
                            <span
                              className={
                                plan.features.lossless
                                  ? 'text-ink'
                                  : 'text-ink-soft line-through'
                              }
                            >
                              FLAC Lossless Audio
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-mono font-bold ${
                                plan.features.can_host_jam
                                  ? 'text-emerald-600'
                                  : 'text-ink-soft/40'
                              }`}
                            >
                              {plan.features.can_host_jam ? '✓' : '✕'}
                            </span>
                            <span
                              className={
                                plan.features.can_host_jam
                                  ? 'text-ink'
                                  : 'text-ink-soft line-through'
                              }
                            >
                              Host Live Jams ({plan.features.max_jam_participants ?? 3}{' '}
                              listeners)
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-mono font-bold ${
                                plan.features.ad_free
                                  ? 'text-emerald-600'
                                  : 'text-ink-soft/40'
                              }`}
                            >
                              {plan.features.ad_free ? '✓' : '✕'}
                            </span>
                            <span
                              className={
                                plan.features.ad_free
                                  ? 'text-ink'
                                  : 'text-ink-soft'
                              }
                            >
                              {plan.features.ad_free ? 'Ad-Free Playback' : 'Sponsored Audio'}
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
                                <div key={k} className="flex items-center gap-2">
                                  <span className="font-mono text-emerald-600 font-bold">✓</span>
                                  <span className="font-mono text-[11px] text-ink">
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

                      <div className="pt-3 border-t border-line">
                        <button
                          type="button"
                          disabled={isCurrent || isUpgradingPlan}
                          onClick={() => handleSwitchPlan(plan.id)}
                          className={`w-full font-mono text-[10.5px] uppercase tracking-[0.14em] py-2.5 px-4 transition-all cursor-pointer font-semibold ${
                            isCurrent
                              ? 'bg-line/40 text-ink-soft cursor-not-allowed border border-line'
                              : 'bg-ink text-canvas hover:opacity-90'
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
