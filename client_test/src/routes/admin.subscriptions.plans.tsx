import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { subscriptionsApi } from '../lib/subscriptions.api'
import { EmptyState, SkeletonGrid } from '../Components/ui/EmptyState'
import { Button } from '../Components/ui/Button'
import type { SubscriptionPlan } from '../types/subscriptions'
import { H2 } from '../Components/ui/typography'

export const Route = createFileRoute('/admin/subscriptions/plans')({
  component: AdminPlansDesk,
})

function formatPrice(plan: SubscriptionPlan): string {
  return (plan.priceCents / 100).toLocaleString(undefined, {
    style: 'currency',
    currency: plan.currency || 'USD',
  })
}

function AdminPlansDesk() {
  const plansQuery = useQuery({
    queryKey: ['admin', 'plans'],
    queryFn: () => subscriptionsApi.adminListPlans(),
  })

  const plans = plansQuery.data?.plans ?? []

  if (plansQuery.isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-4 w-48 animate-pulse rounded-inset bg-secondary/40" />
        <SkeletonGrid count={6} itemClassName="h-64" />
      </div>
    )
  }

  if (plansQuery.isError) {
    return (
      <EmptyState
        title="Could not load the plans"
        description={
          plansQuery.error instanceof Error
            ? plansQuery.error.message
            : 'The request could not be completed.'
        }
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void plansQuery.refetch()}
          >
            Try again
          </Button>
        }
      />
    )
  }

  if (plans.length === 0) {
    return (
      <EmptyState
        title="No subscription plans configured yet"
        description="Create the first tier to start selling access."
        action={
          <Link
            to="/admin/subscriptions/plan/$planId"
            params={{ planId: 'new' }}
            className="font-eyebrow text-caption uppercase tracking-wider text-primary hover:underline"
          >
            Create your first plan
          </Link>
        }
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-sans text-caption text-muted-foreground">
          {plans.length} tier{plans.length === 1 ? '' : 's'} configured.
          Open a plan to edit its price and its feature matrix.
        </p>
        <Link
          to="/admin/subscriptions/plan/$planId"
          params={{ planId: 'new' }}
          className="font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-4 bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer font-semibold"
        >
          + New Subscription Plan
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className="border border-border bg-card p-6 shadow-raised flex flex-col justify-between space-y-6"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-eyebrow text-eyebrow uppercase tracking-wider px-2 py-0.5 border border-border bg-background text-primary font-semibold">
                  {plan.id}
                </span>
                <span
                  className={`font-eyebrow text-eyebrow uppercase tracking-wider px-1.5 py-0.5 border ${
                    plan.isActive
                      ? 'border-success/40 bg-success-soft text-success'
                      : 'border-destructive/40 bg-destructive-soft text-destructive'
                  }`}
                >
                  {plan.isActive ? 'Active' : 'Archived'}
                </span>
              </div>

              <div>
                <H2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                  {plan.name}
                </H2>
                <div className="mt-1 font-mono text-caption text-muted-foreground">
                  <span className="text-lg font-semibold text-foreground">
                    {formatPrice(plan)}
                  </span>
                  <span> / {plan.interval}</span>
                </div>
              </div>

              <div className="pt-3 border-t border-border-soft space-y-2">
                <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground block">
                  Assigned Capabilities
                </span>
                <div className="space-y-1.5 font-sans text-caption text-foreground">
                  {Object.entries(plan.features).map(([fKey, fVal]) => (
                    <div
                      key={fKey}
                      className="flex items-center justify-between gap-2 py-0.5 border-b border-border-soft/40"
                    >
                      <span className="font-mono text-eyebrow text-muted-foreground">
                        {fKey}
                      </span>
                      <span className="font-mono text-eyebrow font-semibold text-foreground">
                        {typeof fVal === 'boolean'
                          ? fVal
                            ? '✓ Yes'
                            : '✕ No'
                          : String(fVal)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-border">
              <Link
                to="/admin/subscriptions/plan/$planId"
                params={{ planId: plan.id }}
                className="block w-full text-center font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-3 border border-border bg-background hover:border-foreground text-foreground transition-colors cursor-pointer"
              >
                Edit Plan &amp; Features
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
