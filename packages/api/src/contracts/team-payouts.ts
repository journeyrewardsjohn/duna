/**
 * Contract: team-payouts (owner: B3c). 1099 contractors paid through their
 * own connected account. A person starts every payout; nothing moves while
 * the kill switch `team.contractorPayouts` is off ("not-enabled") or the
 * processor has no credentials ("provider-not-configured"), and neither
 * state makes a provider call. Frozen by W3-0. Procedures:
 * `operator.teamPayouts.*` (docs/plan/w3-contracts.md).
 */
import {
  staffConnectedAccountStatuses,
  staffContractorPayoutStatuses,
} from "@duna/db/schema";
import { z } from "zod";
import {
  w3AmountSchema,
  w3DateTimeSchema,
  w3IdSchema,
  w3IdempotencyKeySchema,
  w3PersonRefSchema,
} from "./w3-common";

export const teamPayoutsAccountStatusSchema = z.enum(
  staffConnectedAccountStatuses,
);
export const teamPayoutsPayoutStatusSchema = z.enum(
  staffContractorPayoutStatuses,
);
/** Why nothing was started: the honest gate states. */
export const teamPayoutsGateSchema = z.enum([
  "not-enabled",
  "provider-not-configured",
]);

export const teamPayoutsStaffRefSchema = w3PersonRefSchema.extend({
  staffProfileId: w3IdSchema,
});

export const teamPayoutsAccountSchema = z.object({
  id: w3IdSchema,
  status: teamPayoutsAccountStatusSchema,
  payoutsEnabled: z.boolean(),
  requirementsDue: z.array(
    z.object({ code: z.string().min(1), label: z.string().min(1) }),
  ),
  bankLast4: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
  syncedAt: w3DateTimeSchema.optional(),
});

/** One contractor and their connected account (none until invited). */
export const teamPayoutsContractorSchema = z.object({
  staff: teamPayoutsStaffRefSchema,
  account: teamPayoutsAccountSchema.optional(),
});
export const teamPayoutsContractorsSchema = z.object({
  contractors: z.array(teamPayoutsContractorSchema),
});

export const teamPayoutsInviteInputSchema = z.object({
  staffProfileId: w3IdSchema,
});
export const teamPayoutsInviteResultSchema = z.discriminatedUnion("state", [
  z.object({ state: teamPayoutsGateSchema }),
  z.object({
    state: z.literal("invited"),
    /** Hosted onboarding link sent to the contractor through Concierge. */
    onboardingUrl: z.url(),
    expiresAt: w3DateTimeSchema,
  }),
]);

export const teamPayoutsPayoutSchema = z.object({
  id: w3IdSchema,
  staff: teamPayoutsStaffRefSchema,
  payRunLineId: w3IdSchema,
  payRunId: w3IdSchema,
  status: teamPayoutsPayoutStatusSchema,
  amount: w3AmountSchema,
  initiatedBy: w3PersonRefSchema,
  initiatedAt: w3DateTimeSchema,
  paidAt: w3DateTimeSchema.optional(),
  failureCode: z.string().max(64).optional(),
  note: z.string().max(500).optional(),
});

export const teamPayoutsPayoutsInputSchema = z.object({
  payRunId: w3IdSchema.optional(),
  status: z.array(teamPayoutsPayoutStatusSchema).optional(),
});
export const teamPayoutsPayoutsSchema = z.object({
  payouts: z.array(teamPayoutsPayoutSchema),
});

/** Pay one approved contractor line with method "duna-pay". */
export const teamPayoutsInitiateInputSchema = z.object({
  payRunLineId: w3IdSchema,
  idempotencyKey: w3IdempotencyKeySchema,
  note: z.string().max(500).optional(),
});
export const teamPayoutsInitiateResultSchema = z.discriminatedUnion("state", [
  z.object({ state: teamPayoutsGateSchema }),
  z.object({ state: z.literal("created"), payout: teamPayoutsPayoutSchema }),
]);

export const teamPayoutsCancelInputSchema = z.object({ payoutId: w3IdSchema });

export type TeamPayoutsContractor = z.infer<typeof teamPayoutsContractorSchema>;
export type TeamPayoutsPayout = z.infer<typeof teamPayoutsPayoutSchema>;
