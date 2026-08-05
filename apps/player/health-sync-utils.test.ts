import { describe, expect, it } from "vitest";
import {
  healthSyncErrorMessage,
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
  it("turns a missing production procedure into a useful recovery message", () => {
    expect(
      healthSyncErrorMessage(
        new Error("No procedure found on path player.syncHealthSamples"),
      ),
    ).toContain("temporarily unavailable");
  });
});
