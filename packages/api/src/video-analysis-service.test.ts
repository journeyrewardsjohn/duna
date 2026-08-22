import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiActor } from "./context";
import { executeIdempotent, MemoryIdempotencyStore } from "./idempotency";

const databaseDoubles = vi.hoisted(() => ({
  getDatabase: vi.fn(),
}));

vi.mock("@duna/db", async (importOriginal) => {
  const database = await importOriginal<typeof import("@duna/db")>();
  return { ...database, getDatabase: databaseDoubles.getDatabase };
});

import { reviewVisionImprovementProposal } from "./video-analysis-service";

const actor: ApiActor = {
  personId: "11111111-1111-4111-8111-111111111111",
  displayName: "Vision Steward",
  roles: ["super-admin"],
  scopes: ["*"],
  ageBand: "adult" as const,
  isDemo: false,
};
const proposalId = "22222222-2222-4222-8222-222222222222";

function reviewDatabase() {
  const returned = [
    "33333333-3333-4333-8333-333333333333",
    "44444444-4444-4444-8444-444444444444",
  ];
  const returning = vi.fn(() =>
    Promise.resolve([{ id: returned.shift() ?? crypto.randomUUID() }]),
  );
  const reviewValues = vi.fn(() => ({ returning }));
  const auditValues = vi.fn().mockResolvedValue(undefined);
  const insert = vi
    .fn()
    .mockReturnValueOnce({ values: reviewValues })
    .mockReturnValueOnce({ values: auditValues })
    .mockReturnValueOnce({ values: reviewValues })
    .mockReturnValueOnce({ values: auditValues });
  return {
    query: {
      visionImprovementProposals: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: proposalId, status: "succeeded" }),
      },
    },
    insert,
    reviewValues,
    auditValues,
  };
}

describe("Vision improvement proposal review ledger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://test:test@localhost:5432/duna_test",
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("appends approval and rejection records and audits both without training", async () => {
    const database = reviewDatabase();
    databaseDoubles.getDatabase.mockReturnValue(database);
    const now = new Date("2026-08-21T12:00:00.000Z");

    await expect(
      reviewVisionImprovementProposal({
        actor,
        proposalId,
        decision: "approved",
        notes: "Approved as a bounded evaluation-design question only.",
        requestId: crypto.randomUUID(),
        now,
      }),
    ).resolves.toMatchObject({ decision: "approved" });
    await expect(
      reviewVisionImprovementProposal({
        actor,
        proposalId,
        decision: "rejected",
        notes: "Rejected for this slice; no model state changed.",
        requestId: crypto.randomUUID(),
        now,
      }),
    ).resolves.toMatchObject({ decision: "rejected" });

    expect(database.reviewValues).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ decision: "approved", createdAt: now }),
    );
    expect(database.reviewValues).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ decision: "rejected", createdAt: now }),
    );
    expect(database.auditValues).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        action: "vision-improvement-proposal.reviewed",
        reason: expect.stringContaining("no training or promotion occurred"),
      }),
    );
    expect(database.auditValues).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        action: "vision-improvement-proposal.reviewed",
        reason: expect.stringContaining("no training or promotion occurred"),
      }),
    );
  });

  it("executes one ledger append when the mutation idempotency key is replayed", async () => {
    const database = reviewDatabase();
    databaseDoubles.getDatabase.mockReturnValue(database);
    const store = new MemoryIdempotencyStore();
    let executions = 0;
    const invoke = () =>
      executeIdempotent({
        key: "55555555-5555-4555-8555-555555555555",
        procedure: "admin.reviewVisionImprovementProposal",
        request: { proposalId, decision: "approved" },
        now: new Date("2026-08-21T12:00:00.000Z"),
        store,
        execute: async () => {
          executions += 1;
          return reviewVisionImprovementProposal({
            actor,
            proposalId,
            decision: "approved",
            notes: "Approved as a bounded evaluation-design question only.",
            requestId: crypto.randomUUID(),
            now: new Date("2026-08-21T12:00:00.000Z"),
          });
        },
      });

    const first = await invoke();
    const replay = await invoke();
    expect(first.result).toEqual(replay.result);
    expect(replay.replayed).toBe(true);
    expect(executions).toBe(1);
    expect(database.reviewValues).toHaveBeenCalledOnce();
    expect(database.auditValues).toHaveBeenCalledOnce();
  });
});
