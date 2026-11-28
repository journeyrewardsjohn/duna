/**
 * Router seam: team-pay (owner: B3b). Compensation, income goals, pay
 * periods, pay runs and exports. Shapes are frozen in ../contracts/team-pay.ts
 * (W3-0).
 *
 * Mounted once in ../router.ts as `operator.teamPay`. Reads need
 * "members:read"; compensation edits, goals, periods and every pay-run
 * write need "payments:write" (owners; managers read only).
 *
 * Every procedure returns its fixture from @duna/core/demo/team-pay in demo
 * mode and calls the B3b service in ../services/team-pay/ otherwise. The
 * service narrows reads further: one member's pay is visible to that member,
 * managers and payments readers; pay runs to managers and payments readers.
 */
import {
  teamPayDemo,
  teamPayDemoPeriods,
  teamPayDemoRuns,
} from "@duna/core/demo/team-pay";
import { TRPCError } from "@trpc/server";
import { organizationProcedure, router } from "../auth";
import {
  teamPayAdjustLineInputSchema,
  teamPayApproveRunInputSchema,
  teamPayCancelRunInputSchema,
  teamPayCompensationSchema,
  teamPayComputeRunInputSchema,
  teamPayCreatePeriodInputSchema,
  teamPayExportRunInputSchema,
  teamPayExportSchema,
  teamPayLineSchema,
  teamPayPeriodSchema,
  teamPayPeriodsSchema,
  teamPayRunInputSchema,
  teamPayRunSchema,
  teamPayRunsInputSchema,
  teamPayRunsSchema,
  teamPaySetCompensationInputSchema,
  teamPaySetIncomeGoalInputSchema,
  teamPayStaffCompensationInputSchema,
  teamPayStaffCompensationSchema,
} from "../contracts/team-pay";
import { usesDemoData } from "../services/data-source";
import * as service from "../services/team-pay";
import { domainSeamStatus, domainSeamStatusSchema } from "./seam-status";

const DOMAIN = "team-pay";
const read = organizationProcedure("members:read");
const money = organizationProcedure("payments:write");
const DEMO_NOW = "2026-11-30T18:00:00.000Z";

function payContext(ctx: {
  readonly actor: service.PayContext["actor"];
  readonly organizationId: string;
  readonly requestId: string;
  readonly now: Date;
  readonly ipAddress?: string;
}): service.PayContext {
  return {
    actor: ctx.actor,
    organizationId: ctx.organizationId,
    requestId: ctx.requestId,
    now: ctx.now,
    ...(ctx.ipAddress ? { ipAddress: ctx.ipAddress } : {}),
  };
}

function demoRun(payRunId: string) {
  const row = teamPayDemoRuns.find((candidate) => candidate.id === payRunId);
  if (!row) throw new TRPCError({ code: "NOT_FOUND" });
  return row;
}

export const teamPayOperatorRouter = router({
  status: read
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),

  /** Current model, history and income goal (TM-Compensation). */
  staffCompensation: read
    .input(teamPayStaffCompensationInputSchema)
    .output(teamPayStaffCompensationSchema)
    .query(async ({ input, ctx }) => {
      if (usesDemoData()) {
        const page = teamPayDemo.staffCompensation;
        return {
          ...page,
          staff: { ...page.staff, staffProfileId: input.staffProfileId },
        };
      }
      return service.staffCompensationPage(
        payContext(ctx),
        input.staffProfileId,
      );
    }),

  /** Start a new effective-dated model (closes the current one). */
  setCompensation: money
    .input(teamPaySetCompensationInputSchema)
    .output(teamPayCompensationSchema)
    .mutation(async ({ input, ctx }) => {
      if (usesDemoData()) {
        return { id: teamPayDemo.compensation[0]!.id, ...input };
      }
      return service.setCompensation(payContext(ctx), input);
    }),

  setIncomeGoal: money
    .input(teamPaySetIncomeGoalInputSchema)
    .output(teamPayStaffCompensationSchema)
    .mutation(async ({ input, ctx }) => {
      if (usesDemoData()) {
        const page = teamPayDemo.staffCompensation;
        return {
          ...page,
          goal: { ...page.goal, target: input.target, period: input.period },
        };
      }
      return service.setIncomeGoal(payContext(ctx), input);
    }),

  payPeriods: read.output(teamPayPeriodsSchema).query(async ({ ctx }) => {
    if (usesDemoData()) return { periods: teamPayDemoPeriods };
    return service.payPeriods(payContext(ctx));
  }),

  createPayPeriod: money
    .input(teamPayCreatePeriodInputSchema)
    .output(teamPayPeriodSchema)
    .mutation(async ({ input, ctx }) => {
      if (usesDemoData()) {
        return { ...teamPayDemoPeriods[0]!, ...input, status: "open" as const };
      }
      return service.createPayPeriod(payContext(ctx), input);
    }),

  payRuns: read
    .input(teamPayRunsInputSchema)
    .output(teamPayRunsSchema)
    .query(async ({ input, ctx }) => {
      if (usesDemoData()) {
        return {
          runs: teamPayDemoRuns.filter(
            (row) =>
              (!input.payPeriodId || row.payPeriod.id === input.payPeriodId) &&
              (!input.status || input.status.includes(row.status)),
          ),
        };
      }
      return service.payRuns(payContext(ctx), input);
    }),

  /** One run with its lines and exports (TM-PayRun). */
  payRun: read
    .input(teamPayRunInputSchema)
    .output(teamPayRunSchema)
    .query(async ({ input, ctx }) => {
      if (usesDemoData()) return demoRun(input.payRunId);
      return service.payRun(payContext(ctx), input.payRunId);
    }),

  /** Compute a new revision for the period (idempotent by key). */
  computePayRun: money
    .input(teamPayComputeRunInputSchema)
    .output(teamPayRunSchema)
    .mutation(async ({ input, ctx }) => {
      if (usesDemoData()) return teamPayDemoRuns[0]!;
      return service.computeTeamPayRun(payContext(ctx), input);
    }),

  /** Replace a line's labelled adjustments (and its method for a contractor). */
  adjustLine: money
    .input(teamPayAdjustLineInputSchema)
    .output(teamPayLineSchema)
    .mutation(async ({ input, ctx }) => {
      if (usesDemoData()) {
        const row = teamPayDemoRuns
          .flatMap((candidate) => candidate.lines)
          .find((candidate) => candidate.id === input.lineId);
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        const adjustmentsMinor = input.adjustments.reduce(
          (sum, adjustment) => sum + adjustment.amount.amountMinor,
          0,
        );
        return {
          ...row,
          status: "adjusted" as const,
          adjustments: input.adjustments,
          total: {
            ...row.total,
            amountMinor: Math.max(
              0,
              row.earnings.amountMinor + adjustmentsMinor,
            ),
          },
          ...(input.method ? { method: input.method } : {}),
        };
      }
      return service.adjustLine(payContext(ctx), input);
    }),

  /** ready-for-approval → approved, by a person with payments:write. */
  approvePayRun: money
    .input(teamPayApproveRunInputSchema)
    .output(teamPayRunSchema)
    .mutation(async ({ input, ctx }) => {
      if (usesDemoData()) {
        const row = demoRun(input.payRunId);
        return {
          ...row,
          status: "approved" as const,
          approvedAt: DEMO_NOW,
        };
      }
      return service.approvePayRun(payContext(ctx), input);
    }),

  /** Write an export file (W-2 lines and contractor lines paid outside Duna). */
  exportPayRun: money
    .input(teamPayExportRunInputSchema)
    .output(teamPayExportSchema)
    .mutation(async ({ input, ctx }) => {
      if (usesDemoData()) {
        const row = demoRun(input.payRunId);
        return {
          id: teamPayDemoRuns[4]!.exports[0]!.id,
          payRunId: row.id,
          format: input.format,
          rowCount: row.lines.length,
          sha256: "ab".repeat(32),
          downloadUrl: "https://files.example/demo/pay-run.csv",
          createdAt: DEMO_NOW,
        };
      }
      return service.exportPayRun(payContext(ctx), input);
    }),

  /** draft | ready-for-approval → cancelled. */
  cancelPayRun: money
    .input(teamPayCancelRunInputSchema)
    .output(teamPayRunSchema)
    .mutation(async ({ input, ctx }) => {
      if (usesDemoData()) {
        return { ...demoRun(input.payRunId), status: "cancelled" as const };
      }
      return service.cancelPayRun(payContext(ctx), input.payRunId);
    }),
});
