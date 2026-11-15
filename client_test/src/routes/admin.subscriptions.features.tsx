import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { subscriptionsApi } from '../lib/subscriptions.api'
import { EmptyState } from '../Components/ui/EmptyState'
import { Modal } from '../Components/ui/Modal'
import { Button } from '../Components/ui/Button'
import { notify } from '../lib/toast'
import type { FeatureValueType, PlanFeatureDefinition } from '../types/subscriptions'

export const Route = createFileRoute('/admin/subscriptions/features')({
  component: AdminFeaturesDesk,
})

function AdminFeaturesDesk() {
  const queryClient = useQueryClient()
  const featuresQuery = useQuery({
    queryKey: ['admin', 'features'],
    queryFn: () => subscriptionsApi.adminListFeatures(),
  })

  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [key, setKey] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [valueType, setValueType] = useState<FeatureValueType>('BOOLEAN')
  const [defaultBool, setDefaultBool] = useState(false)
  const [defaultNumber, setDefaultNumber] = useState(0)
  const [category, setCategory] = useState('general')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const features = featuresQuery.data?.features ?? []

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'features'] })
    void queryClient.invalidateQueries({ queryKey: ['admin', 'plans'] })
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      await subscriptionsApi.adminCreateFeature({
        key: key.trim(),
        name: name.trim(),
        description: description.trim() || undefined,
        valueType,
        defaultValue: valueType === 'BOOLEAN' ? defaultBool : Number(defaultNumber),
        category: category.trim() || 'general',
      })
      notify.success(`Feature "${key.trim()}" registered.`)
      setIsCreateOpen(false)
      setKey('')
      setName('')
      setDescription('')
      invalidate()
    } catch (err: any) {
      notify.error(err.message || 'Failed to register feature')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleToggle = async (feature: PlanFeatureDefinition) => {
    try {
      await subscriptionsApi.adminUpdateFeature(feature.key, {
        isActive: !feature.isActive,
      })
      notify.success(
        `Feature "${feature.key}" ${!feature.isActive ? 'activated' : 'deactivated'}.`,
      )
      invalidate()
    } catch (err: any) {
      notify.error(err.message || 'Failed to toggle feature status')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-sans text-caption text-muted-foreground">
          Registered features are assigned to plans and checked at runtime by
          the entitlement guard.
        </p>
        <Button variant="primary" size="md" onClick={() => setIsCreateOpen(true)}>
          + Register New Feature
        </Button>
      </div>

      {featuresQuery.isLoading ? (
        <div className="h-48 animate-pulse rounded-control bg-secondary/30" />
      ) : featuresQuery.isError ? (
        <EmptyState
          title="Could not load the feature catalog"
          description={
            featuresQuery.error instanceof Error
              ? featuresQuery.error.message
              : 'The request could not be completed.'
          }
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => void featuresQuery.refetch()}
            >
              Try again
            </Button>
          }
        />
      ) : features.length === 0 ? (
        <EmptyState
          title="No features registered yet"
          description="Register the first capability so plans can grant it."
        />
      ) : (
        <div className="border border-border bg-card p-5 shadow-raised overflow-x-auto">
          <table className="w-full text-left font-sans text-caption">
            <thead>
              <tr className="border-b border-border font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground">
                <th className="py-2.5 px-3">Feature Key</th>
                <th className="py-2.5 px-3">Display Name</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3">Default Fallback</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {features.map((feat) => (
                <tr key={feat.key} className="hover:bg-background/40 transition-colors">
                  <td className="py-3 px-3 font-mono font-medium text-foreground">
                    {feat.key}
                  </td>
                  <td className="py-3 px-3">
                    <div className="font-medium text-foreground">{feat.name}</div>
                    {feat.description && (
                      <div className="text-eyebrow text-muted-foreground line-clamp-1">
                        {feat.description}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    <span className="font-eyebrow text-eyebrow uppercase tracking-wider px-1.5 py-0.5 border border-border bg-background">
                      {feat.valueType}
                    </span>
                  </td>
                  <td className="py-3 px-3 font-mono text-foreground">
                    {String(feat.defaultValue)}
                  </td>
                  <td className="py-3 px-3 font-mono text-muted-foreground">
                    {feat.category}
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className={`font-eyebrow text-eyebrow uppercase tracking-wider px-1.5 py-0.5 border ${
                        feat.isActive
                          ? 'border-success/40 bg-success-soft text-success'
                          : 'border-destructive/40 bg-destructive-soft text-destructive'
                      }`}
                    >
                      {feat.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => void handleToggle(feat)}
                      className="cursor-pointer border border-border px-2.5 py-1 font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {feat.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Register a new feature"
        description="A feature is a capability the entitlement guard checks at runtime."
        size="md"
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsCreateOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                const form = document.getElementById('create-feature-form')
                if (form instanceof HTMLFormElement) form.requestSubmit()
              }}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Registering...' : 'Register feature'}
            </Button>
          </>
        }
      >
        <form id="create-feature-form" onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground block mb-1">
              Feature Key <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              required
              value={key}
              onChange={(e) =>
                setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
              }
              placeholder="e.g. stems_download, spatial_audio"
              className="w-full font-mono text-caption py-2 px-3 border border-border bg-background text-foreground focus:outline-none focus:border-foreground"
            />
            <p className="font-mono text-eyebrow text-muted-foreground mt-1">
              The programmatic identifier checked by requireEntitlement(key).
            </p>
          </div>

          <div>
            <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground block mb-1">
              Display Label <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Stems & Acapella Isolation"
              className="w-full text-body py-2 px-3 border border-border bg-background text-foreground focus:outline-none focus:border-foreground font-medium"
            />
          </div>

          <div>
            <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground block mb-1">
              Description / Marketing Copy
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explains what this perk allows for listeners or artists..."
              className="w-full font-sans text-caption py-2 px-3 border border-border bg-background text-foreground focus:outline-none focus:border-foreground resize-y"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground block mb-1">
                Value Type
              </label>
              <select
                value={valueType}
                onChange={(e) => setValueType(e.target.value as FeatureValueType)}
                className="w-full font-mono text-caption py-2 px-3 border border-border bg-background text-foreground"
              >
                <option value="BOOLEAN">Boolean (Yes / No)</option>
                <option value="NUMERIC">Numeric (Limit / Count)</option>
              </select>
            </div>

            <div>
              <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground block mb-1">
                Default Fallback
              </label>
              {valueType === 'BOOLEAN' ? (
                <label className="flex items-center gap-2 cursor-pointer font-mono text-caption py-2">
                  <input
                    type="checkbox"
                    checked={defaultBool}
                    onChange={(e) => setDefaultBool(e.target.checked)}
                  />
                  <span>{defaultBool ? 'Enabled' : 'Disabled'}</span>
                </label>
              ) : (
                <input
                  type="number"
                  value={defaultNumber}
                  onChange={(e) => setDefaultNumber(Number(e.target.value))}
                  className="w-full font-mono text-caption py-2 px-3 border border-border bg-background text-foreground"
                />
              )}
            </div>
          </div>

          <div>
            <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground block mb-1">
              Category
            </label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. streaming, jam, audio"
              className="w-full font-mono text-caption py-2 px-3 border border-border bg-background text-foreground focus:outline-none focus:border-foreground"
            />
          </div>
        </form>
      </Modal>
    </div>
  )
}
