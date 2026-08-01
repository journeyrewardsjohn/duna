import { describe, expect, it } from "vitest";
import { connectAccountMoneyReady, retryDelayMilliseconds } from "./workflows";

describe("durable workflow retry policy", () => {
  it("backs off exponentially and caps at fifteen minutes", () => {
    expect(retryDelayMilliseconds(1)).toBe(5_000);
    expect(retryDelayMilliseconds(2)).toBe(10_000);
    expect(retryDelayMilliseconds(3)).toBe(20_000);
    expect(retryDelayMilliseconds(20)).toBe(15 * 60_000);
  });

  it("rejects invalid attempt counters", () => {
    expect(() => retryDelayMilliseconds(0)).toThrow("positive integer");
    expect(() => retryDelayMilliseconds(1.5)).toThrow("positive integer");
  });
});

describe("connected-account money readiness", () => {
  it("supports legacy accounts that can accept connected charges", () => {
    expect(connectAccountMoneyReady({ charges_enabled: true })).toBe(true);
  });

  it("supports Accounts v2 recipients that can receive transfers and payouts", () => {
    expect(
      connectAccountMoneyReady({
        charges_enabled: false,
        payouts_enabled: true,
        capabilities: { transfers: "active" },
      }),
    ).toBe(true);
  });

  it("keeps incomplete recipient onboarding gated", () => {
    expect(
      connectAccountMoneyReady({
        charges_enabled: false,
        payouts_enabled: false,
        capabilities: { transfers: "pending" },
      }),
    ).toBe(false);
  });
});
