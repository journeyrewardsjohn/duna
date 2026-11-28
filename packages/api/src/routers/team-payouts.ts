/**
 * Router seam: team-payouts (owner: B3c). 1099 contractor payouts through
 * the contractor's own connected account. Shapes are frozen in
 * ../contracts/team-payouts.ts (W3-0).
 *
 * Mounted once in ../router.ts as `operator.teamPayouts`. Reads need
 * "payments:read"; invites, payouts and cancellations "payments:write".
 * B3c checks `isFeatureEnabled("team.contractorPayouts", …)` and the
 * processor's readiness before any provider call and answers "not-enabled"
 * or "provider-not-configured" otherwise.
 *
 * Every procedure returns its fixture from @duna/core/demo/team-payouts in
 * demo mode (no provider call) and throws `notImplementedYet` otherwise
 * until B3c lands the service in ../services/team-payouts/.
 */
import {
  teamPayoutsDemo,
  teamPayoutsDemoPayouts,
} from "@duna/core/demo/team-payouts";
import { TRPCError } from "@trpc/server";
import { organizationProcedure, router } from "../auth";
import {
  teamPayoutsCancelInputSchema,
  teamPayoutsContractorsSchema,
  teamPayoutsInitiateInputSchema,
  teamPayoutsInitiateResultSchema,
  teamPayoutsInviteInputSchema,
  teamPayoutsInviteResultSchema,
  teamPayoutsPayoutSchema,
  teamPayoutsPayoutsInputSchema,
  teamPayoutsPayoutsSchema,
} from "../contracts/team-payouts";
import { usesDemoData } from "../services/data-source";
import { notImplementedYet } from "./not-implemented";
import { domainSeamStatus, domainSeamStatusSchema } from "./seam-status";

const DOMAIN = "team-payouts";
const read = organizationProcedure("payments:read");
const money = organizationProcedure("payments:write");

export const teamPayoutsOperatorRouter = router({
  status: read
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),

  /** Contractors and their connected-account status (TM-PayRun column). */
  contractors: read.output(teamPayoutsContractorsSchema).query(() => {
    if (usesDemoData()) return { contractors: teamPayoutsDemo.contractors };
    return notImplementedYet(DOMAIN, "contractors");
  }),

  /** Ask a contractor to connect their own account (no provider call in demo). */
  inviteToConnect: money
    .input(teamPayoutsInviteInputSchema)
    .output(teamPayoutsInviteResultSchema)
    .mutation(() => {
      if (usesDemoData()) return teamPayoutsDemo.invite;
      return notImplementedYet(DOMAIN, "inviteToConnect");
    }),

  payouts: read
    .input(teamPayoutsPayoutsInputSchema)
    .output(teamPayoutsPayoutsSchema)
    .query(({ input }) => {
      if (usesDemoData()) {
        return {
          payouts: teamPayoutsDemoPayouts.filter(
            (row) =>
              (!input.payRunId || row.payRunId === input.payRunId) &&
              (!input.status || input.status.includes(row.status)),
          ),
        };
      }
      return notImplementedYet(DOMAIN, "payouts");
    }),

  /** A person pays one approved "duna-pay" line; idempotent by key. */
  initiatePayout: money
    .input(teamPayoutsInitiateInputSchema)
    .output(teamPayoutsInitiateResultSchema)
    .mutation(() => {
      if (usesDemoData()) {
        return {
          state: "created" as const,
          payout: teamPayoutsDemoPayouts[0]!,
        };
      }
      return notImplementedYet(DOMAIN, "initiatePayout");
    }),

  /** pending → cancelled (only before the transfer is created). */
  cancelPayout: money
    .input(teamPayoutsCancelInputSchema)
    .output(teamPayoutsPayoutSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        const row = teamPayoutsDemoPayouts.find(
          (candidate) => candidate.id === input.payoutId,
        );
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        if (row.status !== "pending") throw new TRPCError({ code: "CONFLICT" });
        return { ...row, status: "cancelled" as const };
      }
      return notImplementedYet(DOMAIN, "cancelPayout");
    }),
});
