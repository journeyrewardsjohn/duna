/**
 * Contracts: health (H1, junior players). Eligibility, teen opt-in, guardian
 * approval and withdrawal. The original Health schemas stay in ../contracts.
 * Names are prefixed `healthPolicy` / `healthGuardian` (shared export
 * namespace, see ../routers/README.md).
 */
import { z } from "zod";
import {
  healthCategorySchema,
  healthMetricSchema,
  healthSharingScopeSchema,
  healthStorefrontCountrySchema,
} from "../contracts";

export const healthPolicyAgeBandSchema = z.enum([
  "unknown",
  "under-13",
  "teen",
  "adult",
]);

export const healthPolicyActionSchema = z.enum([
  "view-own",
  "opt-in",
  "sync",
  "check-in",
  "create-grant",
  "revoke-grant",
  "withdraw",
  "disconnect",
]);

export const healthPolicyRefusalReasonSchema = z.enum([
  "birth-date-required",
  "under-13",
  "juniors-paused",
  "region-not-supported",
  "region-unknown",
  "teen-opt-in-required",
  "guardian-approval-required",
  "not-offered-to-minors",
  "adult-viewer-required",
]);

export const healthPolicyDecisionSchema = z.object({
  allowed: z.boolean(),
  reason: healthPolicyRefusalReasonSchema.optional(),
  message: z.string().optional(),
});

export const healthPolicyDisclosureSchema = z.object({
  policyVersion: z.string(),
  text: z.string(),
});

export const healthPolicyEligibilityInputSchema = z
  .object({ storefrontCountry: healthStorefrontCountrySchema })
  .default({});

export const healthPolicyEligibilitySchema = z.object({
  policyVersion: z.string(),
  band: healthPolicyAgeBandSchema,
  minor: z.boolean(),
  juniorsEnabled: z.boolean(),
  storefront: z.object({
    reported: z.string().optional(),
    allowed: z.boolean(),
  }),
  actions: z.record(healthPolicyActionSchema, healthPolicyDecisionSchema),
  allowedMetrics: z.array(healthMetricSchema).readonly(),
  allowedCategories: z.array(healthCategorySchema).readonly(),
  grantAudiences: z
    .array(z.enum(["player", "coach", "organization"]))
    .readonly(),
  maxGrantDays: z.number().int().positive(),
  consent: z.object({
    required: z.boolean(),
    teenOptedIn: z.boolean(),
    guardianApproved: z.boolean(),
    linkedGuardian: z.boolean(),
  }),
  /** Text the teen reads before opting in (teens only). */
  disclosure: healthPolicyDisclosureSchema.optional(),
});

export const healthPolicyOptInInputSchema = z.object({
  policyVersion: z.string().min(1).max(64),
  idempotencyKey: z.string().uuid(),
});

export const healthPolicyOptInResultSchema = z.object({
  recorded: z.boolean(),
  teenOptedIn: z.boolean(),
  guardianApproved: z.boolean(),
});

export const healthPolicyWithdrawInputSchema = z.object({
  idempotencyKey: z.string().uuid(),
});

export const healthPolicyWithdrawResultSchema = z.object({
  withdrawn: z.literal(true),
  revokedGrants: z.number().int().nonnegative(),
  purgeScheduled: z.boolean(),
});

export const healthGuardianGrantSchema = z.object({
  id: z.string().uuid(),
  audienceKind: z.enum(["player", "coach", "organization"]),
  audienceLabel: z.string(),
  categories: z.array(healthCategorySchema).readonly(),
  scopes: z.array(healthSharingScopeSchema).readonly(),
  approvalStatus: z.enum(["not-required", "pending", "approved", "denied"]),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});

/** What a guardian sees: status and grants, never Health values. */
export const healthGuardianMinorSchema = z.object({
  personId: z.string().uuid(),
  displayName: z.string(),
  band: healthPolicyAgeBandSchema,
  eligible: healthPolicyDecisionSchema,
  consent: z.object({
    teenOptedIn: z.boolean(),
    guardianApproved: z.boolean(),
    approvedByYou: z.boolean(),
  }),
  connection: z
    .object({
      status: z.enum(["active", "paused", "revoked"]),
      enabledCategories: z.array(healthCategorySchema).readonly(),
      lastSyncedAt: z.iso.datetime().optional(),
      purgePending: z.boolean(),
    })
    .optional(),
  grants: z.array(healthGuardianGrantSchema).readonly(),
});

export const healthGuardianOverviewSchema = z.object({
  policyVersion: z.string(),
  approvalDisclosure: healthPolicyDisclosureSchema,
  grantDisclosure: healthPolicyDisclosureSchema,
  minors: z.array(healthGuardianMinorSchema).readonly(),
});

export const healthGuardianApproveInputSchema = z.object({
  minorId: z.string().uuid(),
  policyVersion: z.string().min(1).max(64),
  idempotencyKey: z.string().uuid(),
});

export const healthGuardianApproveResultSchema = z.object({
  approved: z.literal(true),
  teenOptedIn: z.boolean(),
});

export const healthGuardianWithdrawInputSchema = z.object({
  minorId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
});

export const healthGuardianGrantDecisionInputSchema = z.object({
  minorId: z.string().uuid(),
  grantId: z.string().uuid(),
  decision: z.enum(["approve", "deny", "revoke"]),
  policyVersion: z.string().min(1).max(64),
  idempotencyKey: z.string().uuid(),
});

export const healthGuardianGrantDecisionResultSchema = z.object({
  grantId: z.string().uuid(),
  approvalStatus: z.enum(["not-required", "pending", "approved", "denied"]),
  revoked: z.boolean(),
});

export type HealthPolicyEligibility = z.infer<
  typeof healthPolicyEligibilitySchema
>;
export type HealthGuardianOverview = z.infer<
  typeof healthGuardianOverviewSchema
>;
export type HealthGuardianMinor = z.infer<typeof healthGuardianMinorSchema>;
export type HealthPolicyRefusalReasonValue = z.infer<
  typeof healthPolicyRefusalReasonSchema
>;
