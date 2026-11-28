import {
  setupDemo,
  setupDemoFailureReasons,
  setupDemoIds,
} from "@duna/core/demo/setup";
import {
  setupFailureMessages,
  setupFailureReasons,
} from "../services/setup/failure-reasons";
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

  it("demo mode covers the procedures added by B1 (cancel, bulk keep)", async () => {
    const setup = caller();
    const reading = await setup.cancelRun({ runId: setupDemoIds.readingRun });
    expect(setupRunSchema.parse(reading).status).toBe("cancelled");
    const review = await setup.cancelRun({ runId: setupDemoIds.reviewRun });
    expect(review.status).toBe("review");
    const { proposals } = await setup.decideGroup({
      runId: setupDemoIds.reviewRun,
      category: "contact",
      decision: "kept",
    });
    // A conflicting phone is never bulk-kept: the person picks one.
    expect(
      proposals.find((p) => p.fieldKey === "contact.phone")?.decision,
    ).toBe("pending");
  });

  it("outside demo mode, a website read without keys is honestly not configured", async () => {
    dataSource.demo = false;
    vi.stubEnv("FIRECRAWL_API_KEY", "");
    vi.stubEnv("FIRECRAWL_API", "");
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    vi.stubEnv("VERCEL_AI_GATEWAY_API_KEY", "");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
    const error = await caller()
      .startRun({
        sourceKind: "website",
        sourceUrl: "https://club-fixture.club",
      })
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(isNotImplementedYet(error)).toBe(false);
  });
});

describe("every failure a person can act on has a fixture and plain words", () => {
  it("one failed demo run per failure reason", () => {
    expect([...setupDemoFailureReasons].sort()).toEqual(
      [...setupFailureReasons].sort(),
    );
    expectCoverage(
      setupFailureReasons,
      setupDemo.runs.flatMap((r) =>
        "failureReason" in r && r.failureReason ? [r.failureReason] : [],
      ),
    );
    for (const reason of setupFailureReasons) {
      expect(setupFailureMessages[reason]).toMatch(/^[A-Z].+\.$/);
      expect(setupFailureMessages[reason]).not.toMatch(
        /firecrawl|vercel|neon|openai/i,
      );
    }
  });
});
