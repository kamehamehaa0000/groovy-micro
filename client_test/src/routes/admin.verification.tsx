import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useAuthStore } from '../stores/auth.store'
import { artistsApi } from '../lib/artists.api'
import type { AdminArtistListItem } from '../types/artist'
import { VerifiedBadgeSVG, ExternalLinkSVG } from '../Components/icons'

export const Route = createFileRoute('/admin/verification')({
  component: AdminVerificationDeskComponent,
})

function AdminVerificationDeskComponent() {
  const navigate = useNavigate()
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthStore()

  const [activeTab, setActiveTab] = useState<
    'PENDING' | 'VERIFIED' | 'REJECTED' | 'ALL'
  >('PENDING')
  const [search, setSearch] = useState('')
  const [applications, setApplications] = useState<AdminArtistListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  // Rejection modal state
  const [rejectingArtistId, setRejectingArtistId] = useState<string | null>(
    null,
  )
  const [rejectReason, setRejectReason] = useState('')
  const [isRejecting, setIsRejecting] = useState(false)
  const [isApprovingId, setIsApprovingId] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      navigate({ to: '/login' })
    }
  }, [isAuthLoading, isAuthenticated, navigate])

  const fetchApplications = async () => {
    setIsLoading(true)
    setActionError(null)
    try {
      const res = await artistsApi.adminListArtists({
        status: activeTab,
        search: search.trim() || undefined,
        limit: 50,
      })
      setApplications(res.data)
    } catch (err: any) {
      setActionError(err.message || 'Failed to retrieve applications')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      fetchApplications()
    }
  }, [activeTab, user])

  // Search debounce
  useEffect(() => {
    if (user?.role !== 'ADMIN') return
    const timer = setTimeout(() => {
      fetchApplications()
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const handleApprove = async (artistId: string) => {
    setIsApprovingId(artistId)
    setActionError(null)
    try {
      await artistsApi.adminVerify(artistId, { status: 'VERIFIED' })
      setActionSuccess('Artist profile approved and verified successfully.')
      await fetchApplications()
    } catch (err: any) {
      setActionError(err.message || 'Approval failed')
    } finally {
      setIsApprovingId(null)
    }
  }

  const handleConfirmReject = async () => {
    if (!rejectingArtistId || !rejectReason.trim()) return

    setIsRejecting(true)
    setActionError(null)
    try {
      await artistsApi.adminVerify(rejectingArtistId, {
        status: 'REJECTED',
        reason: rejectReason.trim(),
      })
      setActionSuccess('Application rejected with explanatory feedback.')
      setRejectingArtistId(null)
      setRejectReason('')
      await fetchApplications()
    } catch (err: any) {
      setActionError(err.message || 'Rejection failed')
    } finally {
      setIsRejecting(false)
    }
  }

  if (isAuthLoading) {
    return (
      <div className="py-32 text-center font-mono text-xs uppercase tracking-[0.16em] text-ink-soft animate-pulse">
        Checking administrative clearance...
      </div>
    )
  }

  if (user?.role !== 'ADMIN') {
    return (
      <div className="max-w-xl mx-auto py-24 px-6 text-center">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-red-500 block mb-2">
          403 Access Restricted
        </span>
        <h1 className="font-serif italic text-3xl text-ink">
          Administrative Desk
        </h1>
        <p className="font-sans text-xs text-ink-soft mt-3 leading-relaxed">
          Access to artist identity verification and credential audits requires
          administrative clearance.
        </p>
        <Link
          to="/"
          className="inline-block mt-6 font-mono text-[10.5px] uppercase tracking-[0.14em] py-2 px-4 border border-line bg-panel hover:bg-canvas text-ink transition-colors"
        >
          &larr; Return to Catalog
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 w-full">
      {/* Header */}
      <div className="border-b border-line pb-6 mb-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-blue block mb-1">
              Groovy Administration
            </span>
            <h1 className="font-serif italic text-3xl sm:text-4xl text-ink tracking-tight">
              Artist Verification Desk
            </h1>
            <p className="font-sans text-xs text-ink-soft mt-1">
              Review artist pitch materials, confirm external platform presence,
              and issue verified badges.
            </p>
          </div>

          <Link
            to="/studio"
            className="font-mono text-[10px] uppercase tracking-[0.14em] py-2 px-3 border border-line bg-panel text-ink hover:bg-canvas transition-colors hidden sm:inline-block"
          >
            My Studio &rarr;
          </Link>
        </div>

        {/* Action Alerts */}
        {actionSuccess && (
          <div className="mt-4 p-3 border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-200 font-mono text-xs">
            {actionSuccess}
          </div>
        )}
        {actionError && (
          <div className="mt-4 p-3 border border-red-300 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300 font-mono text-xs">
            {actionError}
          </div>
        )}

        {/* Filter Tabs & Search Bar */}
        <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-1 border-b sm:border-b-0 border-line pb-2 sm:pb-0 font-mono text-xs">
            {(['PENDING', 'VERIFIED', 'REJECTED', 'ALL'] as const).map(
              (tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`py-1.5 px-3 uppercase tracking-[0.14em] transition-colors cursor-pointer ${
                    activeTab === tab
                      ? 'border-b-2 border-blue text-ink font-semibold'
                      : 'text-ink-soft hover:text-ink'
                  }`}
                >
                  {tab}
                </button>
              ),
            )}
          </div>

          <div className="relative max-w-xs w-full">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by artist, slug, or email..."
              className="w-full font-mono text-xs py-1.5 px-3 border border-line bg-panel text-ink focus:outline-none focus:border-ink"
            />
          </div>
        </div>
      </div>

      {/* Applications List */}
      {isLoading ? (
        <div className="py-24 text-center font-mono text-xs uppercase tracking-[0.16em] text-ink-soft animate-pulse">
          Loading applications...
        </div>
      ) : applications.length === 0 ? (
        <div className="py-20 text-center border border-dashed border-line p-8 bg-panel/30">
          <p className="font-serif italic text-lg text-ink">
            No applications in this category
          </p>
          <p className="font-mono text-xs text-ink-soft mt-1">
            Status: {activeTab}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {applications.map((app) => {
            const isRejectingThis = rejectingArtistId === app.id
            const details = app.verificationDetails

            return (
              <div
                key={app.id}
                className="p-6 border border-line bg-panel shadow-2xs flex flex-col gap-4"
              >
                {/* Header Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-line-soft">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        to="/artists/$idOrSlug"
                        params={{ idOrSlug: app.slug }}
                        className="font-serif italic text-xl text-ink hover:text-blue transition-colors flex items-center gap-1.5"
                      >
                        <span>{app.stageName}</span>
                        <ExternalLinkSVG className="w-3.5 h-3.5 text-ink-soft" />
                      </Link>
                      {app.verified && (
                        <VerifiedBadgeSVG className="w-4 h-4 text-blue" />
                      )}
                    </div>
                    <div className="font-mono text-[11px] text-ink-soft flex items-center gap-2 mt-0.5">
                      <span>@{app.slug}</span>
                      <span>•</span>
                      <span>Owner: {app.ownerEmail}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`font-mono text-[10px] uppercase tracking-[0.14em] py-1 px-2.5 border ${
                        app.verificationStatus === 'VERIFIED'
                          ? 'border-blue/30 bg-blue/10 text-blue font-semibold'
                          : app.verificationStatus === 'PENDING'
                            ? 'border-amber-400/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 font-semibold'
                            : app.verificationStatus === 'REJECTED'
                              ? 'border-red-400/40 bg-red-500/10 text-red-600 dark:text-red-400'
                              : 'border-line text-ink-soft'
                      }`}
                    >
                      {app.verificationStatus}
                    </span>
                  </div>
                </div>

                {/* Pitch Statement */}
                {details?.message && (
                  <div>
                    <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-soft block mb-1">
                      Artist Pitch / Background
                    </span>
                    <p className="font-sans text-xs text-ink leading-relaxed whitespace-pre-line p-3 border border-line-soft bg-canvas">
                      {details.message}
                    </p>
                  </div>
                )}

                {/* Contact Telemetry */}
                {(details?.contactEmail || details?.contactPhone) && (
                  <div className="flex items-center gap-4 font-mono text-[10.5px] text-ink-soft">
                    {details.contactEmail && (
                      <span>
                        Email:{' '}
                        <strong className="text-ink">
                          {details.contactEmail}
                        </strong>
                      </span>
                    )}
                    {details.contactPhone && (
                      <span>
                        Phone:{' '}
                        <strong className="text-ink">
                          {details.contactPhone}
                        </strong>
                      </span>
                    )}
                  </div>
                )}

                {/* Proof Links */}
                {details?.links && details.links.length > 0 && (
                  <div>
                    <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-soft block mb-1.5">
                      Proof & Verification Links ({details.links.length})
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {details.links.map((link, idx) => (
                        <a
                          key={idx}
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-[10px] py-1 px-2.5 border border-line bg-canvas hover:border-ink text-ink flex items-center gap-1.5 max-w-sm truncate"
                        >
                          <span className="truncate">{link}</span>
                          <ExternalLinkSVG className="w-2.5 h-2.5 text-ink-soft shrink-0" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Stored Rejection Reason if any */}
                {app.rejectionReason && (
                  <div className="p-3 border border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/10 font-mono text-xs text-red-700 dark:text-red-300">
                    <span className="font-semibold">
                      Recorded Rejection Reason:
                    </span>{' '}
                    {app.rejectionReason}
                  </div>
                )}

                {/* Admin Actions Bar */}
                <div className="pt-3 border-t border-line-soft flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-soft">
                    Registered:{' '}
                    {new Date(app.createdAt).toLocaleString(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>

                  <div className="flex items-center gap-2.5">
                    {app.verificationStatus !== 'VERIFIED' && (
                      <button
                        type="button"
                        disabled={isApprovingId === app.id}
                        onClick={() => handleApprove(app.id)}
                        className="font-mono text-[10px] uppercase tracking-[0.14em] py-1.5 px-4 bg-ink text-canvas hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 font-semibold"
                      >
                        {isApprovingId === app.id
                          ? 'Approving...'
                          : '✓ Approve & Verify'}
                      </button>
                    )}

                    {!isRejectingThis && (
                      <button
                        type="button"
                        onClick={() => {
                          setRejectingArtistId(app.id)
                          setRejectReason('')
                        }}
                        className="font-mono text-[10px] uppercase tracking-[0.14em] py-1.5 px-3 border border-line text-red-600 hover:border-red-500 hover:bg-red-50/50 dark:hover:bg-red-950/20 transition-colors cursor-pointer"
                      >
                        {app.verificationStatus === 'VERIFIED'
                          ? 'Revoke / Reject'
                          : 'Reject Application'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Inline Rejection Reason Form */}
                {isRejectingThis && (
                  <div className="p-4 border border-red-300 bg-red-50/30 dark:bg-red-950/10 flex flex-col gap-3">
                    <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-red-700 dark:text-red-300 block">
                      Provide Required Rejection Reason (Visible to Artist):
                    </label>
                    <textarea
                      rows={2}
                      required
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="e.g. Please provide a verified Spotify or Apple Music profile link with your active catalog."
                      className="w-full font-mono text-xs py-2 px-3 border border-line bg-canvas text-ink focus:outline-none focus:border-ink resize-y"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isRejecting || rejectReason.trim().length < 5}
                        onClick={handleConfirmReject}
                        className="font-mono text-[10px] uppercase tracking-[0.14em] py-1.5 px-4 bg-red-600 text-white hover:bg-red-700 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {isRejecting ? 'Rejecting...' : 'Confirm Rejection'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRejectingArtistId(null)}
                        className="font-mono text-[10px] uppercase tracking-[0.14em] py-1.5 px-3 border border-line text-ink-soft hover:text-ink cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
