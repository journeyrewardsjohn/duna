/**
 * Router seam: setup (owner: B1). Organisation profile and AI setup from a
 * website address. Shapes are frozen in ../contracts/setup.ts (W3-0).
 *
 * Mounted once in ../router.ts as `operator.setup` (organizationProcedure:
 * signed in, scope checked, organisation resolved server-side).
 *
 * Every procedure returns its fixture from @duna/core/demo/setup in demo
 * mode and throws `notImplementedYet` otherwise until B1 lands the service
 * in ../services/setup/. Read ./README.md first.
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
  setupProposalSchema,
  setupProposalsInputSchema,
  setupProposalsSchema,
  setupReadinessSchema,
  setupRunSchema,
  setupStartRunInputSchema,
  setupUpdateProfileInputSchema,
} from "../contracts/setup";
import { usesDemoData } from "../services/data-source";
import { notImplementedYet } from "./not-implemented";
import { domainSeamStatus, domainSeamStatusSchema } from "./seam-status";

const DOMAIN = "setup";
const read = organizationProcedure("sessions:read");
const write = organizationProcedure("sessions:write");

function demoRun(runId: string) {
  const run = setupDemoRuns.find((candidate) => candidate.id === runId);
  if (!run) throw new TRPCError({ code: "NOT_FOUND" });
  return run;
}

export const setupOperatorRouter = router({
  status: read
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),

  /** The club's public facts (CS-Home, S-Club-Identity). */
  profile: read.output(setupProfileSchema).query(() => {
    if (usesDemoData()) return setupDemo.profile;
    return notImplementedYet(DOMAIN, "profile");
  }),

  updateProfile: write
    .input(setupUpdateProfileInputSchema)
    .output(setupProfileSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        const { confirmFields: _confirm, ...changes } = input;
        return { ...setupDemo.profile, ...changes };
      }
      return notImplementedYet(DOMAIN, "updateProfile");
    }),

  /** Start reading a website, a listing or a description (CS-Start). */
  startRun: write
    .input(setupStartRunInputSchema)
    .output(setupRunSchema)
    .mutation(() => {
      if (usesDemoData()) return demoRun(setupDemoIds.queuedRun);
      return notImplementedYet(DOMAIN, "startRun");
    }),

  /** One run with its pages (CS-Reading, CS-States). */
  run: read
    .input(z.object({ runId: z.uuid() }))
    .output(setupRunSchema)
    .query(({ input }) => {
      if (usesDemoData()) return demoRun(input.runId);
      return notImplementedYet(DOMAIN, "run");
    }),

  /** The most recent run, or null before the first one. */
  latestRun: read.output(setupRunSchema.nullable()).query(() => {
    if (usesDemoData()) return demoRun(setupDemoIds.reviewRun);
    return notImplementedYet(DOMAIN, "latestRun");
  }),

  /** Everything a run found, for Keep / Edit / Skip (CS-Found). */
  proposals: read
    .input(setupProposalsInputSchema)
    .output(setupProposalsSchema)
    .query(({ input }) => {
      if (usesDemoData()) {
        return {
          runId: input.runId,
          proposals: setupDemoProposals.filter(
            (proposal) => proposal.runId === input.runId,
          ),
        };
      }
      return notImplementedYet(DOMAIN, "proposals");
    }),

  decideProposal: write
    .input(setupDecideProposalInputSchema)
    .output(setupProposalSchema)
    .mutation(({ input }) => {
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
          decidedAt: "2026-11-27T18:15:00.000Z",
        };
      }
      return notImplementedYet(DOMAIN, "decideProposal");
    }),

  /** Apply every kept or edited proposal of a run; audited. */
  applyProposals: write
    .input(setupApplyProposalsInputSchema)
    .output(setupApplyResultSchema)
    .mutation(({ input }) => {
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
      return notImplementedYet(DOMAIN, "applyProposals");
    }),

  /** The Club setup readiness list (CS-Home). */
  readiness: read.output(setupReadinessSchema).query(() => {
    if (usesDemoData()) return setupDemo.readiness;
    return notImplementedYet(DOMAIN, "readiness");
  }),
});
