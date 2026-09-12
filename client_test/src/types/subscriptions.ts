export type FeatureValueType = "BOOLEAN" | "NUMERIC";
export type PlanInterval = "month" | "year" | "lifetime";

export interface PlanFeatureDefinition {
  key: string;
  name: string;
  description: string | null;
  valueType: FeatureValueType;
  defaultValue: boolean | number;
  category: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  priceCents: number;
  currency: string;
  interval: PlanInterval;
  features: Record<string, boolean | number>;
  isActive: boolean;
}

export interface UserEntitlements {
  planId: string;
  planName: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  features: Record<string, boolean | number>;
}

export interface CreateFeatureInput {
  key: string;
  name: string;
  description?: string;
  valueType: FeatureValueType;
  defaultValue: boolean | number;
  category?: string;
}

export interface UpdateFeatureInput {
  name?: string;
  description?: string | null;
  defaultValue?: boolean | number;
  category?: string;
  isActive?: boolean;
}

export interface CreatePlanInput {
  id: string;
  name: string;
  priceCents: number;
  currency?: string;
  interval?: PlanInterval;
  features: Record<string, boolean | number>;
  isActive?: boolean;
}

export interface UpdatePlanInput {
  name?: string;
  priceCents?: number;
  currency?: string;
  interval?: PlanInterval;
  features?: Record<string, boolean | number>;
  isActive?: boolean;
}
