import { create } from "zustand";
import { subscriptionsApi } from "../lib/subscriptions.api";
import type { UserEntitlements } from "../types/subscriptions";

interface EntitlementsState {
  entitlements: UserEntitlements | null;
  activeFeatures: Set<string>;
  isInitialized: boolean;
  isLoading: boolean;

  // 0ms Synchronous Capability Checks
  hasEntitlement: (featureKey: string, minNumericValue?: number) => boolean;
  getFeatureValue: (featureKey: string) => boolean | number | undefined;
  isLosslessEligible: () => boolean;
  canHostJam: () => boolean;

  // Sync & Lifecycle
  initializeEntitlements: () => Promise<void>;
  clearEntitlements: () => void;

  // Mutators with optimistic UI update
  upgradePlan: (planId: string) => Promise<UserEntitlements>;
  cancelSubscription: () => Promise<UserEntitlements>;
}

let initEntitlementsPromise: Promise<void> | null = null;

function buildActiveFeaturesSet(entitlements: UserEntitlements | null): Set<string> {
  const set = new Set<string>();
  if (!entitlements?.features) return set;
  for (const [key, val] of Object.entries(entitlements.features)) {
    if (val === true || (typeof val === "number" && val > 0)) {
      set.add(key);
    }
  }
  return set;
}

export const useEntitlementsStore = create<EntitlementsState>((set, get) => ({
  entitlements: null,
  activeFeatures: new Set<string>(),
  isInitialized: false,
  isLoading: false,

  hasEntitlement: (featureKey: string, minNumericValue?: number) => {
    const { entitlements, activeFeatures } = get();
    if (minNumericValue === undefined) {
      return activeFeatures.has(featureKey);
    }
    const val = entitlements?.features?.[featureKey];
    if (typeof val === "number") {
      return val >= minNumericValue;
    }
    return val === true;
  },

  getFeatureValue: (featureKey: string) => {
    return get().entitlements?.features?.[featureKey];
  },

  isLosslessEligible: () => {
    return get().activeFeatures.has("lossless");
  },

  canHostJam: () => {
    return get().activeFeatures.has("can_host_jam");
  },

  initializeEntitlements: async () => {
    if (initEntitlementsPromise) return initEntitlementsPromise;

    initEntitlementsPromise = (async () => {
      try {
        set({ isLoading: true });
        const res = await subscriptionsApi.getMyEntitlements().catch(() => null);
        if (res) {
          set({
            entitlements: res,
            activeFeatures: buildActiveFeaturesSet(res),
            isInitialized: true,
          });
        }
      } finally {
        set({ isLoading: false });
        initEntitlementsPromise = null;
      }
    })();

    return initEntitlementsPromise;
  },

  clearEntitlements: () => {
    set({
      entitlements: null,
      activeFeatures: new Set<string>(),
      isInitialized: false,
      isLoading: false,
    });
  },

  upgradePlan: async (planId: string) => {
    const prevEntitlements = get().entitlements;
    const prevFeatures = get().activeFeatures;

    // Optimistic tier state
    if (prevEntitlements) {
      const optimistic: UserEntitlements = {
        ...prevEntitlements,
        planId,
        planName: planId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      };
      set({
        entitlements: optimistic,
      });
    }

    try {
      const res = await subscriptionsApi.upgradePlan(planId);
      const nextEntitlements = res.subscription;
      set({
        entitlements: nextEntitlements,
        activeFeatures: buildActiveFeaturesSet(nextEntitlements),
      });
      return nextEntitlements;
    } catch (err) {
      // Rollback
      set({
        entitlements: prevEntitlements,
        activeFeatures: prevFeatures,
      });
      throw err;
    }
  },

  cancelSubscription: async () => {
    const prevEntitlements = get().entitlements;
    const prevFeatures = get().activeFeatures;

    if (prevEntitlements) {
      set({
        entitlements: {
          ...prevEntitlements,
          cancelAtPeriodEnd: true,
        },
      });
    }

    try {
      const res = await subscriptionsApi.cancelSubscription();
      const nextEntitlements = res.subscription;
      set({
        entitlements: nextEntitlements,
        activeFeatures: buildActiveFeaturesSet(nextEntitlements),
      });
      return nextEntitlements;
    } catch (err) {
      set({
        entitlements: prevEntitlements,
        activeFeatures: prevFeatures,
      });
      throw err;
    }
  },
}));
