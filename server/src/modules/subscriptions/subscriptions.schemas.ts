import { z } from "zod";

export const featureValueTypeEnumSchema = z.enum(["BOOLEAN", "NUMERIC"]);
export const planIntervalEnumSchema = z.enum(["month", "year", "lifetime"]);

/**
 * Schema for creating a new dynamic feature in the Feature Catalog.
 */
export const createFeatureDefinitionSchema = z.object({
  key: z
    .string()
    .min(2, "Feature key must be at least 2 characters")
    .max(60, "Feature key cannot exceed 60 characters")
    .regex(
      /^[a-z0-9_]+$/,
      "Feature key must contain only lowercase letters, numbers, and underscores (e.g. 'stems_download')"
    ),
  name: z
    .string()
    .min(1, "Feature name cannot be blank")
    .max(100, "Feature name cannot exceed 100 characters")
    .trim(),
  description: z
    .string()
    .max(500, "Description cannot exceed 500 characters")
    .optional(),
  valueType: featureValueTypeEnumSchema.default("BOOLEAN"),
  defaultValue: z.union([z.boolean(), z.number()]),
  category: z
    .string()
    .max(50, "Category cannot exceed 50 characters")
    .default("general"),
});

/**
 * Schema for updating an existing dynamic feature definition.
 */
export const updateFeatureDefinitionSchema = z.object({
  name: z
    .string()
    .min(1, "Feature name cannot be blank")
    .max(100, "Feature name cannot exceed 100 characters")
    .trim()
    .optional(),
  description: z
    .string()
    .max(500, "Description cannot exceed 500 characters")
    .nullable()
    .optional(),
  defaultValue: z.union([z.boolean(), z.number()]).optional(),
  category: z
    .string()
    .max(50, "Category cannot exceed 50 characters")
    .optional(),
  isActive: z.boolean().optional(),
});

/**
 * Schema for creating a new subscription plan.
 */
export const createPlanSchema = z.object({
  id: z
    .string()
    .min(2, "Plan ID must be at least 2 characters")
    .max(50, "Plan ID cannot exceed 50 characters")
    .regex(
      /^[a-z0-9_]+$/,
      "Plan ID must contain only lowercase letters, numbers, and underscores (e.g. 'premium_family')"
    ),
  name: z
    .string()
    .min(1, "Plan name cannot be blank")
    .max(100, "Plan name cannot exceed 100 characters")
    .trim(),
  priceCents: z.coerce
    .number()
    .int("Price must be in whole cents")
    .nonnegative("Price cannot be negative")
    .default(0),
  currency: z
    .string()
    .length(3, "Currency must be a 3-letter ISO code (e.g. USD)")
    .toUpperCase()
    .default("USD"),
  interval: planIntervalEnumSchema.default("month"),
  features: z
    .record(z.string(), z.union([z.boolean(), z.number()]))
    .default({}),
  isActive: z.boolean().default(true),
});

/**
 * Schema for updating an existing subscription plan.
 */
export const updatePlanSchema = z.object({
  name: z
    .string()
    .min(1, "Plan name cannot be blank")
    .max(100, "Plan name cannot exceed 100 characters")
    .trim()
    .optional(),
  priceCents: z.coerce
    .number()
    .int("Price must be in whole cents")
    .nonnegative("Price cannot be negative")
    .optional(),
  currency: z
    .string()
    .length(3, "Currency must be a 3-letter ISO code")
    .toUpperCase()
    .optional(),
  interval: planIntervalEnumSchema.optional(),
  features: z
    .record(z.string(), z.union([z.boolean(), z.number()]))
    .optional(),
  isActive: z.boolean().optional(),
});

/**
 * Schema for user upgrading/switching their subscription plan (Mock checkout in dev).
 */
export const upgradeSubscriptionSchema = z.object({
  planId: z.string().min(1, "Plan ID is required"),
});

export type CreateFeatureDefinitionInput = z.infer<
  typeof createFeatureDefinitionSchema
>;
export type UpdateFeatureDefinitionInput = z.infer<
  typeof updateFeatureDefinitionSchema
>;
export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
export type UpgradeSubscriptionInput = z.infer<typeof upgradeSubscriptionSchema>;
