import { trainingSceneAiDemo } from "@duna/core/demo/training-scene-ai";
import { trainingSceneAiRunStatuses } from "@duna/db/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiContext, createDemoActor } from "../context";
import { createCaller } from "../router";
import { isNotImplementedYet } from "../routers/not-implemented";
import { trainingSceneAiRunSchema } from "./training-scene-ai";
import { expectCoverage } from "./w3-test-support";

const dataSource = vi.hoisted(() => ({ demo: true }));
vi.mock("../services/data-source", () => ({
  usesDemoData: () => dataSource.demo,
}));

describe("training-scene-ai contract and demo fixtures (W3-0)", () => {
  it("every fixture parses against its contract", () => {
    for (const run of trainingSceneAiDemo.runs)
      trainingSceneAiRunSchema.parse(run);
  });

  it("covers every state of the run state machine", () => {
    expectCoverage(
      trainingSceneAiRunStatuses,
      trainingSceneAiDemo.runs.map((run) => run.status),
    );
  });
});

describe("operator.trainingSceneAi in demo and connected mode (W3-0 stubs)", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    dataSource.demo = true;
  });

  const caller = () =>
    createCaller(createApiContext({ actor: createDemoActor() })).operator
      .trainingSceneAi;

  it("serves fixtures in demo mode", async () => {
    const ai = caller();
    const started = await ai.start({
      prompt: "Three passers and a server, rotate after five serves.",
      idempotencyKey: "demo-scene-ai-1",
    });
    expect(started.status).toBe("queued");
    const { items } = await ai.runs({});
    const ready = items.find((run) => run.status === "ready-for-review")!;
    const accepted = await ai.accept({
      runId: ready.id,
      idempotencyKey: "demo-scene-ai-accept-1",
    });
    expect(accepted.run.status).toBe("accepted");
    await expect(
      ai.accept({
        runId: items[0]!.id,
        idempotencyKey: "demo-scene-ai-accept-2",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("says 'not implemented yet' outside demo mode", async () => {
    dataSource.demo = false;
    const error = await caller()
      .runs({})
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(isNotImplementedYet(error)).toBe(true);
  });
});
