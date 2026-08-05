import { describe, expect, it } from "vitest";
import {
  healthSyncErrorMessage,
  mergeAppleHealthSyncState,
  planHealthUploadBatches,
} from "./health-sync-utils";

describe("planHealthUploadBatches", () => {
  it("keeps large HealthKit imports within the API limit", () => {
    const samples = Array.from({ length: 901 }, (_, index) => ({ index }));
    const deleted = Array.from(
      { length: 405 },
      (_, index) => `deleted-${index}`,
    );

    const batches = planHealthUploadBatches(samples, deleted, 400);

    expect(batches).toHaveLength(3);
    expect(batches.map((batch) => batch.samples.length)).toEqual([
      400, 400, 101,
    ]);
    expect(batches.map((batch) => batch.deletedExternalIds.length)).toEqual([
      400, 5, 0,
    ]);
  });

  it("creates an empty batch so a permission-only connection is recorded", () => {
    expect(planHealthUploadBatches([], [])).toEqual([
      { samples: [], deletedExternalIds: [] },
    ]);
  });
});

describe("healthSyncErrorMessage", () => {
  it("preserves the import checkpoint while the richer protocol rolls out", () => {
    expect(
      healthSyncErrorMessage(
        new Error(
          "Duna Health secure history support is still rolling out. Your import checkpoint was preserved; please try again shortly.",
        ),
      ),
    ).toContain("checkpoint is safe");
  });

  it("turns a missing production procedure into a useful recovery message", () => {
    expect(
      healthSyncErrorMessage(
        new Error("No procedure found on path player.syncHealthSamples"),
      ),
    ).toContain("temporarily unavailable");
  });
});

describe("mergeAppleHealthSyncState", () => {
  it("preserves cumulative historical progress across resumable sessions", () => {
    const first = mergeAppleHealthSyncState({
      categories: ["heart"],
      recordsProcessed: 10_000,
      deletionsProcessed: 2,
      pagesProcessed: 25,
      complete: false,
      remainingMetrics: ["heart-rate"],
      now: "2026-08-04T10:00:00.000Z",
    });
    const second = mergeAppleHealthSyncState({
      previous: first,
      categories: ["heart", "recovery"],
      recordsProcessed: 4_500,
      deletionsProcessed: 0,
      pagesProcessed: 12,
      complete: true,
      now: "2026-08-04T10:05:00.000Z",
    });

    expect(second).toMatchObject({
      categories: ["heart", "recovery"],
      recordsProcessed: 14_500,
      deletionsProcessed: 2,
      pagesProcessed: 37,
      complete: true,
      remainingMetrics: [],
      startedAt: "2026-08-04T10:00:00.000Z",
      updatedAt: "2026-08-04T10:05:00.000Z",
    });
  });
});
