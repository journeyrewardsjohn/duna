import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { healthSampleInputSchema } from "./contracts";
import {
  computeHealthCorrelations,
  decryptHealthPayload,
  encryptHealthPayload,
  healthAccessAllows,
  healthGrantAllows,
  metricCategory,
} from "./health-service";

const previousKey = process.env.HEALTH_DATA_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.HEALTH_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
    "base64",
  );
});

afterEach(() => {
  if (previousKey === undefined) delete process.env.HEALTH_DATA_ENCRYPTION_KEY;
  else process.env.HEALTH_DATA_ENCRYPTION_KEY = previousKey;
});

describe("Duna Health encryption", () => {
  it("round-trips sensitive values without exposing them in ciphertext", () => {
    const encrypted = encryptHealthPayload({ value: 147, unit: "count/min" });
    expect(encrypted.encryptedPayload).not.toContain("147");
    expect(decryptHealthPayload(encrypted)).toEqual({
      value: 147,
      unit: "count/min",
    });
  });

  it("rejects a tampered authentication tag", () => {
    const encrypted = encryptHealthPayload({ value: 58, unit: "ms" });
    expect(() =>
      decryptHealthPayload({
        ...encrypted,
        authTag: Buffer.alloc(16).toString("base64"),
      }),
    ).toThrow();
  });

  it("keeps wearable and app source attribution inside encrypted payloads", () => {
    const source = {
      bundleIdentifier: "com.whoop.ios",
      name: "WHOOP",
      version: "5.0",
      device: { manufacturer: "WHOOP", model: "MG" },
    };
    const encrypted = encryptHealthPayload({
      value: 51,
      unit: "ms",
      source,
    });

    expect(encrypted.encryptedPayload).not.toContain("WHOOP");
    expect(decryptHealthPayload(encrypted)).toEqual({
      value: 51,
      unit: "ms",
      source,
    });
  });
});

describe("Duna Health authorization", () => {
  const now = new Date("2026-08-04T12:00:00.000Z");
  const future = new Date("2026-09-04T12:00:00.000Z");

  it("denies an expired, revoked, mismatched, or stale-relationship grant", () => {
    const base = {
      audienceKind: "player" as const,
      audiencePersonId: "viewer",
      viewerPersonId: "viewer",
      expiresAt: future,
      relationshipActive: true,
      now,
    };
    expect(healthGrantAllows(base)).toBe(true);
    expect(healthGrantAllows({ ...base, viewerPersonId: "other" })).toBe(false);
    expect(healthGrantAllows({ ...base, relationshipActive: false })).toBe(
      false,
    );
    expect(healthGrantAllows({ ...base, revokedAt: now })).toBe(false);
    expect(healthGrantAllows({ ...base, expiresAt: now })).toBe(false);
  });

  it("never returns a video overlay without heart plus overlay scope", () => {
    expect(healthAccessAllows(undefined, "heart", "video-overlay")).toBe(false);
    expect(
      healthAccessAllows(
        { owner: false, categories: ["heart"], scopes: ["summary"] },
        "heart",
        "video-overlay",
      ),
    ).toBe(false);
    expect(
      healthAccessAllows(
        { owner: false, categories: ["heart"], scopes: ["video-overlay"] },
        "heart",
        "video-overlay",
      ),
    ).toBe(true);
  });
});

describe("Duna Health inputs and insights", () => {
  it("rejects a quantity without a value and an inverted sample window", () => {
    const result = healthSampleInputSchema.safeParse({
      externalId: "41a181e8-8103-49f4-bdeb-a71e693295f2",
      metric: "heart-rate",
      kind: "quantity",
      startedAt: "2026-08-04T12:00:00.000Z",
      endedAt: "2026-08-04T11:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("keeps metrics inside their consent category", () => {
    expect(metricCategory("heart-rate")).toBe("heart");
    expect(metricCategory("sleep")).toBe("recovery");
    expect(metricCategory("workout")).toBe("activity");
    expect(metricCategory("weight")).toBe("body");
  });

  it("requires at least five matches before reporting a correlation", () => {
    const contexts = Array.from({ length: 8 }, (_, index) => ({
      matchId: `41a181e8-8103-49f4-bdeb-a71e693295${10 + index}`,
      label: `Match ${index + 1}`,
      occurredAt: new Date(Date.UTC(2026, 6, index + 1)).toISOString(),
      result: index % 2 === 0 ? ("won" as const) : ("lost" as const),
      sleepHours: index % 2 === 0 ? 8 : 5.5,
    }));
    expect(computeHealthCorrelations(contexts.slice(0, 4))).toEqual([]);
    const result = computeHealthCorrelations(contexts);
    expect(result[0]?.metric).toBe("sleep-hours");
    expect(result[0]?.sampleSize).toBe(8);
    expect(result[0]?.interpretation).toContain("association");
  });
});
