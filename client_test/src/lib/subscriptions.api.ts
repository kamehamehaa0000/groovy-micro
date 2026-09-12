import { api } from "./api";
import type {
  SubscriptionPlan,
  PlanFeatureDefinition,
  UserEntitlements,
  CreatePlanInput,
  UpdatePlanInput,
  CreateFeatureInput,
  UpdateFeatureInput,
} from "../types/subscriptions";

export const subscriptionsApi = {
  // Public & Listener Endpoints
  async getPlans(): Promise<{ plans: SubscriptionPlan[] }> {
    return api.get<{ plans: SubscriptionPlan[] }>("/api/v1/subscriptions/plans");
  },

  async getFeatures(): Promise<{ features: PlanFeatureDefinition[] }> {
    return api.get<{ features: PlanFeatureDefinition[] }>("/api/v1/subscriptions/features");
  },

  async getMyEntitlements(): Promise<UserEntitlements> {
    return api.get<UserEntitlements>("/api/v1/subscriptions/me");
  },

  async upgradePlan(planId: string): Promise<{ message: string; subscription: UserEntitlements }> {
    return api.post<{ message: string; subscription: UserEntitlements }>(
      "/api/v1/subscriptions/upgrade",
      { planId }
    );
  },

  async cancelSubscription(): Promise<{ message: string; subscription: UserEntitlements }> {
    return api.post<{ message: string; subscription: UserEntitlements }>(
      "/api/v1/subscriptions/cancel"
    );
  },

  // Admin Desk Endpoints
  async adminListPlans(): Promise<{ plans: SubscriptionPlan[] }> {
    return api.get<{ plans: SubscriptionPlan[] }>("/api/v1/admin/subscriptions/plans");
  },

  async adminCreatePlan(input: CreatePlanInput): Promise<{ plan: SubscriptionPlan }> {
    return api.post<{ plan: SubscriptionPlan }>("/api/v1/admin/subscriptions/plans", input);
  },

  async adminUpdatePlan(id: string, input: UpdatePlanInput): Promise<{ plan: SubscriptionPlan }> {
    return api.patch<{ plan: SubscriptionPlan }>(`/api/v1/admin/subscriptions/plans/${id}`, input);
  },

  async adminListFeatures(): Promise<{ features: PlanFeatureDefinition[] }> {
    return api.get<{ features: PlanFeatureDefinition[] }>("/api/v1/admin/subscriptions/features");
  },

  async adminCreateFeature(input: CreateFeatureInput): Promise<{ feature: PlanFeatureDefinition }> {
    return api.post<{ feature: PlanFeatureDefinition }>("/api/v1/admin/subscriptions/features", input);
  },

  async adminUpdateFeature(key: string, input: UpdateFeatureInput): Promise<{ feature: PlanFeatureDefinition }> {
    return api.patch<{ feature: PlanFeatureDefinition }>(`/api/v1/admin/subscriptions/features/${key}`, input);
  },

  async adminDeleteFeature(key: string): Promise<{ success: boolean; message: string }> {
    return api.delete<{ success: boolean; message: string }>(`/api/v1/admin/subscriptions/features/${key}`);
  },
};
