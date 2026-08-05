import { describe, expect, it } from "vitest";
import {
  complementaryPredictionPrice,
  predictionCreditsToMicros,
  predictionDisplayPriceBps,
  predictionExecutionPrices,
  predictionOrderCostMicros,
  predictionOrderSharesMicros,
  predictionOrdersCross,
  predictionSideCostMicros,
  predictionSettlementPayoutMicros,
} from "./prediction-market";

describe("prediction market math", () => {
  it("prices complementary positions to a fully funded 100% pair", () => {
    expect(complementaryPredictionPrice(6_700)).toBe(3_300);
    expect(
      predictionOrdersCross({
        yesLimitPriceBps: 6_700,
        noLimitPriceBps: 3_300,
      }),
    ).toBe(true);
    expect(
      predictionOrdersCross({
        yesLimitPriceBps: 6_600,
        noLimitPriceBps: 3_300,
      }),
    ).toBe(false);
  });

  it("lets a member allocate one credit at any supported market price", () => {
    const stakeMicros = predictionCreditsToMicros(1);
    const sharesMicros = predictionOrderSharesMicros({
      stakeMicros,
      limitPriceBps: 6_700,
    });
    expect(sharesMicros).toBe(1_492);
    expect(
      predictionOrderCostMicros({ sharesMicros, priceBps: 6_700 }),
    ).toBeLessThanOrEqual(stakeMicros);
  });

  it("executes at the resting order's complementary price", () => {
    expect(
      predictionExecutionPrices({ makerSide: "no", makerLimitPriceBps: 3_400 }),
    ).toEqual({ yesPriceBps: 6_600, noPriceBps: 3_400 });
  });

  it("keeps both sides fully collateralized through integer rounding", () => {
    const sharesMicros = 3_030;
    const yesCost = predictionSideCostMicros({
      sharesMicros,
      side: "yes",
      sidePriceBps: 6_700,
    });
    const noCost = predictionSideCostMicros({
      sharesMicros,
      side: "no",
      sidePriceBps: 3_300,
    });
    expect(yesCost).toBe(2_030);
    expect(noCost).toBe(1_000);
    expect(yesCost + noCost).toBe(sharesMicros);
  });

  it("uses the midpoint for a tight book and the last trade for a wide spread", () => {
    expect(
      predictionDisplayPriceBps({
        bestAskBps: 5_300,
        bestBidBps: 5_100,
        lastTradeBps: 4_900,
      }),
    ).toBe(5_200);
    expect(
      predictionDisplayPriceBps({
        bestAskBps: 7_000,
        bestBidBps: 4_000,
        lastTradeBps: 4_900,
      }),
    ).toBe(4_900);
  });

  it("pays one prediction credit per winning share and zero to the loser", () => {
    expect(
      predictionSettlementPayoutMicros({
        positionSide: "yes",
        resolvedSide: "yes",
        sharesMicros: 12_500,
      }),
    ).toBe(12_500);
    expect(
      predictionSettlementPayoutMicros({
        positionSide: "no",
        resolvedSide: "yes",
        sharesMicros: 12_500,
      }),
    ).toBe(0);
  });
});
