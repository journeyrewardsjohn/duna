import { describe, expect, it } from "vitest";
import type { HealthTimelineEntry } from "./contracts";
import { buildHealthIntelligence } from "./health-intelligence";

const timezone = "America/New_York";
const source = {
  bundleIdentifier: "com.apple.health",
  name: "Apple Watch",
  productType: "Watch7,4",
};

function dateAt(daysAgo: number, hour: number, minute = 0): Date {
  const date = new Date("2026-08-05T12:00:00.000Z");
  date.setUTCDate(date.getUTCDate() - daysAgo);
  date.setUTCHours(hour, minute, 0, 0);
  return date;
}

function quantity(input: {
  readonly id: number;
  readonly daysAgo: number;
  readonly metric:
    "heart-rate-variability" | "resting-heart-rate" | "heart-rate";
  readonly value: number;
  readonly hour?: number;
}): HealthTimelineEntry {
  const at = dateAt(input.daysAgo, input.hour ?? 11);
  return {
    id: `41a181e8-8103-49f4-bdeb-a71e6932${String(input.id).padStart(4, "0")}`,
    metric: input.metric,
    category: "heart",
    kind: "quantity",
    startedAt: at.toISOString(),
    endedAt: at.toISOString(),
    value: input.value,
    unit: input.metric === "heart-rate-variability" ? "ms" : "count/min",
    source,
  };
}

function sleep(input: {
  readonly id: number;
  readonly daysAgo: number;
  readonly categoryValue:
    | "asleep-unspecified"
    | "asleep-core"
    | "asleep-deep"
    | "asleep-rem"
    | "awake";
  readonly startHour: number;
  readonly durationMinutes: number;
}): HealthTimelineEntry {
  const startedAt = dateAt(input.daysAgo, input.startHour);
  const endedAt = new Date(
    startedAt.getTime() + input.durationMinutes * 60_000,
  );
  return {
    id: `51a181e8-8103-49f4-bdeb-a71e6932${String(input.id).padStart(4, "0")}`,
    metric: "sleep",
    category: "recovery",
    kind: "category",
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    categoryValue: input.categoryValue,
    source,
  };
}

describe("personalized Duna readiness", () => {
  it("uses rolling personal HRV and resting-heart-rate baselines", () => {
    const samples: HealthTimelineEntry[] = [];
    for (let day = 1; day <= 35; day += 1) {
      samples.push(
        quantity({
          id: day,
          daysAgo: day,
          metric: "heart-rate-variability",
          value: day <= 6 ? 72 : 60 + (day % 3),
        }),
        quantity({
          id: 100 + day,
          daysAgo: day,
          metric: "resting-heart-rate",
          value: day <= 3 ? 50 : 54 + (day % 2),
        }),
        sleep({
          id: 200 + day,
          daysAgo: day,
          categoryValue: "asleep-unspecified",
          startHour: 3,
          durationMinutes: 420,
        }),
      );
    }
    const result = buildHealthIntelligence({
      samples,
      timezone,
      now: new Date("2026-08-05T12:00:00.000Z"),
    });

    expect(result.readiness.score).toBeGreaterThan(7);
    expect(result.readiness.confidence).toBe("medium");
    expect(
      result.readiness.factors.find((factor) => factor.id === "hrv-balance")
        ?.status,
    ).toBe("supporting");
    expect(
      result.trends.find((trend) => trend.metric === "hrv-sdnn"),
    ).toMatchObject({ unit: "ms SDNN" });
  });

  it("learns sleep duration from the athlete instead of enforcing eight hours", () => {
    const samples = Array.from({ length: 25 }, (_, index) =>
      sleep({
        id: 400 + index,
        daysAgo: index + 1,
        categoryValue: "asleep-unspecified",
        startHour: 4,
        durationMinutes: index === 0 ? 375 : 360 + (index % 3) * 5,
      }),
    );
    const result = buildHealthIntelligence({
      samples,
      timezone,
      now: new Date("2026-08-05T12:00:00.000Z"),
    });
    const sleepFactor = result.readiness.factors.find(
      (factor) => factor.id === "sleep-quality",
    );

    expect(result.sleep?.durationHours).toBeCloseTo(6.3, 1);
    expect(sleepFactor?.score).toBeGreaterThanOrEqual(7);
    expect(sleepFactor?.summary).not.toContain("8");
  });

  it("prefers stage detail without double-counting an overlapping asleep total", () => {
    const samples = [
      sleep({
        id: 501,
        daysAgo: 1,
        categoryValue: "asleep-unspecified",
        startHour: 3,
        durationMinutes: 420,
      }),
      sleep({
        id: 502,
        daysAgo: 1,
        categoryValue: "asleep-core",
        startHour: 3,
        durationMinutes: 220,
      }),
      sleep({
        id: 503,
        daysAgo: 1,
        categoryValue: "asleep-deep",
        startHour: 6,
        durationMinutes: 80,
      }),
      sleep({
        id: 504,
        daysAgo: 1,
        categoryValue: "asleep-rem",
        startHour: 8,
        durationMinutes: 100,
      }),
      sleep({
        id: 505,
        daysAgo: 1,
        categoryValue: "awake",
        startHour: 7,
        durationMinutes: 20,
      }),
    ];
    const result = buildHealthIntelligence({
      samples,
      timezone,
      now: new Date("2026-08-05T12:00:00.000Z"),
    });

    // Overlap between the stage intervals is unioned instead of counted twice.
    expect(result.sleep?.durationHours).toBeCloseTo(6, 1);
    expect(result.sleep?.coreMinutes).toBe(220);
    expect(result.sleep?.deepMinutes).toBe(80);
    expect(result.sleep?.remMinutes).toBe(100);
    expect(result.sleep?.estimateNote).toContain("not clinical");
  });

  it("does not invent a score when no usable signal exists", () => {
    const result = buildHealthIntelligence({
      samples: [],
      timezone,
      now: new Date("2026-08-05T12:00:00.000Z"),
    });

    expect(result.readiness.score).toBeUndefined();
    expect(result.readiness.label).toBe("limited-data");
    expect(result.readiness.recommendation).toBeUndefined();
  });

  it("does not mix a sparse second wearable into the dominant HRV baseline", () => {
    const samples = Array.from({ length: 30 }, (_, index) =>
      quantity({
        id: 600 + index,
        daysAgo: index + 1,
        metric: "heart-rate-variability",
        value: 58 + (index % 3),
      }),
    );
    samples.push({
      ...quantity({
        id: 699,
        daysAgo: 1,
        metric: "heart-rate-variability",
        value: 140,
      }),
      source: {
        bundleIdentifier: "com.whoop.ios",
        name: "WHOOP",
        productType: "WHOOP MG",
      },
    });
    const result = buildHealthIntelligence({
      samples,
      timezone,
      now: new Date("2026-08-05T12:00:00.000Z"),
    });
    const hrv = result.readiness.factors.find(
      (factor) => factor.id === "hrv-balance",
    );

    expect(hrv?.summary).not.toContain("140");
    expect(hrv?.score).toBeLessThan(8.5);
  });

  it("follows a recent wearable after an athlete changes devices", () => {
    const appleHistory = Array.from({ length: 45 }, (_, index) =>
      quantity({
        id: 700 + index,
        daysAgo: index + 45,
        metric: "heart-rate-variability",
        value: 58 + (index % 2),
      }),
    );
    const whoopHistory = Array.from({ length: 12 }, (_, index) => ({
      ...quantity({
        id: 800 + index,
        daysAgo: index + 1,
        metric: "heart-rate-variability" as const,
        value: 82 + (index % 2),
      }),
      source: {
        bundleIdentifier: "com.whoop.ios",
        name: "WHOOP",
        productType: "WHOOP MG",
      },
    }));
    const result = buildHealthIntelligence({
      samples: [...appleHistory, ...whoopHistory],
      timezone,
      now: new Date("2026-08-05T12:00:00.000Z"),
    });
    const hrvTrend = result.trends.find((trend) => trend.metric === "hrv-sdnn");

    expect(hrvTrend?.latest).toBe(82);
    expect(hrvTrend?.average).toBeGreaterThan(75);
  });

  it("does not present stale history as today's readiness", () => {
    const samples = Array.from({ length: 20 }, (_, index) => [
      quantity({
        id: 900 + index,
        daysAgo: index + 15,
        metric: "heart-rate-variability" as const,
        value: 60 + (index % 3),
      }),
      quantity({
        id: 950 + index,
        daysAgo: index + 15,
        metric: "resting-heart-rate" as const,
        value: 54 + (index % 2),
      }),
    ]).flat();
    const result = buildHealthIntelligence({
      samples,
      timezone,
      now: new Date("2026-08-05T12:00:00.000Z"),
    });

    expect(result.readiness.date).toBe("2026-07-21");
    expect(result.readiness.score).toBeUndefined();
    expect(result.readiness.summary).toContain(
      "will not present an old reading",
    );
  });
});
