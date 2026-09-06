import { describe, expect, it } from "vitest";
import { tradablePredictionPriceBps } from "./prediction-market-pricing";

describe("tradablePredictionPriceBps", () => {
  it("keeps settled 0% and 100% markets inside the quote boundary", () => {
    expect(tradablePredictionPriceBps(0)).toBe(100);
    expect(tradablePredictionPriceBps(10_000)).toBe(9_900);
    expect(tradablePredictionPriceBps(5_500)).toBe(5_500);
  });
});
