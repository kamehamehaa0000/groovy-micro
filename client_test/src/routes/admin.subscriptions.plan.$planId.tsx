import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { subscriptionsApi } from '../lib/subscriptions.api'
import { Button } from '../Components/ui/Button'
import { EmptyState, Skeleton } from '../Components/ui/EmptyState'
import { notify } from '../lib/toast'
import { cn } from '../Components/ui/cn'
import type { PlanInterval } from '../types/subscriptions'
import { H2, H3 } from '../Components/ui/typography'

export const Route = createFileRoute('/admin/subscriptions/plan/$planId')({
  component: AdminPlanEditor,
})

const NEW_PLAN = 'new'

/** One column of the feature matrix. */
interface MatrixColumn {
  id: string
  name: string
  /** The column of the plan being edited. */
  editable: boolean
  values: Record<string, boolean | number>
}

function AdminPlanEditor() {
  const { planId } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isNew = planId === NEW_PLAN

  const plansQuery = useQuery({
    queryKey: ['admin', 'plans'],
    queryFn: () => subscriptionsApi.adminListPlans(),
  })
  const featuresQuery = useQuery({
    queryKey: ['admin', 'features'],
    queryFn: () => subscriptionsApi.adminListFeatures(),
  })

  const plans = plansQuery.data?.plans ?? []
  const features = featuresQuery.data?.features ?? []
  const existing = plans.find((plan) => plan.id === planId)

  const [formId, setFormId] = useState('')
  const [formName, setFormName] = useState('')
  const [formPrice, setFormPrice] = useState('0')
  const [formInterval, setFormInterval] = useState<PlanInterval>('month')
  const [formActive, setFormActive] = useState(true)
  const [formFeatures, setFormFeatures] = useState<Record<string, boolean | number>>({})
  const [isSaving, setIsSaving] = useState(false)

  // A new plan starts from the catalog's defaults; an existing plan starts
  // from what it already grants.
  useEffect(() => {
    if (isNew) {
      const defaults: Record<string, boolean | number> = {}
      features.forEach((feature) => {
        defaults[feature.key] = feature.defaultValue
      })
      setFormId('')
      setFormName('')
      setFormPrice('0')
      setFormInterval('month')
      setFormActive(true)
      setFormFeatures(defaults)
      return
    }
    if (!existing) return
    setFormId(existing.id)
    setFormName(existing.name)
    setFormPrice((existing.priceCents / 100).toFixed(2))
    setFormInterval(existing.interval)
    setFormActive(existing.isActive)
    setFormFeatures({ ...existing.features })
  }, [isNew, existing, features])

  // The features, grouped by category, so the matrix reads in sections.
  const grouped = useMemo(() => {
    const groups = new Map<string, typeof features>()
    for (const feature of features) {
      const list = groups.get(feature.category) ?? []
      list.push(feature)
      groups.set(feature.category, list)
    }
    return [...groups.entries()]
  }, [features])

  // The matrix has one column per plan. The plan being edited is the
  // editable one; the others are there for comparison.
  const columns = useMemo(() => {
    const others: MatrixColumn[] = plans
      .filter((plan) => plan.id !== planId)
      .map((plan) => ({
        id: plan.id,
        name: plan.name,
        editable: false,
        values: plan.features,
      }))

    if (isNew) {
      return [
        {
          id: NEW_PLAN,
          name: formName || 'This plan',
          editable: true,
          values: formFeatures,
        },
        ...others,
      ]
    }

    return [
      {
        id: planId,
        name: existing?.name ?? planId,
        editable: true,
        values: formFeatures,
      },
      ...others,
    ]
  }, [plans, planId, isNew, formName, formFeatures, existing])

  if (plansQuery.isLoading || featuresQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!isNew && !existing) {
    return (
      <EmptyState
        title="That plan does not exist"
        description="It may have been removed. Go back to the plans to pick another one."
        action={
          <Link
            to="/admin/subscriptions/plans"
            className="font-eyebrow text-caption uppercase tracking-wider text-primary hover:underline"
          >
            Back to plans
          </Link>
        }
      />
    )
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    const priceCents = Math.round(parseFloat(formPrice || '0') * 100)

    try {
      if (isNew) {
        await subscriptionsApi.adminCreatePlan({
          id: formId.trim(),
          name: formName.trim(),
          priceCents,
          interval: formInterval,
          features: formFeatures,
          isActive: formActive,
        })
        notify.success(`Plan "${formName.trim()}" created.`)
      } else {
        await subscriptionsApi.adminUpdatePlan(planId, {
          name: formName.trim(),
          priceCents,
          interval: formInterval,
          features: formFeatures,
          isActive: formActive,
        })
        notify.success(`Plan "${formName.trim()}" updated.`)
      }
      void queryClient.invalidateQueries({ queryKey: ['admin', 'plans'] })
      navigate({ to: '/admin/subscriptions/plans' })
    } catch (err: any) {
      notify.error(err.message || 'Failed to save the plan')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            to="/admin/subscriptions/plans"
            className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
          >
            &larr; Plans
          </Link>
          <H2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl mt-2">
            {isNew ? 'New subscription plan' : formName || planId}
          </H2>
          <p className="mt-1 font-sans text-caption text-muted-foreground">
            {isNew
              ? 'Name the tier, price it, and grant it the capabilities it should have.'
              : 'Change the tier and its capabilities. Every column is one plan.'}
          </p>
        </div>
      </div>

      {/* The plan itself */}
      <section className="border border-border bg-card p-5 shadow-raised space-y-4">
        <h3 className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground">
          Plan
        </h3>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground block mb-1">
              Plan ID <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              required
              disabled={!isNew}
              value={formId}
              onChange={(e) =>
                setFormId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
              }
              placeholder="e.g. premium_individual"
              className="w-full font-mono text-caption py-2 px-3 border border-border bg-background text-foreground focus:outline-none focus:border-foreground disabled:opacity-60"
            />
          </div>

          <div>
            <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground block mb-1">
              Plan Display Name <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              required
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. Groovy Premium"
              className="w-full text-body py-2 px-3 border border-border bg-background text-foreground focus:outline-none focus:border-foreground font-medium"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground block mb-1">
              Price (USD)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={formPrice}
              onChange={(e) => setFormPrice(e.target.value)}
              className="w-full font-mono text-caption py-2 px-3 border border-border bg-background text-foreground"
            />
          </div>

          <div>
            <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground block mb-1">
              Billing Interval
            </label>
            <select
              value={formInterval}
              onChange={(e) => setFormInterval(e.target.value as PlanInterval)}
              className="w-full font-mono text-caption py-2 px-3 border border-border bg-background text-foreground"
            >
              <option value="month">Monthly</option>
              <option value="year">Yearly</option>
              <option value="lifetime">Lifetime</option>
            </select>
          </div>

          <div>
            <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground block mb-1">
              Availability
            </label>
            <label className="flex items-center gap-2 cursor-pointer font-mono text-caption py-2">
              <input
                type="checkbox"
                checked={formActive}
                onChange={(e) => setFormActive(e.target.checked)}
              />
              <span>{formActive ? 'Offered to listeners' : 'Archived'}</span>
            </label>
          </div>
        </div>
      </section>

      {/* The feature matrix */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <H3 className="text-title font-semibold tracking-tight text-foreground sm:text-lg">
              Feature matrix
            </H3>
            <p className="mt-0.5 font-sans text-caption text-muted-foreground">
              One row per capability, one column per plan. Edit the column of
              the plan you are changing.
            </p>
          </div>
        </div>

        <div className="border border-border bg-card shadow-raised overflow-x-auto">
          <table className="w-full text-left font-sans text-caption">
            <thead>
              <tr className="border-b border-border font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground">
                <th className="sticky left-0 z-10 bg-card py-2.5 pl-5 pr-3">
                  Capability
                </th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3">Default</th>
                {columns.map((column) => (
                  <th
                    key={column.id}
                    className={cn(
                      'px-3 py-2.5',
                      column.editable && 'text-primary',
                    )}
                  >
                    {column.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {grouped.map(([category, list]) => (
                <>
                  <tr key={`group-${category}`} className="bg-muted/40">
                    <td
                      colSpan={3 + plans.length}
                      className="sticky left-0 py-1.5 pl-5 font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground"
                    >
                      {category}
                    </td>
                  </tr>
                  {list.map((feature) => {
                    return (
                      <tr
                        key={feature.key}
                        className="hover:bg-background/40 transition-colors"
                      >
                        <td className="sticky left-0 z-10 bg-card py-3 pl-5 pr-3">
                          <div className="font-medium text-foreground">
                            {feature.name}
                          </div>
                          <div className="font-mono text-eyebrow text-muted-foreground">
                            {feature.key}
                          </div>
                        </td>
                        <td className="py-3 px-3 font-mono text-eyebrow text-muted-foreground">
                          {feature.valueType}
                        </td>
                        <td className="py-3 px-3 font-mono text-foreground">
                          {String(feature.defaultValue)}
                        </td>

                        {columns.map((column) => {
                          const value = column.values[feature.key]

                          if (!column.editable) {
                            return (
                              <td
                                key={column.id}
                                className="px-3 py-3 font-mono text-foreground"
                              >
                                {value === undefined
                                  ? '—'
                                  : typeof value === 'boolean'
                                    ? value
                                      ? '✓ Yes'
                                      : '✕ No'
                                    : String(value)}
                              </td>
                            )
                          }

                          return (
                            <td key={column.id} className="px-3 py-3">
                              {feature.valueType === 'BOOLEAN' ? (
                                <label className="flex items-center gap-2 cursor-pointer font-mono text-caption">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(formFeatures[feature.key])}
                                    onChange={(e) =>
                                      setFormFeatures((prev) => ({
                                        ...prev,
                                        [feature.key]: e.target.checked,
                                      }))
                                    }
                                  />
                                  <span className="sr-only">
                                    {feature.name} for {column.name}
                                  </span>
                                </label>
                              ) : (
                                <input
                                  type="number"
                                  value={Number(
                                    formFeatures[feature.key] ?? feature.defaultValue,
                                  )}
                                  onChange={(e) =>
                                    setFormFeatures((prev) => ({
                                      ...prev,
                                      [feature.key]: Number(e.target.value),
                                    }))
                                  }
                                  className="w-20 py-1 px-2 border border-border bg-background text-foreground text-right font-mono text-caption"
                                />
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </>
              ))}
            </tbody>
          </table>
        </div>

        {grouped.length === 0 ? (
          <EmptyState
            title="No features registered yet"
            description="Register a capability in the feature catalog first."
          />
        ) : null}
      </section>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
        <Link
          to="/admin/subscriptions/plans"
          className="font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-4 border border-border text-muted-foreground hover:text-foreground cursor-pointer"
        >
          Cancel
        </Link>
        <Button type="submit" variant="primary" size="md" disabled={isSaving}>
          {isSaving ? 'Saving...' : isNew ? 'Create plan' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}
