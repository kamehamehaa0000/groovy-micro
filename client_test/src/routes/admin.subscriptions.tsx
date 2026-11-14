import { createFileRoute, Link, Outlet, useLocation, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../stores/auth.store'
import { subscriptionsApi } from '../lib/subscriptions.api'
import { AdminShell } from '../Components/admin/AdminShell'
import { Tabs } from '../Components/ui/Tabs'
import { H1 } from '../Components/ui/typography'

export const Route = createFileRoute('/admin/subscriptions')({
  staticData: { layout: 'full' },
  component: AdminSubscriptionsLayout,
})

function AdminSubscriptionsLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthStore()

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      navigate({ to: '/login', search: { redirect: '/admin/subscriptions' } })
    }
  }, [isAuthLoading, isAuthenticated, navigate])

  // The counts on the tabs. The desks use the same query keys, so this is a
  // cache read, not a second request.
  const plansQuery = useQuery({
    queryKey: ['admin', 'plans'],
    queryFn: () => subscriptionsApi.adminListPlans(),
    enabled: user?.role === 'ADMIN',
  })
  const featuresQuery = useQuery({
    queryKey: ['admin', 'features'],
    queryFn: () => subscriptionsApi.adminListFeatures(),
    enabled: user?.role === 'ADMIN',
  })

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
          Access to subscription plans and dynamic feature catalog requires
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

  const planCount = plansQuery.data?.plans.length ?? 0
  const featureCount = featuresQuery.data?.features.length ?? 0

  return (
    <AdminShell
      title="Subscriptions & Feature Catalog"
      description="Configure subscription tiers, manage pricing, and define dynamic perks and capabilities for the entitlement engine."
      activePath="/admin/subscriptions"
      nav={[
        { label: 'Artist Verifications', to: '/admin/verification' },
        {
          label: 'Subscription Plans & Feature Catalog',
          to: '/admin/subscriptions',
        },
      ]}
    >
      <Tabs
        variant="underline"
        ariaLabel="Subscription desks"
        value={location.pathname.includes('/features') ? 'features' : 'plans'}
        onChange={(next) =>
          navigate({
            to: next === 'features'
              ? '/admin/subscriptions/features'
              : '/admin/subscriptions/plans',
          })
        }
        className="mb-6"
        items={[
          { id: 'plans', label: 'Subscription Plans', count: planCount },
          { id: 'features', label: 'Feature Catalog & Perks', count: featureCount },
        ]}
      />

      <Outlet />
    </AdminShell>
  )
}
