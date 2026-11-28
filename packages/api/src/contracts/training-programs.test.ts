import { trainingProgramsDemo } from "@duna/core/demo/training-programs";
import {
  trainingContentStatusEnum,
  trainingEstimateSources,
  trainingEventCoachRoles,
  trainingEventKindEnum,
  trainingEventStatusEnum,
  trainingProgramCoachRoles,
  trainingProgramExceptionKinds,
  trainingProgramWeekPhases,
} from "@duna/db/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiContext, createDemoActor } from "../context";
import { createCaller } from "../router";
import { isNotImplementedYet } from "../routers/not-implemented";
import {
  trainingProgramsBlockKinds,
  trainingProgramsConflictKinds,
  trainingProgramsConflictResolutions,
  trainingProgramsConflictSchema,
  trainingProgramsConflictStatuses,
  trainingProgramsOutcomeSchema,
  trainingProgramsPracticePlanSchema,
  trainingProgramsPracticePlanSummarySchema,
  trainingProgramsProgramSchema,
  trainingProgramsProgramStatuses,
  trainingProgramsProgramSummarySchema,
  trainingProgramsProposalSchema,
  trainingProgramsSessionSchema,
  trainingProgramsSessionSources,
} from "./training-programs";
import { expectCoverage } from "./w3-test-support";

const dataSource = vi.hoisted(() => ({ demo: true }));
vi.mock("../services/data-source", () => ({
  usesDemoData: () => dataSource.demo,
}));

const demo = trainingProgramsDemo;

describe("training-programs contract and demo fixtures (W3-0)", () => {
  it("every fixture parses against its contract", () => {
    for (const item of demo.summaries)
      trainingProgramsProgramSummarySchema.parse(item);
    trainingProgramsProgramSchema.parse(demo.program);
    trainingProgramsProgramSchema.parse(demo.cancelledProgram);
    trainingProgramsProposalSchema.parse(demo.proposal);
    for (const session of demo.sessions)
      trainingProgramsSessionSchema.parse(session);
    for (const conflict of demo.conflicts)
      trainingProgramsConflictSchema.parse(conflict);
    trainingProgramsOutcomeSchema.parse(demo.outcome);
    for (const plan of demo.practicePlanSummaries)
      trainingProgramsPracticePlanSummarySchema.parse(plan);
    trainingProgramsPracticePlanSchema.parse(demo.practicePlan);
  });

  it("covers every state of every state machine", () => {
    expectCoverage(
      trainingProgramsProgramStatuses,
      demo.summaries.map((item) => item.status),
    );
    expectCoverage(
      trainingEventStatusEnum.enumValues,
      demo.sessions.map((session) => session.status),
    );
    expectCoverage(
      trainingEventKindEnum.enumValues,
      demo.sessions.map((session) => session.kind),
    );
    expectCoverage(
      trainingProgramsSessionSources.filter(
        (source) => source !== "catalog" && source !== "imported",
      ),
      demo.sessions.map((session) => session.source),
    );
    expectCoverage(
      ["plan", "focus", "none"],
      demo.sessions.map((session) => session.plan.mode),
    );
    expectCoverage(
      trainingEventCoachRoles,
      demo.sessions.flatMap((session) => session.coaches.map((c) => c.role)),
    );
    expectCoverage(
      trainingProgramCoachRoles,
      demo.program.coaches.map((coach) => coach.role),
    );
    expectCoverage(
      trainingProgramExceptionKinds,
      demo.program.exceptions.map((exception) => exception.kind),
    );
    expectCoverage(
      trainingProgramWeekPhases,
      demo.program.weeks.map((week) => week.phase),
    );
    expectCoverage(trainingEstimateSources, [
      ...demo.practicePlan.blocks.map((block) => block.estimateSource),
      ...demo.sessions.flatMap((session) =>
        session.plan.mode === "focus" ? [session.plan.loadEstimateSource] : [],
      ),
    ]);
    expectCoverage(
      trainingProgramsBlockKinds,
      demo.practicePlan.blocks.map((block) => block.kind),
    );
    expectCoverage(
      trainingContentStatusEnum.enumValues,
      demo.practicePlanSummaries.map((plan) => plan.status),
    );
    expectCoverage(
      trainingProgramsConflictKinds,
      demo.conflicts.map((conflict) => conflict.kind),
    );
    expectCoverage(
      trainingProgramsConflictStatuses,
      demo.conflicts.map((conflict) => conflict.status),
    );
    expectCoverage(
      trainingProgramsConflictResolutions,
      demo.conflicts.flatMap((conflict) => conflict.suggestedResolutions),
    );
  });
});

describe("training-programs routers in demo and connected mode (W3-0 stubs)", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    dataSource.demo = true;
  });

  const caller = () =>
    createCaller(createApiContext({ actor: createDemoActor() }));

  it("serves fixtures in demo mode", async () => {
    const operator = caller().operator.trainingPrograms;
    const { items } = await operator.list({});
    expect(items).toHaveLength(5);
    const program = await operator.program({ programId: items[0]!.id });
    expect(program.weeklySlots.length).toBeGreaterThan(0);
    const sessions = await operator.sessions({
      programId: program.id,
      from: "2026-11-30T00:00:00.000Z",
      to: "2026-12-31T00:00:00.000Z",
    });
    expect(sessions.items.length).toBeGreaterThan(5);
    const cancelled = await operator.cancelSession({
      sessionId: sessions.items[0]!.id,
      reason: "Rain",
      notifyAthletes: false,
    });
    expect(cancelled).toMatchObject({ status: "cancelled" });
    const plan = await operator.practicePlan({
      practicePlanId: demo.practicePlan.id,
    });
    expect(plan.totals.touches).toBeGreaterThan(0);
    const schedule = await caller().player.trainingPrograms.mySchedule({
      from: "2026-11-30T00:00:00.000Z",
      to: "2026-12-31T00:00:00.000Z",
    });
    expect(schedule.items.length).toBeGreaterThan(0);
  });

  it("says 'not implemented yet' outside demo mode", async () => {
    dataSource.demo = false;
    const error = await caller()
      .operator.trainingPrograms.list({})
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(isNotImplementedYet(error)).toBe(true);
  });
});
