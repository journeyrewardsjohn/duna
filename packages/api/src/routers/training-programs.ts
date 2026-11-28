/**
 * Router seam: training-programs (owner: B4). Programs, sessions, conflicts,
 * after-practice records and practice plans. Shapes are frozen in
 * ../contracts/training-programs.ts (W3-0).
 *
 * Mounted once in ../router.ts:
 *   operator.trainingPrograms  organizationProcedure("training:read" | "training:write")
 *   player.trainingPrograms    protectedProcedure (the signed-in athlete's own schedule)
 *
 * Every procedure returns its fixture from @duna/core/demo/training-programs
 * in demo mode and throws `notImplementedYet` otherwise until B4 lands the
 * service in ../services/training-programs/. Read ./README.md first.
 */
import {
  trainingProgramsDemo,
  trainingProgramsDemoIds,
} from "@duna/core/demo/training-programs";
import { TRPCError } from "@trpc/server";
import { organizationProcedure, protectedProcedure, router } from "../auth";
import {
  trainingProgramsAddSessionInputSchema,
  trainingProgramsAssignCoachesInputSchema,
  trainingProgramsCancelInputSchema,
  trainingProgramsCancelSessionInputSchema,
  trainingProgramsConflictSchema,
  trainingProgramsConflictsSchema,
  trainingProgramsCreateInputSchema,
  trainingProgramsListInputSchema,
  trainingProgramsListSchema,
  trainingProgramsMyScheduleInputSchema,
  trainingProgramsOutcomeSchema,
  trainingProgramsPracticePlanInputSchema,
  trainingProgramsPracticePlanSchema,
  trainingProgramsPracticePlansInputSchema,
  trainingProgramsPracticePlansSchema,
  trainingProgramsProgramInputSchema,
  trainingProgramsProgramSchema,
  trainingProgramsProposalSchema,
  trainingProgramsProposeInputSchema,
  trainingProgramsProposePracticePlanInputSchema,
  trainingProgramsRecordOutcomeInputSchema,
  trainingProgramsResolveConflictInputSchema,
  trainingProgramsSavePracticePlanInputSchema,
  trainingProgramsSessionSchema,
  trainingProgramsSessionsInputSchema,
  trainingProgramsSessionsSchema,
  trainingProgramsSetSessionPlanInputSchema,
  trainingProgramsUpdateInputSchema,
} from "../contracts/training-programs";
import { usesDemoData } from "../services/data-source";
import { notImplementedYet } from "./not-implemented";
import { domainSeamStatus, domainSeamStatusSchema } from "./seam-status";
import { z } from "zod";

const DOMAIN = "training-programs";
const read = organizationProcedure("training:read");
const write = organizationProcedure("training:write");
const demo = trainingProgramsDemo;
const NOW = "2026-11-27T18:00:00.000Z";

function demoProgram(programId: string) {
  if (programId === trainingProgramsDemoIds.cancelledProgram) {
    return demo.cancelledProgram;
  }
  if (programId === trainingProgramsDemoIds.activeProgram) return demo.program;
  const summary = demo.summaries.find((item) => item.id === programId);
  if (!summary) throw new TRPCError({ code: "NOT_FOUND" });
  return { ...demo.program, ...summary };
}

function demoSession(sessionId: string) {
  const session = demo.sessions.find((item) => item.id === sessionId);
  if (!session) throw new TRPCError({ code: "NOT_FOUND" });
  return session;
}

function demoConflict(conflictId: string) {
  const conflict = demo.conflicts.find((item) => item.id === conflictId);
  if (!conflict) throw new TRPCError({ code: "NOT_FOUND" });
  return conflict;
}

const sessionInput = z.object({ sessionId: z.uuid() });

export const trainingProgramsOperatorRouter = router({
  status: read
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),

  /** Programs list (Training › Programs). */
  list: read
    .input(trainingProgramsListInputSchema)
    .output(trainingProgramsListSchema)
    .query(({ input }) => {
      if (usesDemoData()) {
        return {
          items: demo.summaries.filter(
            (item) => !input.status || item.status === input.status,
          ),
        };
      }
      return notImplementedYet(DOMAIN, "list");
    }),

  /** One program with slots, exceptions, weeks and coaches (TR-Program). */
  program: read
    .input(trainingProgramsProgramInputSchema)
    .output(trainingProgramsProgramSchema)
    .query(({ input }) => {
      if (usesDemoData()) return demoProgram(input.programId);
      return notImplementedYet(DOMAIN, "program");
    }),

  /** "Create from a sentence": a reviewable draft; nothing is saved (TR-New). */
  proposeFromSentence: write
    .input(trainingProgramsProposeInputSchema)
    .output(trainingProgramsProposalSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        return { ...demo.proposal, sourceText: input.sentence };
      }
      return notImplementedYet(DOMAIN, "proposeFromSentence");
    }),

  /** Create a draft program and its schedule from a reviewed draft. */
  create: write
    .input(trainingProgramsCreateInputSchema)
    .output(trainingProgramsProgramSchema)
    .mutation(() => {
      if (usesDemoData())
        return demoProgram(trainingProgramsDemoIds.draftProgram);
      return notImplementedYet(DOMAIN, "create");
    }),

  update: write
    .input(trainingProgramsUpdateInputSchema)
    .output(trainingProgramsProgramSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) return demoProgram(input.programId);
      return notImplementedYet(DOMAIN, "update");
    }),

  /** draft → active; generates sessions from the weekly slots. */
  activate: write
    .input(trainingProgramsProgramInputSchema)
    .output(trainingProgramsProgramSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        return { ...demoProgram(input.programId), status: "active" as const };
      }
      return notImplementedYet(DOMAIN, "activate");
    }),

  /** draft | active → cancelled; future sessions are cancelled with the reason. */
  cancel: write
    .input(trainingProgramsCancelInputSchema)
    .output(trainingProgramsProgramSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        return {
          ...demoProgram(input.programId),
          status: "cancelled" as const,
          cancellation: { cancelledAt: NOW, reason: input.reason },
        };
      }
      return notImplementedYet(DOMAIN, "cancel");
    }),

  /** Sessions in a window, for one program or the whole club (TR-Schedule). */
  sessions: read
    .input(trainingProgramsSessionsInputSchema)
    .output(trainingProgramsSessionsSchema)
    .query(({ input }) => {
      if (usesDemoData()) {
        return {
          items: demo.sessions.filter(
            (session) =>
              (!input.programId || session.programId === input.programId) &&
              session.endsAt > input.from &&
              session.startsAt < input.to,
          ),
        };
      }
      return notImplementedYet(DOMAIN, "sessions");
    }),

  /** Add a one-off session or event inside a program (source "manual"). */
  addSession: write
    .input(trainingProgramsAddSessionInputSchema)
    .output(trainingProgramsSessionSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        return {
          ...demoSession(demo.sessions[1]!.id),
          kind: input.kind,
          title: input.title,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          status: "planned" as const,
          source: "manual" as const,
        };
      }
      return notImplementedYet(DOMAIN, "addSession");
    }),

  /** Cancel keeps the session and its reason; notifying goes through Concierge. */
  cancelSession: write
    .input(trainingProgramsCancelSessionInputSchema)
    .output(trainingProgramsSessionSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        return {
          ...demoSession(input.sessionId),
          status: "cancelled" as const,
          cancellation: { cancelledAt: NOW, reason: input.reason },
        };
      }
      return notImplementedYet(DOMAIN, "cancelSession");
    }),

  assignSessionCoaches: write
    .input(trainingProgramsAssignCoachesInputSchema)
    .output(trainingProgramsSessionSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) return demoSession(input.sessionId);
      return notImplementedYet(DOMAIN, "assignSessionCoaches");
    }),

  /** Attach a practice plan, or a focus plus an estimated load, or neither. */
  setSessionPlan: write
    .input(trainingProgramsSetSessionPlanInputSchema)
    .output(trainingProgramsSessionSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) return demoSession(input.sessionId);
      return notImplementedYet(DOMAIN, "setSessionPlan");
    }),

  /** Computed conflicts with suggested resolutions (TR-Schedule). */
  conflicts: read
    .input(trainingProgramsProgramInputSchema)
    .output(trainingProgramsConflictsSchema)
    .query(({ input }) => {
      if (usesDemoData()) {
        return {
          items: demo.conflicts.filter(
            (conflict) => conflict.programId === input.programId,
          ),
        };
      }
      return notImplementedYet(DOMAIN, "conflicts");
    }),

  resolveConflict: write
    .input(trainingProgramsResolveConflictInputSchema)
    .output(trainingProgramsConflictSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        return {
          ...demoConflict(input.conflictId),
          status: "resolved" as const,
          resolution: input.resolution,
        };
      }
      return notImplementedYet(DOMAIN, "resolveConflict");
    }),

  /** After practice: attendance, coach RPE, block outcomes (TR-After). */
  sessionOutcome: read
    .input(sessionInput)
    .output(trainingProgramsOutcomeSchema)
    .query(({ input }) => {
      if (usesDemoData())
        return { ...demo.outcome, sessionId: input.sessionId };
      return notImplementedYet(DOMAIN, "sessionOutcome");
    }),

  recordSessionOutcome: write
    .input(trainingProgramsRecordOutcomeInputSchema)
    .output(trainingProgramsOutcomeSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        return { ...demo.outcome, ...input, recordedAt: NOW };
      }
      return notImplementedYet(DOMAIN, "recordSessionOutcome");
    }),

  /** Practice plans list (Training › Practice plans). */
  practicePlans: read
    .input(trainingProgramsPracticePlansInputSchema)
    .output(trainingProgramsPracticePlansSchema)
    .query(({ input }) => {
      if (usesDemoData()) {
        return {
          items: demo.practicePlanSummaries.filter(
            (plan) => !input.status || plan.status === input.status,
          ),
        };
      }
      return notImplementedYet(DOMAIN, "practicePlans");
    }),

  /** One plan with blocks, assumptions and totals (PP-Builder). */
  practicePlan: read
    .input(trainingProgramsPracticePlanInputSchema)
    .output(trainingProgramsPracticePlanSchema)
    .query(({ input }) => {
      if (usesDemoData()) {
        const summary = demo.practicePlanSummaries.find(
          (plan) => plan.id === input.practicePlanId,
        );
        if (!summary) throw new TRPCError({ code: "NOT_FOUND" });
        return { ...demo.practicePlan, ...summary };
      }
      return notImplementedYet(DOMAIN, "practicePlan");
    }),

  /** Saving makes a new plan version; totals are recomputed by the service. */
  savePracticePlan: write
    .input(trainingProgramsSavePracticePlanInputSchema)
    .output(trainingProgramsPracticePlanSchema)
    .mutation(() => {
      if (usesDemoData()) return demo.practicePlan;
      return notImplementedYet(DOMAIN, "savePracticePlan");
    }),

  /** Duna assumes focus, timing, load, contacts and jumps; nothing is saved. */
  proposePracticePlan: write
    .input(trainingProgramsProposePracticePlanInputSchema)
    .output(trainingProgramsPracticePlanSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        return {
          ...demo.practicePlan,
          status: "draft" as const,
          assumptions: input.assumptions,
        };
      }
      return notImplementedYet(DOMAIN, "proposePracticePlan");
    }),
});

export const trainingProgramsPlayerRouter = router({
  status: protectedProcedure
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),

  /** The programs the signed-in athlete (or their junior) is in. */
  myPrograms: protectedProcedure
    .output(trainingProgramsListSchema)
    .query(() => {
      if (usesDemoData()) {
        return {
          items: demo.summaries.filter((item) => item.status === "active"),
        };
      }
      return notImplementedYet(DOMAIN, "myPrograms");
    }),

  /** The athlete's own sessions in a window, cancellations included. */
  mySchedule: protectedProcedure
    .input(trainingProgramsMyScheduleInputSchema)
    .output(trainingProgramsSessionsSchema)
    .query(({ input }) => {
      if (usesDemoData()) {
        return {
          items: demo.sessions.filter(
            (session) =>
              session.endsAt > input.from && session.startsAt < input.to,
          ),
        };
      }
      return notImplementedYet(DOMAIN, "mySchedule");
    }),
});
