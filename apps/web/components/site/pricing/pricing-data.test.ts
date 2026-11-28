import {
  DUNA_SERVICE_FEE_BPS,
  MEMBERSHIP_PLANS,
  ORGANIZATION_PLANS,
} from "@duna/core";
import { describe, expect, it } from "vitest";
import {
  calculateBooking,
  clubPlanCards,
  dollars,
  organizationFeeLine,
  playerPlanCards,
  processingTerms,
} from "./pricing-data";

describe("pricing figures come from the plan tables", () => {
  it("prints every club plan's prices and fee from ORGANIZATION_PLANS", () => {
    const cards = clubPlanCards((id) => `/sign-up/${id}`);
    expect(cards.map((card) => card.id)).toEqual(
      Object.keys(ORGANIZATION_PLANS),
    );
    for (const card of cards) {
      const plan =
        ORGANIZATION_PLANS[card.id as keyof typeof ORGANIZATION_PLANS];
      expect(card.name).toBe(plan.name);
      expect(card.monthlyMinor).toBe(plan.monthlyPriceMinor);
      expect(card.annualMinor).toBe(plan.annualPriceMinor);
      expect(card.feeLine).toBe(organizationFeeLine(plan.defaultCommissionBps));
    }
  });

  it("prints every player plan from MEMBERSHIP_PLANS and the service fee rate", () => {
    const cards = playerPlanCards("/premium", "/sign-up");
    for (const card of cards) {
      const plan = MEMBERSHIP_PLANS[card.id as keyof typeof MEMBERSHIP_PLANS];
      expect(card.monthlyMinor).toBe(plan.monthlyPriceMinor);
      expect(card.annualMinor).toBe(plan.annualPriceMinor);
      expect(card.feeLine).toBe(
        plan.transactionFeeWaived
          ? "No service fee on bookings"
          : `${DUNA_SERVICE_FEE_BPS / 100}% service fee on bookings`,
      );
    }
  });

  it("formats whole and fractional dollars", () => {
    expect(dollars(0)).toBe("$0");
    expect(dollars(19_900)).toBe("$199");
    expect(dollars(999)).toBe("$9.99");
    expect(dollars(199_000)).toBe("$1,990");
  });

  it("reads the processing estimates from the fee functions", () => {
    expect(processingTerms()).toEqual({
      card: "3% + $0.35",
      bank: "1%, capped at $6",
    });
  });
});

describe("the booking calculator uses the real fee composition", () => {
  it("adds the service fee for the player and takes the plan fee and processing from the club", () => {
    const result = calculateBooking({
      priceMinor: 4_000,
      planId: "coach",
      premium: false,
      tender: "online-card",
    });
    const serviceFee = Math.round((4_000 * DUNA_SERVICE_FEE_BPS) / 10_000);
    const planFee = Math.round(
      (4_000 * ORGANIZATION_PLANS.coach.defaultCommissionBps) / 10_000,
    );
    expect(result.serviceFeeMinor).toBe(serviceFee);
    expect(result.playerPaysMinor).toBe(4_000 + serviceFee);
    expect(result.organizationFeeMinor).toBe(planFee);
    expect(result.paidOutMinor).toBe(4_000 - planFee - result.processingMinor);
  });

  it("drops the service fee with Premium and the plan fee on Scale", () => {
    const result = calculateBooking({
      priceMinor: 4_000,
      planId: "club",
      premium: true,
      tender: "ach",
    });
    expect(result.serviceFeeMinor).toBe(0);
    expect(result.playerPaysMinor).toBe(4_000);
    expect(result.organizationFeeMinor).toBe(
      Math.round(
        (4_000 * ORGANIZATION_PLANS.club.defaultCommissionBps) / 10_000,
      ),
    );
    expect(result.processingMinor).toBe(40);
  });

  it("never pays out a negative amount", () => {
    const result = calculateBooking({
      priceMinor: 0,
      planId: "coach",
      premium: false,
      tender: "online-card",
    });
    expect(result.paidOutMinor).toBe(0);
    expect(result.playerPaysMinor).toBe(0);
  });
});
