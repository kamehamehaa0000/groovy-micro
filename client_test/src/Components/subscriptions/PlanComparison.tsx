import { useMemo } from 'react'
import type { PlanFeatureDefinition, SubscriptionPlan } from '../../types/subscriptions'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { cn } from '../ui/cn'

export interface PlanComparisonProps {
  open: boolean
  onClose: () => void
  plans: SubscriptionPlan[]
  featureCatalog: PlanFeatureDefinition[]
  /** The plan the user is on. */
  currentPlanId?: string
  isBusy?: boolean
  onSelectPlan: (planId: string) => void
}

/** Features the table always shows, with a readable label. */
const HEADLINE_FEATURES: Array<{
  key: string
  label: string
  format: (value: boolean | number | undefined) => string
}> = [
  {
    key: 'max_bitrate_kbps',
    label: 'Audio quality',
    format: (v) => `${v ?? 128} kbps`,
  },
  {
    key: 'lossless',
    label: 'FLAC lossless audio',
    format: (v) => (v ? 'Included' : '—'),
  },
  {
    key: 'can_host_jam',
    label: 'Host live jams',
    format: (v) => (v ? 'Included' : '—'),
  },
  {
    key: 'max_jam_participants',
    label: 'Jam listeners',
    format: (v) => (v === undefined ? '—' : `${v}`),
  },
  {
    key: 'ad_free',
    label: 'Ad-free playback',
    format: (v) => (v ? 'Included' : 'Sponsored audio'),
  },
]

function formatPrice(plan: SubscriptionPlan): string {
  return (plan.priceCents / 100).toLocaleString(undefined, {
    style: 'currency',
    currency: plan.currency || 'USD',
  })
}

/**
 * The plan picker, as a comparison table.
 *
 * It used to be three pricing cards, each repeating the same feature list,
 * so you had to read three columns side by side to find the difference. A
 * table puts one feature on a row and one plan on a column, which is what
 * you actually do when you compare.
 */
export function PlanComparison({
  open,
  onClose,
  plans,
  featureCatalog,
  currentPlanId,
  isBusy = false,
  onSelectPlan,
}: PlanComparisonProps) {
  // The rows: the headline features first, then everything else the catalog
  // knows about, in catalog order.
  const rows = useMemo(() => {
    const extra = featureCatalog
      .filter((feature) => feature.isActive)
      .filter(
        (feature) =>
          !HEADLINE_FEATURES.some((headline) => headline.key === feature.key),
      )
      .map((feature) => ({
        key: feature.key,
        label: feature.name,
        format: (value: boolean | number | undefined) => {
          if (value === undefined) return '—'
          if (typeof value === 'boolean') return value ? 'Included' : '—'
          return String(value)
        },
      }))
    return [...HEADLINE_FEATURES, ...extra]
  }, [featureCatalog])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Choose your plan"
      description="Every tier, every feature, side by side."
      size="lg"
    >
      {plans.length === 0 ? (
        <div className="space-y-3">
          <div className="h-10 rounded-control bg-secondary/30" />
          <div className="h-32 rounded-control bg-secondary/30" />
        </div>
      ) : (
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[36rem] border-collapse text-left">
            <thead>
              <tr>
                <th scope="col" className="w-40 py-2 pr-4 align-bottom">
                  <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-muted-foreground">
                    Feature
                  </span>
                </th>
                {plans.map((plan) => {
                  const isCurrent = plan.id === currentPlanId
                  return (
                    <th
                      key={plan.id}
                      scope="col"
                      className={cn(
                        'min-w-[9rem] px-3 py-2 align-bottom',
                        isCurrent && 'bg-foreground/5',
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-serif text-title text-foreground">
                          {plan.name}
                        </span>
                        {isCurrent ? (
                          <span className="rounded-full border border-success/40 bg-success-soft px-2 py-0.5 font-eyebrow text-eyebrow uppercase tracking-wider text-success">
                            Current
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 font-mono text-caption text-muted-foreground">
                        <span className="text-body font-bold text-foreground">
                          {formatPrice(plan)}
                        </span>
                        <span> / {plan.interval}</span>
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-t border-border-soft">
                  <th
                    scope="row"
                    className="py-2.5 pr-4 align-middle font-sans text-caption font-normal text-muted-foreground"
                  >
                    {row.label}
                  </th>
                  {plans.map((plan) => {
                    const value = plan.features[row.key]
                    const included =
                      value === true || (typeof value === 'number' && value > 0)
                    return (
                      <td
                        key={plan.id}
                        className={cn(
                          'px-3 py-2.5 align-middle font-mono text-caption',
                          plan.id === currentPlanId && 'bg-foreground/5',
                        )}
                      >
                        <span
                          className={cn(
                            included
                              ? 'text-foreground'
                              : 'text-muted-foreground/50',
                          )}
                        >
                          {row.format(value)}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))}
              <tr className="border-t border-border">
                <td className="py-4" />
                {plans.map((plan) => {
                  const isCurrent = plan.id === currentPlanId
                  return (
                    <td
                      key={plan.id}
                      className={cn(
                        'px-3 py-4',
                        isCurrent && 'bg-foreground/5',
                      )}
                    >
                      <Button
                        variant={isCurrent ? 'outline' : 'primary'}
                        size="sm"
                        block
                        disabled={isCurrent || isBusy}
                        onClick={() => onSelectPlan(plan.id)}
                      >
                        {isCurrent
                          ? 'Active tier'
                          : plan.priceCents === 0
                            ? 'Switch to free'
                            : `Upgrade to ${plan.name}`}
                      </Button>
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}
