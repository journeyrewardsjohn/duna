import { setupDemo } from "@duna/core/demo/setup";
import {
  setupProposalCategories,
  setupProposalDecisions,
  setupRunOutcomes,
  setupRunPageStatuses,
  setupRunStatuses,
} from "@duna/db/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiContext, createDemoActor } from "../context";
import { createCaller } from "../router";
import { isNotImplementedYet } from "../routers/not-implemented";
import {
  setupProfileSchema,
  setupProposalSchema,
  setupReadinessSchema,
  setupRunSchema,
} from "./setup";
import { expectCoverage } from "./w3-test-support";

// The connected path is simulated by switching only the data-source rule;
// sign-in and organisation checks still run in demo mode (no database).
const dataSource = vi.hoisted(() => ({ demo: true }));
vi.mock("../services/data-source", () => ({
  usesDemoData: () => dataSource.demo,
}));

describe("setup contract and demo fixtures (W3-0)", () => {
  it("every fixture parses against its contract", () => {
    setupProfileSchema.parse(setupDemo.profile);
    setupReadinessSchema.parse(setupDemo.readiness);
    for (const run of setupDemo.runs) setupRunSchema.parse(run);
    for (const proposal of setupDemo.proposals)
      setupProposalSchema.parse(proposal);
  });

  it("covers every state of every state machine", () => {
    expectCoverage(
      setupRunStatuses,
      setupDemo.runs.map((r) => r.status),
    );
    expectCoverage(
      setupRunOutcomes,
      setupDemo.runs.flatMap((r) =>
        "outcome" in r && r.outcome ? [r.outcome] : [],
      ),
    );
    expectCoverage(
      setupRunPageStatuses,
      setupDemo.runs.flatMap((r) => r.pages.map((p) => p.status)),
    );
    expectCoverage(
      setupProposalCategories,
      setupDemo.proposals.map((p) => p.category),
    );
    expectCoverage(
      setupProposalDecisions,
      setupDemo.proposals.map((p) => p.decision),
    );
  });
});

describe("operator.setup in demo mode and connected mode (W3-0 stubs)", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    dataSource.demo = true;
  });

  const caller = () =>
    createCaller(createApiContext({ actor: createDemoActor() })).operator.setup;

  it("serves fixtures in demo mode", async () => {
    const setup = caller();
    const run = await setup.latestRun();
    expect(run?.status).toBe("review");
    const { proposals } = await setup.proposals({ runId: run!.id });
    expect(proposals.length).toBeGreaterThan(5);
    await expect(setup.profile()).resolves.toMatchObject({
      organizationId: setupDemo.profile.organizationId,
    });
    await expect(setup.readiness()).resolves.toMatchObject({ total: 9 });
  });

  it("says 'not implemented yet' outside demo mode", async () => {
    dataSource.demo = false;
    const error = await caller()
      .profile()
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(isNotImplementedYet(error)).toBe(true);
  });
});
