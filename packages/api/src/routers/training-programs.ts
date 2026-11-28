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
 * in demo mode and calls the B4 service in ../services/training-programs/
 * otherwise. Schedule reads need "training:read" (front desk included);
 * plans and after-practice records need "training:write" (the service
 * checks); programs are changed by managers and owners, sessions by them or
 * the program's coaches. See docs/product/training.md.
 */
import {
  trainingProgramsDemo,
  trainingProgramsDemoIds,
} from "@duna/core/demo/training-programs";
import { TRPCError } from "@trpc/server";
import { organizationProcedure, protectedProcedure, router } from "../auth";
import type { ApiActor } from "../context";
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
import { handOffToConcierge } from "../services/concierge/handoff";
import { usesDemoData } from "../services/data-source";
import { organizationTimezone } from "../services/team-availability";
import * as service from "../services/training-programs";
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

function trainingContext(ctx: {
  readonly actor: ApiActor;
  readonly organizationId: string;
  readonly requestId: string;
  readonly now: Date;
  readonly ipAddress?: string;
}): service.TrainingContext {
  return {
    actor: ctx.actor,
    organizationId: ctx.organizationId,
    requestId: ctx.requestId,
    now: ctx.now,
    ...(ctx.ipAddress ? { ipAddress: ctx.ipAddress } : {}),
  };
}

function requireActor(actor: ApiActor | undefined): ApiActor {
  if (!actor) throw new TRPCError({ code: "UNAUTHORIZED" });
  return actor;
}

export const trainingProgramsOperatorRouter = router({
  status: read
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),

  /** Programs list (Training › Programs). */
  list: read
    .input(trainingProgramsListInputSchema)
    .output(trainingProgramsListSchema)
    .query(async ({ input, ctx }) => {
      if (usesDemoData()) {
        return {
          items: demo.summaries.filter(
            (item) => !input.status || item.status === input.status,
          ),
        };
      }
      return service.listPrograms(trainingContext(ctx), input);
    }),

  /** One program with slots, exceptions, weeks and coaches (TR-Program). */
  program: read
    .input(trainingProgramsProgramInputSchema)
    .output(trainingProgramsProgramSchema)
    .query(async ({ input, ctx }) => {
      if (usesDemoData()) return demoProgram(input.programId);
      return service.programDetail(trainingContext(ctx), input.programId);
    }),

  /** "Create from a sentence": a reviewable draft; nothing is saved (TR-New). */
  proposeFromSentence: write
    .input(trainingProgramsProposeInputSchema)
    .output(trainingProgramsProposalSchema)
    .mutation(async ({ input, ctx }) => {
      if (usesDemoData()) {
        return { ...demo.proposal, sourceText: input.sentence };
      }
      return service.proposeFromSentence(
        trainingContext(ctx),
        input.sentence,
        await organizationTimezone(ctx.organizationId),
      );
    }),

  /** Create a draft program and its schedule from a reviewed draft. */
  create: write
    .input(trainingProgramsCreateInputSchema)
    .output(trainingProgramsProgramSchema)
    .mutation(async ({ input, ctx }) => {
      if (usesDemoData())
        return demoProgram(trainingProgramsDemoIds.draftProgram);
      return service.createProgram(trainingContext(ctx), input);
    }),

  update: write
    .input(trainingProgramsUpdateInputSchema)
    .output(trainingProgramsProgramSchema)
    .mutation(async ({ input, ctx }) => {
      if (usesDemoData()) return demoProgram(input.programId);
      return service.updateProgram(trainingContext(ctx), input);
    }),

  /** draft → active; generates sessions from the weekly slots. */
  activate: write
    .input(trainingProgramsProgramInputSchema)
    .output(trainingProgramsProgramSchema)
    .mutation(async ({ input, ctx }) => {
      if (usesDemoData()) {
        return { ...demoProgram(input.programId), status: "active" as const };
      }
      return service.activateProgram(trainingContext(ctx), input.programId);
    }),

  /** draft | active → cancelled; future sessions are cancelled with the reason. */
  cancel: write
    .input(trainingProgramsCancelInputSchema)
    .output(trainingProgramsProgramSchema)
    .mutation(async ({ input, ctx }) => {
      if (usesDemoData()) {
        return {
          ...demoProgram(input.programId),
          status: "cancelled" as const,
          cancellation: { cancelledAt: NOW, reason: input.reason },
        };
      }
      const program = await service.cancelProgram(trainingContext(ctx), input);
      // B7: "notify athletes" prepares a Concierge Send review in the
      // program's thread; a person confirms it there. Only for the call that
      // cancelled (a repeat cancel prepares nothing new).
      if (
        !input.notifyAthletes ||
        program.cancellation?.cancelledAt !== ctx.now.toISOString()
      )
        return program;
      const conciergeDraft = await handOffToConcierge({
        actor: ctx.actor,
        organizationId: ctx.organizationId,
        source: "training-programs.cancel",
        contextType: "league",
        contextId: program.id,
        label: program.title,
        suggestedText: `${program.title} is cancelled. ${input.reason.trim()}`,
        kind: "operational",
        requestId: ctx.requestId,
        now: ctx.now,
      });
      return conciergeDraft ? { ...program, conciergeDraft } : program;
    }),

  /** Sessions in a window, for one program or the whole club (TR-Schedule). */
  sessions: read
    .input(trainingProgramsSessionsInputSchema)
    .output(trainingProgramsSessionsSchema)
    .query(async ({ input, ctx }) => {
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
      return service.listSessions(trainingContext(ctx), input);
    }),

  /** Add a one-off session or event inside a program (source "manual"). */
  addSession: write
    .input(trainingProgramsAddSessionInputSchema)
    .output(trainingProgramsSessionSchema)
    .mutation(async ({ input, ctx }) => {
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
      return service.addSession(trainingContext(ctx), input);
    }),

  /** Cancel keeps the session and its reason; notifying goes through Concierge. */
  cancelSession: write
    .input(trainingProgramsCancelSessionInputSchema)
    .output(trainingProgramsSessionSchema)
    .mutation(async ({ input, ctx }) => {
      if (usesDemoData()) {
        return {
          ...demoSession(input.sessionId),
          status: "cancelled" as const,
          cancellation: { cancelledAt: NOW, reason: input.reason },
        };
      }
      const session = await service.cancelSession(trainingContext(ctx), input);
      if (
        !input.notifyAthletes ||
        !session.programId ||
        session.cancellation?.cancelledAt !== ctx.now.toISOString()
      )
        return session;
      const when = new Intl.DateTimeFormat("en-US", {
        timeZone: session.timezone,
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(session.startsAt));
      const conciergeDraft = await handOffToConcierge({
        actor: ctx.actor,
        organizationId: ctx.organizationId,
        source: "training-programs.cancelSession",
        contextType: "league",
        contextId: session.programId,
        suggestedText: `${session.title} on ${when} is cancelled. ${input.reason.trim()}`,
        kind: "operational",
        requestId: ctx.requestId,
        now: ctx.now,
      });
      return conciergeDraft ? { ...session, conciergeDraft } : session;
    }),

  assignSessionCoaches: write
    .input(trainingProgramsAssignCoachesInputSchema)
    .output(trainingProgramsSessionSchema)
    .mutation(async ({ input, ctx }) => {
      if (usesDemoData()) return demoSession(input.sessionId);
      return service.assignSessionCoaches(trainingContext(ctx), input);
    }),

  /** Attach a practice plan, or a focus plus an estimated load, or neither. */
  setSessionPlan: write
    .input(trainingProgramsSetSessionPlanInputSchema)
    .output(trainingProgramsSessionSchema)
    .mutation(async ({ input, ctx }) => {
      if (usesDemoData()) return demoSession(input.sessionId);
      return service.setSessionPlan(trainingContext(ctx), input);
    }),

  /** Computed conflicts with suggested resolutions (TR-Schedule). */
  conflicts: read
    .input(trainingProgramsProgramInputSchema)
    .output(trainingProgramsConflictsSchema)
    .query(async ({ input, ctx }) => {
      if (usesDemoData()) {
        return {
          items: demo.conflicts.filter(
            (conflict) => conflict.programId === input.programId,
          ),
        };
      }
      return service.listConflicts(trainingContext(ctx), input.programId);
    }),

  resolveConflict: write
    .input(trainingProgramsResolveConflictInputSchema)
    .output(trainingProgramsConflictSchema)
    .mutation(async ({ input, ctx }) => {
      if (usesDemoData()) {
        return {
          ...demoConflict(input.conflictId),
          status: "resolved" as const,
          resolution: input.resolution,
        };
      }
      return service.resolveConflict(trainingContext(ctx), input);
    }),

  /** After practice: attendance, coach RPE, block outcomes (TR-After). */
  sessionOutcome: read
    .input(sessionInput)
    .output(trainingProgramsOutcomeSchema)
    .query(async ({ input, ctx }) => {
      if (usesDemoData())
        return { ...demo.outcome, sessionId: input.sessionId };
      return service.sessionOutcome(trainingContext(ctx), input.sessionId);
    }),

  recordSessionOutcome: write
    .input(trainingProgramsRecordOutcomeInputSchema)
    .output(trainingProgramsOutcomeSchema)
    .mutation(async ({ input, ctx }) => {
      if (usesDemoData()) {
        return { ...demo.outcome, ...input, recordedAt: NOW };
      }
      return service.recordSessionOutcome(trainingContext(ctx), input);
    }),

  /** Practice plans list (Training › Practice plans). */
  practicePlans: read
    .input(trainingProgramsPracticePlansInputSchema)
    .output(trainingProgramsPracticePlansSchema)
    .query(async ({ input, ctx }) => {
      if (usesDemoData()) {
        return {
          items: demo.practicePlanSummaries.filter(
            (plan) => !input.status || plan.status === input.status,
          ),
        };
      }
      return service.listPracticePlans(trainingContext(ctx), input);
    }),

  /** One plan with blocks, assumptions and totals (PP-Builder). */
  practicePlan: read
    .input(trainingProgramsPracticePlanInputSchema)
    .output(trainingProgramsPracticePlanSchema)
    .query(async ({ input, ctx }) => {
      if (usesDemoData()) {
        const summary = demo.practicePlanSummaries.find(
          (plan) => plan.id === input.practicePlanId,
        );
        if (!summary) throw new TRPCError({ code: "NOT_FOUND" });
        return { ...demo.practicePlan, ...summary };
      }
      return service.practicePlanDetail(
        trainingContext(ctx),
        input.practicePlanId,
      );
    }),

  /** Saving makes a new plan version; totals are recomputed by the service. */
  savePracticePlan: write
    .input(trainingProgramsSavePracticePlanInputSchema)
    .output(trainingProgramsPracticePlanSchema)
    .mutation(async ({ input, ctx }) => {
      if (usesDemoData()) return demo.practicePlan;
      return service.savePracticePlan(trainingContext(ctx), input);
    }),

  /** Duna assumes focus, timing, load, contacts and jumps; nothing is saved. */
  proposePracticePlan: write
    .input(trainingProgramsProposePracticePlanInputSchema)
    .output(trainingProgramsPracticePlanSchema)
    .mutation(async ({ input, ctx }) => {
      if (usesDemoData()) {
        return {
          ...demo.practicePlan,
          status: "draft" as const,
          assumptions: input.assumptions,
        };
      }
      return service.proposePracticePlan(trainingContext(ctx), input);
    }),
});

export const trainingProgramsPlayerRouter = router({
  status: protectedProcedure
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),

  /** The programs the signed-in athlete (or their junior) is in. */
  myPrograms: protectedProcedure
    .output(trainingProgramsListSchema)
    .query(async ({ ctx }) => {
      if (usesDemoData()) {
        return {
          items: demo.summaries.filter((item) => item.status === "active"),
        };
      }
      return service.myPrograms(requireActor(ctx.actor), ctx.now);
    }),

  /** The athlete's own sessions in a window, cancellations included. */
  mySchedule: protectedProcedure
    .input(trainingProgramsMyScheduleInputSchema)
    .output(trainingProgramsSessionsSchema)
    .query(async ({ input, ctx }) => {
      if (usesDemoData()) {
        return {
          items: demo.sessions.filter(
            (session) =>
              session.endsAt > input.from && session.startsAt < input.to,
          ),
        };
      }
      return service.mySchedule(requireActor(ctx.actor), input);
    }),
});
