import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useAuthStore } from '../stores/auth.store'
import { subscriptionsApi } from '../lib/subscriptions.api'
import type {
  SubscriptionPlan,
  PlanFeatureDefinition,
  FeatureValueType,
} from '../types/subscriptions'

export const Route = createFileRoute('/admin/subscriptions')({
  component: AdminSubscriptionsDeskComponent,
})

function AdminSubscriptionsDeskComponent() {
  const navigate = useNavigate()
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthStore()

  const [activeTab, setActiveTab] = useState<'plans' | 'features'>('plans')
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [features, setFeatures] = useState<PlanFeatureDefinition[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [actionNotice, setActionNotice] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  // --- Create Feature Modal State ---
  const [isCreateFeatureOpen, setIsCreateFeatureOpen] = useState(false)
  const [newFeatureKey, setNewFeatureKey] = useState('')
  const [newFeatureName, setNewFeatureName] = useState('')
  const [newFeatureDesc, setNewFeatureDesc] = useState('')
  const [newFeatureType, setNewFeatureType] = useState<FeatureValueType>('BOOLEAN')
  const [newFeatureDefaultBool, setNewFeatureDefaultBool] = useState(false)
  const [newFeatureDefaultNum, setNewFeatureDefaultNum] = useState(0)
  const [newFeatureCategory, setNewFeatureCategory] = useState('general')
  const [isSubmittingFeature, setIsSubmittingFeature] = useState(false)

  // --- Create/Edit Plan Modal State ---
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false)
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null)
  const [planFormId, setPlanFormId] = useState('')
  const [planFormName, setPlanFormName] = useState('')
  const [planFormPrice, setPlanFormPrice] = useState('0')
  const [planFormInterval, setPlanFormInterval] = useState<'month' | 'year' | 'lifetime'>('month')
  const [planFormFeatures, setPlanFormFeatures] = useState<Record<string, boolean | number>>({})
  const [planFormActive, setPlanFormActive] = useState(true)
  const [isSubmittingPlan, setIsSubmittingPlan] = useState(false)

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      navigate({ to: '/login' })
    }
  }, [isAuthLoading, isAuthenticated, navigate])

  const loadData = async () => {
    setIsLoading(true)
    setActionNotice(null)
    try {
      const [plansRes, featuresRes] = await Promise.all([
        subscriptionsApi.adminListPlans(),
        subscriptionsApi.adminListFeatures(),
      ])
      setPlans(plansRes.plans)
      setFeatures(featuresRes.features)
    } catch (err: any) {
      setActionNotice({
        type: 'error',
        text: err.message || 'Failed to retrieve administrative records',
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      loadData()
    }
  }, [user])

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
          Access to subscription plans and dynamic feature catalog requires
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

  // --- Handlers: Feature Management ---
  const handleCreateFeature = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmittingFeature(true)
    setActionNotice(null)

    const defaultValue =
      newFeatureType === 'BOOLEAN'
        ? newFeatureDefaultBool
        : Number(newFeatureDefaultNum)

    try {
      await subscriptionsApi.adminCreateFeature({
        key: newFeatureKey.trim(),
        name: newFeatureName.trim(),
        description: newFeatureDesc.trim() || undefined,
        valueType: newFeatureType,
        defaultValue,
        category: newFeatureCategory.trim() || 'general',
      })

      setActionNotice({
        type: 'success',
        text: `Dynamic feature '${newFeatureKey.trim()}' successfully registered!`,
      })
      setIsCreateFeatureOpen(false)
      setNewFeatureKey('')
      setNewFeatureName('')
      setNewFeatureDesc('')
      await loadData()
    } catch (err: any) {
      setActionNotice({
        type: 'error',
        text: err.message || 'Failed to register feature',
      })
    } finally {
      setIsSubmittingFeature(false)
    }
  }

  const handleToggleFeatureActive = async (feat: PlanFeatureDefinition) => {
    try {
      await subscriptionsApi.adminUpdateFeature(feat.key, {
        isActive: !feat.isActive,
      })
      setActionNotice({
        type: 'success',
        text: `Feature '${feat.key}' ${!feat.isActive ? 'activated' : 'deactivated'}.`,
      })
      await loadData()
    } catch (err: any) {
      setActionNotice({
        type: 'error',
        text: err.message || 'Failed to toggle feature status',
      })
    }
  }

  // --- Handlers: Plan Management ---
  const handleOpenCreatePlan = () => {
    setEditingPlanId(null)
    setPlanFormId('')
    setPlanFormName('')
    setPlanFormPrice('0')
    setPlanFormInterval('month')
    setPlanFormActive(true)

    // Prepopulate with feature defaults from catalog
    const initialFeatures: Record<string, boolean | number> = {}
    features.forEach((f) => {
      initialFeatures[f.key] = f.defaultValue
    })
    setPlanFormFeatures(initialFeatures)
    setIsPlanModalOpen(true)
  }

  const handleOpenEditPlan = (plan: SubscriptionPlan) => {
    setEditingPlanId(plan.id)
    setPlanFormId(plan.id)
    setPlanFormName(plan.name)
    setPlanFormPrice((plan.priceCents / 100).toFixed(2))
    setPlanFormInterval(plan.interval)
    setPlanFormActive(plan.isActive)
    setPlanFormFeatures({ ...plan.features })
    setIsPlanModalOpen(true)
  }

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmittingPlan(true)
    setActionNotice(null)

    const priceCents = Math.round(parseFloat(planFormPrice || '0') * 100)

    try {
      if (editingPlanId) {
        await subscriptionsApi.adminUpdatePlan(editingPlanId, {
          name: planFormName.trim(),
          priceCents,
          interval: planFormInterval,
          features: planFormFeatures,
          isActive: planFormActive,
        })
        setActionNotice({
          type: 'success',
          text: `Subscription plan '${planFormName}' updated successfully.`,
        })
      } else {
        await subscriptionsApi.adminCreatePlan({
          id: planFormId.trim(),
          name: planFormName.trim(),
          priceCents,
          interval: planFormInterval,
          features: planFormFeatures,
          isActive: planFormActive,
        })
        setActionNotice({
          type: 'success',
          text: `Subscription plan '${planFormName}' created successfully.`,
        })
      }
      setIsPlanModalOpen(false)
      await loadData()
    } catch (err: any) {
      setActionNotice({
        type: 'error',
        text: err.message || 'Failed to save subscription plan',
      })
    } finally {
      setIsSubmittingPlan(false)
    }
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
              Subscriptions &amp; Feature Catalog
            </h1>
            <p className="font-sans text-xs text-ink-soft mt-1">
              Configure subscription tiers, manage pricing, and define dynamic
              perks and capabilities for the entitlement engine.
            </p>
          </div>

          <Link
            to="/admin/verification"
            className="font-mono text-[10px] uppercase tracking-[0.14em] py-2 px-3 border border-line bg-panel text-ink hover:bg-canvas transition-colors hidden sm:inline-block"
          >
            Artist Verifications &rarr;
          </Link>
        </div>

        {/* Global Action Alert */}
        {actionNotice && (
          <div
            className={`mt-4 p-3 border font-mono text-xs ${
              actionNotice.type === 'success'
                ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-200'
                : 'border-red-300 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300'
            }`}
          >
            {actionNotice.text}
          </div>
        )}

        {/* Admin Desk Navigation Tabs */}
        <div className="mt-8 flex items-center justify-between border-b border-line pb-0 flex-wrap gap-4">
          <div className="flex items-center gap-6 font-mono text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('plans')}
              className={`pb-3 border-b-2 font-medium tracking-wider uppercase transition-colors cursor-pointer ${
                activeTab === 'plans'
                  ? 'border-ink text-ink font-semibold'
                  : 'border-transparent text-ink-soft hover:text-ink'
              }`}
            >
              Subscription Plans ({plans.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('features')}
              className={`pb-3 border-b-2 font-medium tracking-wider uppercase transition-colors cursor-pointer ${
                activeTab === 'features'
                  ? 'border-ink text-ink font-semibold'
                  : 'border-transparent text-ink-soft hover:text-ink'
              }`}
            >
              Feature Catalog &amp; Perks ({features.length})
            </button>
          </div>

          <div className="pb-2">
            {activeTab === 'plans' ? (
              <button
                type="button"
                onClick={handleOpenCreatePlan}
                className="font-mono text-[10.5px] uppercase tracking-[0.14em] py-2 px-4 bg-ink text-canvas hover:opacity-90 transition-opacity cursor-pointer font-semibold"
              >
                + New Subscription Plan
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsCreateFeatureOpen(true)}
                className="font-mono text-[10.5px] uppercase tracking-[0.14em] py-2 px-4 bg-ink text-canvas hover:opacity-90 transition-opacity cursor-pointer font-semibold"
              >
                + Register New Feature
              </button>
            )}
          </div>
        </div>
      </div>

      {/* TAB CONTENT: PLANS */}
      {activeTab === 'plans' && (
        <div className="space-y-6">
          {isLoading ? (
            <div className="py-20 text-center font-mono text-xs text-ink-soft animate-pulse">
              Loading active subscription tiers...
            </div>
          ) : plans.length === 0 ? (
            <div className="p-12 border border-dashed border-line bg-panel text-center">
              <p className="font-serif italic text-lg text-ink">
                No subscription plans configured yet
              </p>
              <button
                type="button"
                onClick={handleOpenCreatePlan}
                className="mt-3 font-mono text-xs uppercase tracking-wider text-blue hover:underline"
              >
                Create your first plan
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {plans.map((plan) => (
                <div
                  key={plan.id}
                  className="border border-line bg-panel p-6 shadow-2xs flex flex-col justify-between space-y-6"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[9px] uppercase tracking-wider px-2 py-0.5 border border-line bg-canvas text-blue font-semibold">
                        {plan.id}
                      </span>
                      <span
                        className={`font-mono text-[8.5px] uppercase tracking-wider px-1.5 py-0.5 border ${
                          plan.isActive
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300'
                        }`}
                      >
                        {plan.isActive ? 'Active' : 'Archived'}
                      </span>
                    </div>

                    <div>
                      <h3 className="font-serif italic text-2xl text-ink font-medium">
                        {plan.name}
                      </h3>
                      <div className="mt-1 font-mono text-xs text-ink-soft">
                        <span className="text-lg font-semibold text-ink">
                          {(plan.priceCents / 100).toLocaleString(undefined, {
                            style: 'currency',
                            currency: plan.currency || 'USD',
                          })}
                        </span>
                        <span> / {plan.interval}</span>
                      </div>
                    </div>

                    {/* Feature Matrix Breakdown */}
                    <div className="pt-3 border-t border-line-soft space-y-2">
                      <span className="font-mono text-[9px] uppercase tracking-wider text-ink-soft block">
                        Assigned Capabilities
                      </span>
                      <div className="space-y-1.5 font-sans text-xs text-ink">
                        {Object.entries(plan.features).map(([fKey, fVal]) => (
                          <div
                            key={fKey}
                            className="flex items-center justify-between gap-2 py-0.5 border-b border-line-soft/40"
                          >
                            <span className="font-mono text-[10.5px] text-ink-soft">
                              {fKey}
                            </span>
                            <span className="font-mono text-[10.5px] font-semibold text-ink">
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

                  <div className="pt-4 border-t border-line">
                    <button
                      type="button"
                      onClick={() => handleOpenEditPlan(plan)}
                      className="w-full font-mono text-[10.5px] uppercase tracking-[0.14em] py-2 px-3 border border-line bg-canvas hover:border-ink text-ink transition-colors cursor-pointer text-center"
                    >
                      Edit Plan &amp; Features
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: FEATURE CATALOG */}
      {activeTab === 'features' && (
        <div className="space-y-6">
          <div className="border border-line bg-panel p-5 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="font-serif italic text-xl text-ink">
                  Dynamic Feature Catalog
                </h3>
                <p className="font-sans text-xs text-ink-soft mt-0.5">
                  Registered features can be dynamically assigned to plans and
                  are checked at runtime by the Entitlement Guard.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left font-sans text-xs">
                <thead>
                  <tr className="border-b border-line font-mono text-[9.5px] uppercase tracking-wider text-ink-soft">
                    <th className="py-2.5 px-3">Feature Key</th>
                    <th className="py-2.5 px-3">Display Name</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Default Fallback</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {features.map((feat) => (
                    <tr key={feat.key} className="hover:bg-canvas/40 transition-colors">
                      <td className="py-3 px-3 font-mono font-medium text-ink">
                        {feat.key}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-medium text-ink">{feat.name}</div>
                        {feat.description && (
                          <div className="text-[11px] text-ink-soft line-clamp-1">
                            {feat.description}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-mono text-[9px] uppercase px-1.5 py-0.5 border border-line bg-canvas">
                          {feat.valueType}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-ink">
                        {String(feat.defaultValue)}
                      </td>
                      <td className="py-3 px-3 font-mono text-ink-soft">
                        {feat.category}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`font-mono text-[8.5px] uppercase tracking-wider px-1.5 py-0.5 border ${
                            feat.isActive
                              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                              : 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300'
                          }`}
                        >
                          {feat.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleToggleFeatureActive(feat)}
                          className="font-mono text-[9.5px] uppercase tracking-wider py-1 px-2.5 border border-line text-ink-soft hover:text-ink cursor-pointer"
                        >
                          {feat.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* CREATE FEATURE MODAL */}
      {isCreateFeatureOpen && (
        <div className="fixed inset-0 bg-ink/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="max-w-lg w-full bg-panel border-2 border-line shadow-2xl p-6 sm:p-7 space-y-5 my-auto">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-soft block">
                  Catalog Registry
                </span>
                <h3 className="font-serif italic text-2xl text-ink">
                  Register New Dynamic Feature
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateFeatureOpen(false)}
                className="font-mono text-xs text-ink-soft hover:text-ink cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            <form onSubmit={handleCreateFeature} className="space-y-4">
              <div>
                <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block mb-1">
                  Feature Key <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newFeatureKey}
                  onChange={(e) => setNewFeatureKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  placeholder="e.g. stems_download, spatial_audio"
                  className="w-full font-mono text-xs py-2 px-3 border border-line bg-canvas text-ink focus:outline-none focus:border-ink"
                />
                <p className="font-mono text-[9px] text-ink-soft mt-1">
                  Unique programmatic identifier checked by requireEntitlement(key).
                </p>
              </div>

              <div>
                <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block mb-1">
                  Display Label <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newFeatureName}
                  onChange={(e) => setNewFeatureName(e.target.value)}
                  placeholder="e.g. Stems & Acapella Isolation"
                  className="w-full font-serif italic text-sm py-2 px-3 border border-line bg-canvas text-ink focus:outline-none focus:border-ink"
                />
              </div>

              <div>
                <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block mb-1">
                  Description / Marketing Copy
                </label>
                <textarea
                  rows={2}
                  value={newFeatureDesc}
                  onChange={(e) => setNewFeatureDesc(e.target.value)}
                  placeholder="Explains what this perk allows for listeners or artists..."
                  className="w-full font-sans text-xs py-2 px-3 border border-line bg-canvas text-ink focus:outline-none focus:border-ink resize-y"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block mb-1">
                    Value Type
                  </label>
                  <select
                    value={newFeatureType}
                    onChange={(e) => setNewFeatureType(e.target.value as FeatureValueType)}
                    className="w-full font-mono text-xs py-2 px-3 border border-line bg-canvas text-ink"
                  >
                    <option value="BOOLEAN">Boolean (Yes / No)</option>
                    <option value="NUMERIC">Numeric (Limit / Count)</option>
                  </select>
                </div>

                <div>
                  <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block mb-1">
                    Category
                  </label>
                  <input
                    type="text"
                    value={newFeatureCategory}
                    onChange={(e) => setNewFeatureCategory(e.target.value)}
                    placeholder="e.g. streaming, jam, audio"
                    className="w-full font-mono text-xs py-2 px-3 border border-line bg-canvas text-ink"
                  />
                </div>
              </div>

              <div>
                <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block mb-1">
                  Default Value (Fallback for Unassigned Plans)
                </label>
                {newFeatureType === 'BOOLEAN' ? (
                  <label className="flex items-center gap-2 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={newFeatureDefaultBool}
                      onChange={(e) => setNewFeatureDefaultBool(e.target.checked)}
                    />
                    <span className="font-mono text-xs text-ink">
                      {newFeatureDefaultBool ? 'Default: Enabled (true)' : 'Default: Disabled (false)'}
                    </span>
                  </label>
                ) : (
                  <input
                    type="number"
                    value={newFeatureDefaultNum}
                    onChange={(e) => setNewFeatureDefaultNum(Number(e.target.value))}
                    className="w-full font-mono text-xs py-2 px-3 border border-line bg-canvas text-ink"
                  />
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-line">
                <button
                  type="button"
                  onClick={() => setIsCreateFeatureOpen(false)}
                  className="font-mono text-[10.5px] uppercase tracking-[0.14em] py-2 px-4 border border-line text-ink-soft hover:text-ink cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingFeature}
                  className="font-mono text-[10.5px] uppercase tracking-[0.14em] py-2 px-5 bg-ink text-canvas hover:opacity-90 transition-opacity cursor-pointer font-semibold disabled:opacity-50"
                >
                  {isSubmittingFeature ? 'Registering...' : '✦ Register Feature'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE / EDIT PLAN MODAL */}
      {isPlanModalOpen && (
        <div className="fixed inset-0 bg-ink/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="max-w-2xl w-full bg-panel border-2 border-line shadow-2xl p-6 sm:p-7 space-y-5 my-auto max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-soft block">
                  Plan Configuration
                </span>
                <h3 className="font-serif italic text-2xl text-ink">
                  {editingPlanId ? `Edit Plan: ${planFormName}` : 'Create Subscription Plan'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsPlanModalOpen(false)}
                className="font-mono text-xs text-ink-soft hover:text-ink cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            <form onSubmit={handleSavePlan} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block mb-1">
                    Plan ID <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!!editingPlanId}
                    value={planFormId}
                    onChange={(e) => setPlanFormId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="e.g. premium_individual"
                    className="w-full font-mono text-xs py-2 px-3 border border-line bg-canvas text-ink focus:outline-none focus:border-ink disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block mb-1">
                    Plan Display Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={planFormName}
                    onChange={(e) => setPlanFormName(e.target.value)}
                    placeholder="e.g. Groovy Premium"
                    className="w-full font-serif italic text-sm py-2 px-3 border border-line bg-canvas text-ink focus:outline-none focus:border-ink"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block mb-1">
                    Price (USD)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={planFormPrice}
                    onChange={(e) => setPlanFormPrice(e.target.value)}
                    className="w-full font-mono text-xs py-2 px-3 border border-line bg-canvas text-ink"
                  />
                </div>

                <div>
                  <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block mb-1">
                    Billing Interval
                  </label>
                  <select
                    value={planFormInterval}
                    onChange={(e) => setPlanFormInterval(e.target.value as any)}
                    className="w-full font-mono text-xs py-2 px-3 border border-line bg-canvas text-ink"
                  >
                    <option value="month">Monthly</option>
                    <option value="year">Yearly</option>
                    <option value="lifetime">Lifetime</option>
                  </select>
                </div>
              </div>

              {/* Dynamic Feature Assignment Checkboxes */}
              <div className="pt-3 border-t border-line-soft space-y-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink block">
                  Assign Dynamic Feature Entitlements
                </span>
                <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                  {features.map((feat) => (
                    <div
                      key={feat.key}
                      className="p-3 border border-line bg-canvas flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div>
                        <div className="font-serif italic text-sm text-ink">
                          {feat.name}
                        </div>
                        <div className="font-mono text-[9px] text-ink-soft">
                          key: {feat.key} &bull; category: {feat.category}
                        </div>
                      </div>

                      <div className="shrink-0">
                        {feat.valueType === 'BOOLEAN' ? (
                          <label className="flex items-center gap-2 cursor-pointer font-mono text-xs">
                            <input
                              type="checkbox"
                              checked={Boolean(planFormFeatures[feat.key])}
                              onChange={(e) =>
                                setPlanFormFeatures({
                                  ...planFormFeatures,
                                  [feat.key]: e.target.checked,
                                })
                              }
                            />
                            <span>{planFormFeatures[feat.key] ? 'Enabled' : 'Disabled'}</span>
                          </label>
                        ) : (
                          <div className="flex items-center gap-1.5 font-mono text-xs">
                            <span className="text-ink-soft text-[10px]">Limit:</span>
                            <input
                              type="number"
                              value={Number(planFormFeatures[feat.key] ?? feat.defaultValue)}
                              onChange={(e) =>
                                setPlanFormFeatures({
                                  ...planFormFeatures,
                                  [feat.key]: Number(e.target.value),
                                })
                              }
                              className="w-20 py-1 px-2 border border-line bg-panel text-ink text-right"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-line">
                <button
                  type="button"
                  onClick={() => setIsPlanModalOpen(false)}
                  className="font-mono text-[10.5px] uppercase tracking-[0.14em] py-2 px-4 border border-line text-ink-soft hover:text-ink cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPlan}
                  className="font-mono text-[10.5px] uppercase tracking-[0.14em] py-2 px-5 bg-ink text-canvas hover:opacity-90 transition-opacity cursor-pointer font-semibold disabled:opacity-50"
                >
                  {isSubmittingPlan ? 'Saving Plan...' : '✦ Save Plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
