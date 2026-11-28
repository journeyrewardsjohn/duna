import { describe, expect, it } from "vitest";
import { disputeCaseStatus, disputeFee } from "./disputes";
import {
  allocateProportionally,
  refundSplit,
  type RefundableSale,
} from "./refund-fees";

const sale: RefundableSale = {
  grossMinor: 5_000 + 300 + 400,
  itemsMinor: 5_000,
  serviceFeeMinor: 300,
  organizationFeeMinor: 125,
  processingFeeMinor: 180,
  taxMinor: 400,
};

function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
}

describe("refund fee rules (terms §9.4)", () => {
  it("pro-rata: what the refund executor does today", () => {
    const split = refundSplit({
      sale,
      itemsRefundedMinor: 5_000,
      cause: "player",
      rule: "pro-rata",
    });
    expect(split).toEqual({
      playerRefundMinor: 5_700,
      clubBearsMinor: 5_000 - 125 - 180,
      applicationFeeRefundedMinor: 300 + 125 + 180,
      serviceFeeKeptMinor: 0,
      taxRefundedMinor: 400,
    });
  });

  it("policy: club cancels → everything back, Organization Fee returned, club bears processing", () => {
    const split = refundSplit({
      sale,
      itemsRefundedMinor: 5_000,
      cause: "club",
      rule: "policy",
    });
    expect(split.playerRefundMinor).toBe(5_700);
    expect(split.clubBearsMinor).toBe(5_000 - 125);
    expect(split.serviceFeeKeptMinor).toBe(0);
  });

  it("policy: player cancels within policy → Duna keeps the Service Fee", () => {
    const split = refundSplit({
      sale,
      itemsRefundedMinor: 5_000,
      cause: "player",
      rule: "policy",
    });
    expect(split.playerRefundMinor).toBe(5_400);
    expect(split.serviceFeeKeptMinor).toBe(300);
    expect(split.clubBearsMinor).toBe(4_875);
  });

  it("policy: Duna's error → Duna bears the processing cost", () => {
    const split = refundSplit({
      sale,
      itemsRefundedMinor: 5_000,
      cause: "duna-error",
      rule: "policy",
    });
    expect(split.playerRefundMinor).toBe(5_700);
    expect(split.clubBearsMinor).toBe(5_000 - 125 - 180);
  });

  it("rejects impossible sales and refunds", () => {
    expect(() =>
      refundSplit({
        sale: { ...sale, taxMinor: 1 },
        itemsRefundedMinor: 1,
        cause: "club",
        rule: "policy",
      }),
    ).toThrow();
    expect(() =>
      refundSplit({
        sale,
        itemsRefundedMinor: 5_001,
        cause: "club",
        rule: "policy",
      }),
    ).toThrow();
    expect(() =>
      refundSplit({
        sale,
        itemsRefundedMinor: -1,
        cause: "club",
        rule: "policy",
      }),
    ).toThrow();
  });

  it("every split balances, and a split refund never creates or loses a cent", () => {
    const next = random(11);
    for (let run = 0; run < 2_000; run += 1) {
      const items = 1 + Math.floor(next() * 100_000);
      const service = Math.floor(next() * 2_000);
      const tax = Math.floor(next() * 5_000);
      const organizationFee = Math.floor(next() * items * 0.05);
      const processing = Math.floor(next() * (items - organizationFee) * 0.05);
      const s: RefundableSale = {
        grossMinor: items + service + tax,
        itemsMinor: items,
        serviceFeeMinor: service,
        organizationFeeMinor: organizationFee,
        processingFeeMinor: processing,
        taxMinor: tax,
      };
      const rule = next() < 0.5 ? "pro-rata" : "policy";
      const cause = (["club", "player", "duna-error"] as const)[
        Math.floor(next() * 3)
      ]!;
      const refunded = Math.floor(next() * items);
      const split = refundSplit({
        sale: s,
        itemsRefundedMinor: refunded,
        cause,
        rule,
      });
      expect(split.playerRefundMinor).toBe(
        split.clubBearsMinor +
          split.applicationFeeRefundedMinor +
          split.taxRefundedMinor,
      );
      expect(split.clubBearsMinor).toBeGreaterThanOrEqual(0);
      expect(split.playerRefundMinor).toBeLessThanOrEqual(s.grossMinor);
      // Refunding in parts allocates exactly the amount refunded.
      const parts = 1 + Math.floor(next() * 6);
      const pieces = allocateProportionally(
        refunded,
        Array.from({ length: parts }, () => 1 + Math.floor(next() * 10)),
      );
      expect(pieces.reduce((sum, piece) => sum + piece, 0)).toBe(refunded);
      expect(pieces.every((piece) => piece >= 0)).toBe(true);
    }
  });
});

describe("dispute mapping", () => {
  it("maps processor statuses, keeping Duna's submitted and accepted states", () => {
    expect(disputeCaseStatus("needs_response")).toBe("needs-response");
    expect(disputeCaseStatus("warning_needs_response")).toBe("needs-response");
    expect(disputeCaseStatus("under_review")).toBe("under-review");
    expect(disputeCaseStatus("under_review", "evidence-submitted")).toBe(
      "evidence-submitted",
    );
    expect(disputeCaseStatus("won")).toBe("won");
    expect(disputeCaseStatus("lost")).toBe("lost");
    expect(disputeCaseStatus("lost", "accepted")).toBe("accepted");
    expect(disputeCaseStatus("warning_closed")).toBe("warning-closed");
  });

  it("reads the dispute fee and whether it came back", () => {
    expect(disputeFee([{ fee: 1_500 }])).toEqual({
      feeMinor: 1_500,
      feeReturned: false,
    });
    expect(disputeFee([{ fee: 1_500 }, { fee: -1_500 }])).toEqual({
      feeMinor: 1_500,
      feeReturned: true,
    });
    expect(disputeFee(undefined)).toEqual({ feeMinor: 0, feeReturned: false });
  });
});
