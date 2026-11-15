import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useDeferredValue } from 'react'
import { useAuthStore } from '../stores/auth.store'
import { artistsApi } from '../lib/artists.api'
import type { AdminArtistListItem } from '../types/artist'
import { VerifiedBadgeSVG, ExternalLinkSVG } from '../Components/Icons'
import { EmptyState } from '../Components/ui/EmptyState'
import { Tabs } from '../Components/ui/Tabs'
import { AdminShell } from '../Components/admin/AdminShell'
import { H1 } from '../Components/ui/typography'

export const Route = createFileRoute('/admin/verification')({
  staticData: { layout: 'full' },
  component: AdminVerificationDeskComponent,
})

type StatusFilter = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'ALL'

const STATUS_FILTERS: StatusFilter[] = [
  'PENDING',
  'VERIFIED',
  'REJECTED',
  'ALL',
]

function AdminVerificationDeskComponent() {
  const navigate = useNavigate()
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthStore()

  const [activeTab, setActiveTab] = useState<StatusFilter>('PENDING')
  const [search, setSearch] = useState('')
  // The list renders against the deferred value, so typing never waits for
  // the (debounced) request to come back.
  const deferredSearch = useDeferredValue(search)
  const [applications, setApplications] = useState<AdminArtistListItem[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
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
      navigate({ to: '/login', search: { redirect: '/admin/verification' } })
    }
  }, [isAuthLoading, isAuthenticated, navigate])

  const PAGE_SIZE = 50

  const fetchApplications = async (nextPage = 1, append = false) => {
    if (append) setIsLoadingMore(true)
    else setIsLoading(true)
    setActionError(null)
    try {
      const res = await artistsApi.adminListArtists({
        status: activeTab,
        search: deferredSearch.trim() || undefined,
        page: nextPage,
        limit: PAGE_SIZE,
      })
      setApplications((prev) => (append ? [...prev, ...res.data] : res.data))
      setPage(nextPage)
      setHasMore(res.data.length >= PAGE_SIZE)
    } catch (err: any) {
      setActionError(err.message || 'Failed to retrieve applications')
    } finally {
      setIsLoading(false)
      setIsLoadingMore(false)
    }
  }

  const loadMore = () => {
    if (isLoadingMore || !hasMore) return
    void fetchApplications(page + 1, true)
  }

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      void fetchApplications(1, false)
    }
  }, [activeTab, deferredSearch, user])

  // Search debounce: the request waits for the field to settle.
  useEffect(() => {
    if (user?.role !== 'ADMIN') return
    if (deferredSearch === search) return
    const timer = setTimeout(() => {
      void fetchApplications(1, false)
    }, 300)
    return () => clearTimeout(timer)
  }, [search, deferredSearch])

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
      <div className="py-32 text-center font-eyebrow text-caption uppercase tracking-widest text-muted-foreground animate-pulse">
        Checking administrative clearance...
      </div>
    )
  }

  if (user?.role !== 'ADMIN') {
    return (
      <div className="mx-auto max-w-xl py-24 text-center">
        <span className="font-eyebrow text-caption uppercase tracking-widest text-destructive block mb-2">
          403 Access Restricted
        </span>
        <H1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Administrative Desk
        </H1>
        <p className="font-sans text-caption text-muted-foreground mt-3 leading-relaxed">
          Access to artist identity verification and credential audits requires
          administrative clearance.
        </p>
        <Link
          to="/"
          className="inline-block mt-6 font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-4 border border-border bg-card hover:bg-background text-foreground transition-colors"
        >
          &larr; Return to Catalog
        </Link>
      </div>
    )
  }

  return (
    <AdminShell
      title="Artist Verification Desk"
      description="Review artist pitch materials, confirm external platform presence, and issue verified badges."
      activePath="/admin/verification"
      nav={[
        { label: 'Artist Verifications', to: '/admin/verification' },
        {
          label: 'Subscription Plans & Feature Catalog',
          to: '/admin/subscriptions',
        },
      ]}
      actions={
        <Link
          to="/studio"
          className="font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-3 border border-border bg-card text-foreground hover:bg-background transition-colors hidden sm:inline-block"
        >
          My Studio &rarr;
        </Link>
      }
    >
      {/* Action Alerts */}
      {actionSuccess && (
        <div className="mb-6 p-3 border border-success/40 bg-success-soft text-success font-mono text-caption">
            {actionSuccess}
          </div>
        )}
        {actionError && (
          <div className="mb-6 p-3 border border-destructive/40 bg-destructive-soft text-destructive font-mono text-caption">
            {actionError}
          </div>
        )}

        {/* Filter Tabs & Search Bar */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Tabs
            variant="mono"
            ariaLabel="Verification status"
            value={activeTab}
            onChange={(next) => setActiveTab(next as StatusFilter)}
            items={STATUS_FILTERS.map((filter) => ({
              id: filter,
              label: filter,
            }))}
          />

          <div className="relative max-w-xs w-full">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by artist, slug, or email..."
              aria-label="Filter applications"
              className="w-full rounded-control border border-border bg-card px-3 py-2 font-mono text-caption text-foreground placeholder:text-muted-foreground/60 transition-colors focus:border-primary focus:outline-none"
            />
          </div>
        </div>

      {/* Applications List */}
      {isLoading ? (
        <div className="py-24 text-center font-eyebrow text-caption uppercase tracking-widest text-muted-foreground animate-pulse">
          Loading applications...
        </div>
      ) : applications.length === 0 ? (
        <EmptyState
          title="No applications in this category"
          description={`Nothing is currently ${activeTab.toLowerCase()}.`}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {applications.map((app) => {
            const isRejectingThis = rejectingArtistId === app.id
            const details = app.verificationDetails

            return (
              <div
                key={app.id}
                className="p-6 border border-border bg-card shadow-raised flex flex-col gap-4"
              >
                {/* Header Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border-soft">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        to="/artists/$idOrSlug"
                        params={{ idOrSlug: app.slug }}
                        className="text-heading text-foreground hover:text-primary transition-colors flex items-center gap-1.5 font-medium"
                      >
                        <span>{app.stageName}</span>
                        <ExternalLinkSVG className="w-3.5 h-3.5 text-muted-foreground" />
                      </Link>
                      {app.verified && (
                        <VerifiedBadgeSVG className="w-4 h-4 text-primary" />
                      )}
                    </div>
                    <div className="font-mono text-eyebrow text-muted-foreground flex items-center gap-2 mt-0.5">
                      <span>@{app.slug}</span>
                      <span>•</span>
                      <span>Owner: {app.ownerEmail}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`font-eyebrow text-eyebrow uppercase tracking-wider py-1 px-2.5 border ${
                        app.verificationStatus === 'VERIFIED'
                          ? 'border-primary/30 bg-primary/10 text-primary font-semibold'
                          : app.verificationStatus === 'PENDING'
                            ? 'border-warning/40 bg-warning-soft text-warning font-semibold'
                            : app.verificationStatus === 'REJECTED'
                              ? 'border-destructive/40 bg-destructive-soft text-destructive'
                              : 'border-border text-muted-foreground'
                      }`}
                    >
                      {app.verificationStatus}
                    </span>
                  </div>
                </div>

                {/* Pitch Statement */}
                {details?.message && (
                  <div>
                    <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground block mb-1">
                      Artist Pitch / Background
                    </span>
                    <p className="font-sans text-caption text-foreground leading-relaxed whitespace-pre-line p-3 border border-border-soft bg-background">
                      {details.message}
                    </p>
                  </div>
                )}

                {/* Contact Telemetry */}
                {(details?.contactEmail || details?.contactPhone) && (
                  <div className="flex items-center gap-4 font-mono text-eyebrow text-muted-foreground">
                    {details.contactEmail && (
                      <span>
                        Email:{' '}
                        <strong className="text-foreground">
                          {details.contactEmail}
                        </strong>
                      </span>
                    )}
                    {details.contactPhone && (
                      <span>
                        Phone:{' '}
                        <strong className="text-foreground">
                          {details.contactPhone}
                        </strong>
                      </span>
                    )}
                  </div>
                )}

                {/* Proof Links */}
                {details?.links && details.links.length > 0 && (
                  <div>
                    <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground block mb-1.5">
                      Proof &amp; Verification Links ({details.links.length})
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {details.links.map((link, idx) => (
                        <a
                          key={idx}
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-eyebrow py-1 px-2.5 border border-border bg-background hover:border-foreground text-foreground flex items-center gap-1.5 max-w-sm truncate"
                        >
                          <span className="truncate">{link}</span>
                          <ExternalLinkSVG className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Stored Rejection Reason if any */}
                {app.rejectionReason && (
                  <div className="p-3 border border-destructive/40 bg-destructive-soft font-mono text-caption text-destructive">
                    <span className="font-semibold">
                      Recorded Rejection Reason:
                    </span>{' '}
                    {app.rejectionReason}
                  </div>
                )}

                {/* Admin Actions Bar */}
                <div className="pt-3 border-t border-border-soft flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground">
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
                        className="font-eyebrow text-eyebrow uppercase tracking-wider py-1.5 px-4 bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 font-semibold"
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
                        className="font-eyebrow text-eyebrow uppercase tracking-wider py-1.5 px-3 border border-border text-destructive hover:border-destructive hover:bg-destructive/20 transition-colors cursor-pointer"
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
                  <div className="p-4 border border-destructive/40 bg-destructive-soft flex flex-col gap-3">
                    <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-destructive block">
                      Provide Required Rejection Reason (Visible to Artist):
                    </label>
                    <textarea
                      rows={2}
                      required
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="e.g. Please provide a verified Spotify or Apple Music profile link with your active catalog."
                      className="w-full font-mono text-caption py-2 px-3 border border-border bg-background text-foreground focus:outline-none focus:border-foreground resize-y"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isRejecting || rejectReason.trim().length < 5}
                        onClick={handleConfirmReject}
                        className="font-eyebrow text-eyebrow uppercase tracking-wider py-1.5 px-4 bg-destructive text-destructive-foreground hover:bg-destructive/20 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {isRejecting ? 'Rejecting...' : 'Confirm Rejection'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRejectingArtistId(null)}
                        className="font-eyebrow text-eyebrow uppercase tracking-wider py-1.5 px-3 border border-border text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {hasMore && (
            <div className="flex flex-col items-center gap-2 pt-2">
              <button
                type="button"
                onClick={loadMore}
                disabled={isLoadingMore}
                className="rounded-control border border-border bg-card px-5 py-2.5 font-eyebrow text-eyebrow uppercase tracking-wider text-foreground transition-colors hover:border-foreground disabled:opacity-50"
              >
                {isLoadingMore ? 'Loading...' : 'Load more applications'}
              </button>
              <p className="font-mono text-caption text-muted-foreground">
                Showing {applications.length}
              </p>
            </div>
          )}
        </div>
      )}
    </AdminShell>
  )
}
