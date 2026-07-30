import { describe, expect, it } from "vitest";
import { retryDelayMilliseconds } from "./workflows";

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
