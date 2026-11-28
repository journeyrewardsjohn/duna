/**
 * Router seam: health (H1, junior players). Mounted once in ../router.ts:
 *   player.health  protectedProcedure: signed-in actor; age, consent, region
 *                  and the `health.juniors` switch are enforced in
 *                  ../services/health (policy.ts is the single rule source).
 *
 * The original Health procedures (player.healthDashboard, syncHealthSamples,
 * saveHealthCheckIn, createHealthSharingGrant, revokeHealthSharingGrant,
 * disconnectHealth, healthProfile; operator.memberHealthProfile) stay in
 * ../router.ts so existing app builds keep their paths; they now call the
 * same policy instead of the retired adult-only gate. New H1 procedures live
 * here. Every procedure has a demo-mode branch in its service.
 */
import { TRPCError } from "@trpc/server";
import { protectedProcedure, rateLimitMiddleware, router } from "../auth";
import type { ApiContext } from "../context";
import {
  healthGuardianApproveInputSchema,
  healthGuardianApproveResultSchema,
  healthGuardianGrantDecisionInputSchema,
  healthGuardianGrantDecisionResultSchema,
  healthGuardianOverviewSchema,
  healthGuardianWithdrawInputSchema,
  healthPolicyEligibilityInputSchema,
  healthPolicyEligibilitySchema,
  healthPolicyOptInInputSchema,
  healthPolicyOptInResultSchema,
  healthPolicyWithdrawInputSchema,
  healthPolicyWithdrawResultSchema,
} from "../contracts/health";
import {
  executeIdempotent,
  IdempotencyConflictError,
  IdempotencyInProgressError,
} from "../idempotency";
import { HealthServiceError } from "../services/health/errors";
import {
  approveMinorHealth,
  decideMinorHealthGrant,
  loadGuardianHealthOverview,
  loadHealthEligibility,
  recordTeenOptIn,
  withdrawMinorHealth,
  withdrawOwnHealthConsent,
} from "../services/health/minor-service";
import { z } from "zod";

function toTrpcError(error: unknown): never {
  if (error instanceof HealthServiceError) {
    const code =
      error.code === "HEALTH_NOT_FOUND" || error.code === "GRANT_NOT_FOUND"
        ? "NOT_FOUND"
        : error.code === "ACCESS_DENIED" || error.code === "NOT_ELIGIBLE"
          ? "FORBIDDEN"
          : error.code === "INVALID_GRANT"
            ? "BAD_REQUEST"
            : error.code === "POLICY_VERSION_MISMATCH"
              ? "CONFLICT"
              : "INTERNAL_SERVER_ERROR";
    throw new TRPCError({ code, message: error.message, cause: error });
  }
  if (error instanceof IdempotencyConflictError) {
    throw new TRPCError({ code: "CONFLICT", message: error.message });
  }
  if (error instanceof IdempotencyInProgressError) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: error.message });
  }
  throw error;
}

async function idempotent<T extends object>(input: {
  readonly ctx: ApiContext;
  readonly procedure: string;
  readonly key: string;
  readonly request: Readonly<Record<string, unknown>>;
  readonly execute: () => Promise<T>;
}): Promise<T> {
  try {
    return (
      await executeIdempotent({
        key: input.key,
        procedure: input.procedure,
        personId: input.ctx.actor?.personId,
        organizationId: input.ctx.actor?.organizationId,
        request: input.request,
        now: input.ctx.now,
        execute: input.execute,
      })
    ).result;
  } catch (error) {
    return toTrpcError(error);
  }
}

const consentWrites = rateLimitMiddleware({
  id: "health-consent",
  capacity: 20,
  refillPerMinute: 5,
});

function writeContext(ctx: ApiContext) {
  return {
    actor: ctx.actor!,
    now: ctx.now,
    requestId: ctx.requestId,
    ipAddress: ctx.ipAddress,
    context: ctx,
  };
}

export const healthPlayerRouter = router({
  /** What the signed-in player may do with Duna Health, and why not. */
  eligibility: protectedProcedure
    .input(healthPolicyEligibilityInputSchema)
    .output(
      healthPolicyEligibilitySchema.extend({ hasConnection: z.boolean() }),
    )
    .query(async ({ input, ctx }) => {
      try {
        return await loadHealthEligibility({
          actor: ctx.actor!,
          storefront: input.storefrontCountry,
          now: ctx.now,
          context: ctx,
        });
      } catch (error) {
        return toTrpcError(error);
      }
    }),
  /** A 13-to-17-year-old's own opt-in, on their own signed-in session. */
  optIn: protectedProcedure
    .use(consentWrites)
    .input(healthPolicyOptInInputSchema)
    .output(healthPolicyOptInResultSchema)
    .mutation(({ input, ctx }) =>
      idempotent({
        ctx,
        procedure: "player.health.optIn",
        key: input.idempotencyKey,
        request: input,
        execute: () =>
          recordTeenOptIn({
            ...writeContext(ctx),
            policyVersion: input.policyVersion,
          }),
      }),
    ),
  /** The player withdraws: sync stops, grants end, deletion is scheduled. */
  withdraw: protectedProcedure
    .use(consentWrites)
    .input(healthPolicyWithdrawInputSchema)
    .output(healthPolicyWithdrawResultSchema)
    .mutation(({ input, ctx }) =>
      idempotent({
        ctx,
        procedure: "player.health.withdraw",
        key: input.idempotencyKey,
        request: input,
        execute: () => withdrawOwnHealthConsent(writeContext(ctx)),
      }),
    ),
  /** Status and grants for each linked minor. Never Health values. */
  guardianOverview: protectedProcedure
    .output(healthGuardianOverviewSchema)
    .query(async ({ ctx }) => {
      try {
        return await loadGuardianHealthOverview(writeContext(ctx));
      } catch (error) {
        return toTrpcError(error);
      }
    }),
  guardianApprove: protectedProcedure
    .use(consentWrites)
    .input(healthGuardianApproveInputSchema)
    .output(healthGuardianApproveResultSchema)
    .mutation(({ input, ctx }) =>
      idempotent({
        ctx,
        procedure: "player.health.guardianApprove",
        key: input.idempotencyKey,
        request: input,
        execute: () =>
          approveMinorHealth({
            ...writeContext(ctx),
            minorId: input.minorId,
            policyVersion: input.policyVersion,
          }),
      }),
    ),
  guardianWithdraw: protectedProcedure
    .use(consentWrites)
    .input(healthGuardianWithdrawInputSchema)
    .output(healthPolicyWithdrawResultSchema)
    .mutation(({ input, ctx }) =>
      idempotent({
        ctx,
        procedure: "player.health.guardianWithdraw",
        key: input.idempotencyKey,
        request: input,
        execute: () =>
          withdrawMinorHealth({ ...writeContext(ctx), minorId: input.minorId }),
      }),
    ),
  guardianDecideGrant: protectedProcedure
    .use(consentWrites)
    .input(healthGuardianGrantDecisionInputSchema)
    .output(healthGuardianGrantDecisionResultSchema)
    .mutation(({ input, ctx }) =>
      idempotent({
        ctx,
        procedure: "player.health.guardianDecideGrant",
        key: input.idempotencyKey,
        request: input,
        execute: () =>
          decideMinorHealthGrant({
            ...writeContext(ctx),
            minorId: input.minorId,
            grantId: input.grantId,
            decision: input.decision,
            policyVersion: input.policyVersion,
          }),
      }),
    ),
});
