/**
 * Router seam: pay (owner: B2). Duna Pay: account status and onboarding,
 * payout / tax / refund settings, the payout-policy ledger, disputes, the
 * publish gate and the Money home. Shapes are frozen in ../contracts/pay.ts
 * (W3-0).
 *
 * Mounted once in ../router.ts as `operator.pay` (organizationProcedure:
 * signed in, scope checked, organisation resolved server-side). Reads need
 * `payments:read`; anything that changes money settings or answers a
 * dispute needs `payments:write` (owner).
 *
 * Every procedure returns its fixture from @duna/core/demo/pay in demo mode
 * and throws `notImplementedYet` otherwise until B2 lands the service in
 * ../services/pay/. No processor call is ever made from a stub.
 */
import { payDemo } from "@duna/core/demo/pay";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { organizationProcedure, router } from "../auth";
import {
  payAccountSchema,
  payBalanceSchema,
  payDisputeDetailSchema,
  payDisputeInputSchema,
  payDisputesInputSchema,
  payDisputesPageSchema,
  payHoldSchema,
  payMoneyHomeSchema,
  payObligationDetailSchema,
  payObligationInputSchema,
  payObligationsInputSchema,
  payObligationsPageSchema,
  payOnboardingSessionSchema,
  payPayoutSettingsSchema,
  payPublishGateInputSchema,
  payPublishGateSchema,
  payRecoverySchema,
  payRefundPolicySchema,
  payRequestReserveReviewInputSchema,
  payReserveSchema,
  payStartOnboardingInputSchema,
  paySubmitDisputeEvidenceInputSchema,
  payTaxSettingsSchema,
  payUpdateBusinessInputSchema,
  payUpdatePayoutSettingsInputSchema,
  payUpdateTaxSettingsInputSchema,
  payUpsertRefundPolicyInputSchema,
} from "../contracts/pay";
import { usesDemoData } from "../services/data-source";
import { notImplementedYet } from "./not-implemented";
import { domainSeamStatus, domainSeamStatusSchema } from "./seam-status";

const DOMAIN = "pay";
const read = organizationProcedure("payments:read");
const write = organizationProcedure("payments:write");

export const payOperatorRouter = router({
  status: read
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),

  /** The derived Duna Pay status, requirements and bank (DP-Status). */
  account: read.output(payAccountSchema).query(() => {
    if (usesDemoData()) return payDemo.account;
    return notImplementedYet(DOMAIN, "account");
  }),

  /** Business facts confirmed on DP-Business. */
  updateBusiness: write
    .input(payUpdateBusinessInputSchema)
    .output(payAccountSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        return {
          ...payDemo.account,
          business: { ...payDemo.account.business, ...input },
        };
      }
      return notImplementedYet(DOMAIN, "updateBusiness");
    }),

  /** Open verification (hosted link or embedded session), DP-Verify. */
  startOnboarding: write
    .input(payStartOnboardingInputSchema)
    .output(payOnboardingSessionSchema)
    .mutation(() => {
      if (usesDemoData()) return payDemo.onboardingSession;
      return notImplementedYet(DOMAIN, "startOnboarding");
    }),

  payoutSettings: read.output(payPayoutSettingsSchema).query(() => {
    if (usesDemoData()) return payDemo.payoutSettings;
    return notImplementedYet(DOMAIN, "payoutSettings");
  }),

  updatePayoutSettings: write
    .input(payUpdatePayoutSettingsInputSchema)
    .output(payPayoutSettingsSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) return { ...payDemo.payoutSettings, ...input };
      return notImplementedYet(DOMAIN, "updatePayoutSettings");
    }),

  refundPolicies: read.output(z.array(payRefundPolicySchema)).query(() => {
    if (usesDemoData()) return payDemo.refundPolicies;
    return notImplementedYet(DOMAIN, "refundPolicies");
  }),

  /** Create a policy, or a new version of one (versions are immutable). */
  upsertRefundPolicy: write
    .input(payUpsertRefundPolicyInputSchema)
    .output(payRefundPolicySchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        const existing = payDemo.refundPolicies.find((p) => p.id === input.id);
        return {
          ...input,
          id: existing?.id ?? payDemo.refundPolicies[0]!.id,
          version: (existing?.version ?? 0) + 1,
          active: true,
        };
      }
      return notImplementedYet(DOMAIN, "upsertRefundPolicy");
    }),

  taxSettings: read.output(payTaxSettingsSchema).query(() => {
    if (usesDemoData()) return payDemo.taxSettings;
    return notImplementedYet(DOMAIN, "taxSettings");
  }),

  updateTaxSettings: write
    .input(payUpdateTaxSettingsInputSchema)
    .output(payTaxSettingsSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) return { ...payDemo.taxSettings, ...input };
      return notImplementedYet(DOMAIN, "updateTaxSettings");
    }),

  balance: read.output(payBalanceSchema).query(() => {
    if (usesDemoData()) return payDemo.balance;
    return notImplementedYet(DOMAIN, "balance");
  }),

  /** Obligations (one per sold line) with release progress. */
  obligations: read
    .input(payObligationsInputSchema)
    .output(payObligationsPageSchema)
    .query(({ input }) => {
      if (usesDemoData()) {
        return {
          items: payDemo.obligations.filter(
            (item) =>
              (!input.status || item.status === input.status) &&
              (!input.deliveryRule || item.deliveryRule === input.deliveryRule),
          ),
        };
      }
      return notImplementedYet(DOMAIN, "obligations");
    }),

  /** One obligation with its release schedule, delivery events and refunds. */
  obligation: read
    .input(payObligationInputSchema)
    .output(payObligationDetailSchema)
    .query(({ input }) => {
      if (usesDemoData()) {
        const item = payDemo.obligations.find(
          (candidate) => candidate.id === input.obligationId,
        );
        if (!item) throw new TRPCError({ code: "NOT_FOUND" });
        return item;
      }
      return notImplementedYet(DOMAIN, "obligation");
    }),

  holds: read.output(z.array(payHoldSchema)).query(() => {
    if (usesDemoData()) return payDemo.holds;
    return notImplementedYet(DOMAIN, "holds");
  }),

  reserves: read.output(z.array(payReserveSchema)).query(() => {
    if (usesDemoData()) return payDemo.reserves;
    return notImplementedYet(DOMAIN, "reserves");
  }),

  /** The club may ask for a review of a reserve at any time (§5.4). */
  requestReserveReview: write
    .input(payRequestReserveReviewInputSchema)
    .output(payReserveSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        const reserve = payDemo.reserves.find((r) => r.id === input.reserveId);
        if (!reserve) throw new TRPCError({ code: "NOT_FOUND" });
        return { ...reserve, status: "under-review" as const };
      }
      return notImplementedYet(DOMAIN, "requestReserveReview");
    }),

  disputes: read
    .input(payDisputesInputSchema)
    .output(payDisputesPageSchema)
    .query(({ input }) => {
      if (usesDemoData()) {
        return {
          items: payDemo.disputes.filter(
            (item) => !input.status || item.status === input.status,
          ),
        };
      }
      return notImplementedYet(DOMAIN, "disputes");
    }),

  dispute: read
    .input(payDisputeInputSchema)
    .output(payDisputeDetailSchema)
    .query(({ input }) => {
      if (usesDemoData()) {
        const item = payDemo.disputes.find(
          (candidate) => candidate.id === input.disputeCaseId,
        );
        if (!item) throw new TRPCError({ code: "NOT_FOUND" });
        return item;
      }
      return notImplementedYet(DOMAIN, "dispute");
    }),

  /** A person submits evidence; Duna forwards it to the processor. */
  submitDisputeEvidence: write
    .input(paySubmitDisputeEvidenceInputSchema)
    .output(payDisputeDetailSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        const item = payDemo.disputes.find(
          (candidate) => candidate.id === input.disputeCaseId,
        );
        if (!item) throw new TRPCError({ code: "NOT_FOUND" });
        return {
          ...item,
          status: "evidence-submitted" as const,
          evidenceSubmittedAt: "2026-11-27T19:00:00.000Z",
          evidence: {
            explanation: input.explanation,
            files: input.fileStorageKeys.map((storageKey) => ({
              storageKey,
              label: storageKey.split("/").at(-1) ?? storageKey,
            })),
          },
        };
      }
      return notImplementedYet(DOMAIN, "submitDisputeEvidence");
    }),

  recoveries: read.output(z.array(payRecoverySchema)).query(() => {
    if (usesDemoData()) return payDemo.recoveries;
    return notImplementedYet(DOMAIN, "recoveries");
  }),

  /** `assertPaymentsReady` for the publish gate (DP-Gate). */
  publishGate: read
    .input(payPublishGateInputSchema)
    .output(payPublishGateSchema)
    .query(() => {
      if (usesDemoData()) return payDemo.publishGate;
      return notImplementedYet(DOMAIN, "publishGate");
    }),

  /** The Money home (MN-Home). */
  moneyHome: read.output(payMoneyHomeSchema).query(() => {
    if (usesDemoData()) return payDemo.moneyHome;
    return notImplementedYet(DOMAIN, "moneyHome");
  }),
});
