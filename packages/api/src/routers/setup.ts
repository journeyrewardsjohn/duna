/**
 * Router seam: setup (owner: B1). Organisation profile and AI setup from a
 * website address. Shapes are frozen in ../contracts/setup.ts (W3-0).
 *
 * Mounted once in ../router.ts as `operator.setup` (organizationProcedure:
 * signed in, scope checked, organisation resolved server-side). Reads need
 * `sessions:read`, everything that changes something `sessions:write`.
 *
 * Every procedure returns its fixture from @duna/core/demo/setup in demo
 * mode; otherwise it calls ../services/setup/. Without the reader or the AI
 * gateway, `startRun` answers the honest not-configured state
 * (PRECONDITION_FAILED) and makes no outbound call; the profile, review and
 * readiness keep working (the no-website path needs no provider).
 *
 * Two procedures beyond the W3-0 table reuse contract shapes only:
 * `cancelRun` ({ runId } → setupRunSchema) and `decideGroup` (bulk Keep or
 * Skip for one category → setupProposalsSchema).
 */
import {
  setupDemo,
  setupDemoIds,
  setupDemoProposals,
  setupDemoRuns,
} from "@duna/core/demo/setup";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { organizationProcedure, router } from "../auth";
import {
  setupApplyProposalsInputSchema,
  setupApplyResultSchema,
  setupDecideProposalInputSchema,
  setupProfileSchema,
  setupProposalCategorySchema,
  setupProposalSchema,
  setupProposalsInputSchema,
  setupProposalsSchema,
  setupReadinessSchema,
  setupRunSchema,
  setupStartRunInputSchema,
  setupUpdateProfileInputSchema,
} from "../contracts/setup";
import { usesDemoData } from "../services/data-source";
import {
  applySetupProposals,
  cancelSetupRun,
  computeSetupReadiness,
  decideSetupProposal,
  decideSetupProposalGroup,
  getLatestSetupRun,
  getSetupRun,
  listSetupProposals,
  loadSetupProfile,
  startSetupRun,
  updateSetupProfile,
} from "../services/setup";
import { domainSeamStatus, domainSeamStatusSchema } from "./seam-status";

const DOMAIN = "setup";
const read = organizationProcedure("sessions:read");
const write = organizationProcedure("sessions:write");

function demoRun(runId: string) {
  const run = setupDemoRuns.find((candidate) => candidate.id === runId);
  if (!run) throw new TRPCError({ code: "NOT_FOUND" });
  return run;
}

const demoDecidedAt = "2026-11-27T18:15:00.000Z";

export const setupOperatorRouter = router({
  status: read
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),

  /** The club's public facts (CS-Home, S-Club-Identity). */
  profile: read.output(setupProfileSchema).query(({ ctx }) => {
    if (usesDemoData()) return setupDemo.profile;
    return loadSetupProfile(ctx.organizationId);
  }),

  /** Edit the facts by hand; no website needed. */
  updateProfile: write
    .input(setupUpdateProfileInputSchema)
    .output(setupProfileSchema)
    .mutation(({ ctx, input }) => {
      if (usesDemoData()) {
        return {
          ...setupDemo.profile,
          ...Object.fromEntries(
            Object.entries(input).filter(([key]) => key !== "confirmFields"),
          ),
        };
      }
      return updateSetupProfile({
        organizationId: ctx.organizationId,
        personId: ctx.actor.personId,
        update: input,
        now: ctx.now,
      });
    }),

  /** Start reading a website or a description (CS-Start). */
  startRun: write
    .input(setupStartRunInputSchema)
    .output(setupRunSchema)
    .mutation(({ ctx, input }) => {
      if (usesDemoData()) return demoRun(setupDemoIds.queuedRun);
      return startSetupRun({
        organizationId: ctx.organizationId,
        personId: ctx.actor.personId,
        request: input,
        now: ctx.now,
      });
    }),

  /** One run with its pages (CS-Reading, CS-States). Polling it resumes a stalled run. */
  run: read
    .input(z.object({ runId: z.uuid() }))
    .output(setupRunSchema)
    .query(({ ctx, input }) => {
      if (usesDemoData()) return demoRun(input.runId);
      return getSetupRun({
        organizationId: ctx.organizationId,
        runId: input.runId,
        now: ctx.now,
      });
    }),

  /** The most recent run, or null before the first one. */
  latestRun: read.output(setupRunSchema.nullable()).query(({ ctx }) => {
    if (usesDemoData()) return demoRun(setupDemoIds.reviewRun);
    return getLatestSetupRun({
      organizationId: ctx.organizationId,
      now: ctx.now,
    });
  }),

  /** Stop a queued or reading run; nothing it found is kept. */
  cancelRun: write
    .input(z.object({ runId: z.uuid() }))
    .output(setupRunSchema)
    .mutation(({ ctx, input }) => {
      if (usesDemoData()) {
        const run = demoRun(input.runId);
        return run.status === "queued" || run.status === "reading"
          ? { ...run, status: "cancelled" as const, finishedAt: demoDecidedAt }
          : run;
      }
      return cancelSetupRun({
        organizationId: ctx.organizationId,
        runId: input.runId,
        now: ctx.now,
      });
    }),

  /** Everything a run found, for Keep / Edit / Skip (CS-Found). */
  proposals: read
    .input(setupProposalsInputSchema)
    .output(setupProposalsSchema)
    .query(({ ctx, input }) => {
      if (usesDemoData()) {
        return {
          runId: input.runId,
          proposals: setupDemoProposals.filter(
            (proposal) => proposal.runId === input.runId,
          ),
        };
      }
      return listSetupProposals({
        organizationId: ctx.organizationId,
        runId: input.runId,
      });
    }),

  decideProposal: write
    .input(setupDecideProposalInputSchema)
    .output(setupProposalSchema)
    .mutation(({ ctx, input }) => {
      if (usesDemoData()) {
        const proposal = setupDemoProposals.find(
          (candidate) => candidate.id === input.proposalId,
        );
        if (!proposal) throw new TRPCError({ code: "NOT_FOUND" });
        return {
          ...proposal,
          decision: input.decision,
          ...(input.decision === "edited"
            ? { editedPayload: input.editedPayload }
            : {}),
          decidedAt: demoDecidedAt,
        };
      }
      return decideSetupProposal({
        organizationId: ctx.organizationId,
        personId: ctx.actor.personId,
        decision: input,
        now: ctx.now,
      });
    }),

  /** Keep (or Skip) every pending item of one group; conflicts stay for the person. */
  decideGroup: write
    .input(
      z.object({
        runId: z.uuid(),
        category: setupProposalCategorySchema,
        decision: z.enum(["kept", "skipped"]),
      }),
    )
    .output(setupProposalsSchema)
    .mutation(({ ctx, input }) => {
      if (usesDemoData()) {
        return {
          runId: input.runId,
          proposals: setupDemoProposals
            .filter((proposal) => proposal.runId === input.runId)
            .map((proposal) =>
              proposal.category === input.category &&
              proposal.decision === "pending" &&
              !(input.decision === "kept" && proposal.candidates.length > 1)
                ? {
                    ...proposal,
                    decision: input.decision,
                    decidedAt: demoDecidedAt,
                  }
                : proposal,
            ),
        };
      }
      return decideSetupProposalGroup({
        organizationId: ctx.organizationId,
        personId: ctx.actor.personId,
        runId: input.runId,
        category: input.category,
        decision: input.decision,
        now: ctx.now,
      });
    }),

  /** Apply every kept or edited proposal of a run; audited, idempotent. */
  applyProposals: write
    .input(setupApplyProposalsInputSchema)
    .output(setupApplyResultSchema)
    .mutation(({ ctx, input }) => {
      if (usesDemoData()) {
        const proposals = setupDemoProposals.filter(
          (proposal) => proposal.runId === input.runId,
        );
        return {
          runId: input.runId,
          applied: proposals.filter((p) => p.decision === "applied").length,
          skipped: proposals.filter((p) => p.decision === "skipped").length,
          proposals,
        };
      }
      return applySetupProposals({
        organizationId: ctx.organizationId,
        personId: ctx.actor.personId,
        runId: input.runId,
        idempotencyKey: input.idempotencyKey,
        requestId: ctx.requestId,
        now: ctx.now,
      });
    }),

  /** The Club setup readiness list (CS-Home). */
  readiness: read.output(setupReadinessSchema).query(({ ctx }) => {
    if (usesDemoData()) return setupDemo.readiness;
    return computeSetupReadiness(ctx.organizationId);
  }),
});
