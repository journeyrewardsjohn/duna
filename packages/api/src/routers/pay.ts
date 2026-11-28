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
 * Every procedure returns its fixture from @duna/core/demo/pay in demo mode.
 * Implemented procedures call ../services/pay/; the rest still throw
 * `notImplementedYet` until B2 lands them. No processor call is ever made
 * from a stub.
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
import {
  loadPayAccount,
  loadPayPayoutSettings,
  payPublishGate,
  startPayOnboarding,
  updatePayBusiness,
  updatePayPayoutSettings,
} from "../services/pay/account";
import {
  listPayRecoveries,
  listPayReserves,
  requestPayReserveReview,
} from "../services/pay/balances";
import {
  listPayDisputes,
  loadPayDispute,
  submitPayDisputeEvidence,
} from "../services/pay/disputes";
import {
  listPayHolds,
  listPayObligations,
  loadPayObligationDetail,
} from "../services/pay/read-model";
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
  account: read.output(payAccountSchema).query(({ ctx }) => {
    if (usesDemoData()) return payDemo.account;
    return loadPayAccount(ctx.organizationId);
  }),

  /** Business facts confirmed on DP-Business. */
  updateBusiness: write
    .input(payUpdateBusinessInputSchema)
    .output(payAccountSchema)
    .mutation(({ ctx, input }) => {
      if (usesDemoData()) {
        return {
          ...payDemo.account,
          business: { ...payDemo.account.business, ...input },
        };
      }
      return updatePayBusiness({
        organizationId: ctx.organizationId,
        ...input,
        now: ctx.now,
      });
    }),

  /** Open verification (hosted link or embedded session), DP-Verify. */
  startOnboarding: write
    .input(payStartOnboardingInputSchema)
    .output(payOnboardingSessionSchema)
    .mutation(({ ctx, input }) => {
      if (usesDemoData()) return payDemo.onboardingSession;
      return startPayOnboarding({
        actor: ctx.actor,
        organizationId: ctx.organizationId,
        method: input.method,
        returnPath: input.returnPath,
        requestId: ctx.requestId,
        now: ctx.now,
      });
    }),

  payoutSettings: read.output(payPayoutSettingsSchema).query(({ ctx }) => {
    if (usesDemoData()) return payDemo.payoutSettings;
    return loadPayPayoutSettings(ctx.organizationId);
  }),

  updatePayoutSettings: write
    .input(payUpdatePayoutSettingsInputSchema)
    .output(payPayoutSettingsSchema)
    .mutation(({ ctx, input }) => {
      if (usesDemoData()) return { ...payDemo.payoutSettings, ...input };
      return updatePayPayoutSettings({
        actor: ctx.actor,
        organizationId: ctx.organizationId,
        changes: input,
        now: ctx.now,
      });
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
    .query(({ ctx, input }) => {
      if (usesDemoData()) {
        return {
          items: payDemo.obligations.filter(
            (item) =>
              (!input.status || item.status === input.status) &&
              (!input.deliveryRule || item.deliveryRule === input.deliveryRule),
          ),
        };
      }
      return listPayObligations(ctx.organizationId, input);
    }),

  /** One obligation with its release schedule, delivery events and refunds. */
  obligation: read
    .input(payObligationInputSchema)
    .output(payObligationDetailSchema)
    .query(({ ctx, input }) => {
      if (usesDemoData()) {
        const item = payDemo.obligations.find(
          (candidate) => candidate.id === input.obligationId,
        );
        if (!item) throw new TRPCError({ code: "NOT_FOUND" });
        return item;
      }
      return loadPayObligationDetail(ctx.organizationId, input.obligationId);
    }),

  holds: read.output(z.array(payHoldSchema)).query(({ ctx }) => {
    if (usesDemoData()) return payDemo.holds;
    return listPayHolds(ctx.organizationId);
  }),

  reserves: read.output(z.array(payReserveSchema)).query(({ ctx }) => {
    if (usesDemoData()) return payDemo.reserves;
    return listPayReserves(ctx.organizationId);
  }),

  /** The club may ask for a review of a reserve at any time (§5.4). */
  requestReserveReview: write
    .input(payRequestReserveReviewInputSchema)
    .output(payReserveSchema)
    .mutation(({ ctx, input }) => {
      if (usesDemoData()) {
        const reserve = payDemo.reserves.find((r) => r.id === input.reserveId);
        if (!reserve) throw new TRPCError({ code: "NOT_FOUND" });
        return { ...reserve, status: "under-review" as const };
      }
      return requestPayReserveReview({
        organizationId: ctx.organizationId,
        reserveId: input.reserveId,
        actorPersonId: ctx.actor.personId,
        note: input.note,
        now: ctx.now,
      });
    }),

  disputes: read
    .input(payDisputesInputSchema)
    .output(payDisputesPageSchema)
    .query(({ ctx, input }) => {
      if (usesDemoData()) {
        return {
          items: payDemo.disputes.filter(
            (item) => !input.status || item.status === input.status,
          ),
        };
      }
      return listPayDisputes(ctx.organizationId, input);
    }),

  dispute: read
    .input(payDisputeInputSchema)
    .output(payDisputeDetailSchema)
    .query(({ ctx, input }) => {
      if (usesDemoData()) {
        const item = payDemo.disputes.find(
          (candidate) => candidate.id === input.disputeCaseId,
        );
        if (!item) throw new TRPCError({ code: "NOT_FOUND" });
        return item;
      }
      return loadPayDispute(ctx.organizationId, input.disputeCaseId);
    }),

  /** A person submits evidence; Duna forwards it to the processor. */
  submitDisputeEvidence: write
    .input(paySubmitDisputeEvidenceInputSchema)
    .output(payDisputeDetailSchema)
    .mutation(({ ctx, input }) => {
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
      return submitPayDisputeEvidence({
        organizationId: ctx.organizationId,
        actorPersonId: ctx.actor.personId,
        disputeCaseId: input.disputeCaseId,
        explanation: input.explanation,
        fileStorageKeys: input.fileStorageKeys,
        idempotencyKey: input.idempotencyKey,
        now: ctx.now,
      });
    }),

  recoveries: read.output(z.array(payRecoverySchema)).query(({ ctx }) => {
    if (usesDemoData()) return payDemo.recoveries;
    return listPayRecoveries(ctx.organizationId);
  }),

  /** `assertPaymentsReady` for the publish gate (DP-Gate). */
  publishGate: read
    .input(payPublishGateInputSchema)
    .output(payPublishGateSchema)
    .query(({ ctx, input }) => {
      if (usesDemoData()) return payDemo.publishGate;
      return payPublishGate(ctx.organizationId, input);
    }),

  /** The Money home (MN-Home). */
  moneyHome: read.output(payMoneyHomeSchema).query(() => {
    if (usesDemoData()) return payDemo.moneyHome;
    return notImplementedYet(DOMAIN, "moneyHome");
  }),
});
