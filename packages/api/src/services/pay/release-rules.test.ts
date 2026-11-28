import { describe, expect, it } from "vitest";
import {
  addBusinessDays,
  businessDaysBetween,
  isBusinessDay,
  usFederalHolidays,
} from "./business-days";
import { deliveryRuleFor, productKindFor } from "./delivery-rules";
import {
  DEFAULT_PAY_POLICY_SETTINGS,
  loadPayPolicySettings,
  mergePayPolicySettings,
} from "./policy-settings";
import {
  basisPointShare,
  computeReleasePlan,
  splitEvenly,
  type ReleaseContext,
  type ReleaseEvent,
  type ReleaseObligation,
} from "./release-rules";

const policy = DEFAULT_PAY_POLICY_SETTINGS;
const context: ReleaseContext = { policy, obligationHeld: false };
const at = (iso: string) => new Date(iso);

function obligation(
  overrides: Partial<ReleaseObligation> = {},
): ReleaseObligation {
  return {
    id: "ob-1",
    deliveryRule: "scheduled-end",
    proceedsMinor: 10_000,
    refundedProceedsMinor: 0,
    disputedMinor: 0,
    createdAt: at("2026-12-01T10:00:00Z"),
    settledAt: at("2026-12-03T00:00:00Z"),
    deliveryStartsAt: at("2026-12-10T17:00:00Z"),
    deliveryEndsAt: at("2026-12-10T18:00:00Z"),
    released: [],
    ...overrides,
  };
}

/** Small deterministic PRNG for property-style checks. */
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
}

describe("business days", () => {
  it("knows the observed US federal holidays", () => {
    const holidays = usFederalHolidays(2026);
    expect(holidays.has("2026-11-26")).toBe(true); // Thanksgiving
    expect(holidays.has("2026-12-25")).toBe(true);
    expect(holidays.has("2026-07-03")).toBe(true); // 4 July is a Saturday
    expect(usFederalHolidays(2027).has("2027-12-31")).toBe(true); // 2028 New Year observed
    expect(isBusinessDay(at("2026-11-27T12:00:00Z"))).toBe(true);
    expect(isBusinessDay(at("2026-11-28T12:00:00Z"))).toBe(false);
  });

  it("adds business days across weekends and holidays", () => {
    // Wednesday 25 Nov + 3 business days skips Thanksgiving and the weekend.
    expect(addBusinessDays(at("2026-11-25T15:00:00Z"), 3).toISOString()).toBe(
      "2026-12-01T15:00:00.000Z",
    );
    expect(addBusinessDays(at("2026-11-25T15:00:00Z"), 0).toISOString()).toBe(
      "2026-11-25T15:00:00.000Z",
    );
    expect(() => addBusinessDays(new Date(), -1)).toThrow();
    expect(
      businessDaysBetween(
        at("2026-11-25T00:00:00Z"),
        at("2026-12-01T00:00:00Z"),
      ),
    ).toBe(3);
  });
});

describe("policy settings", () => {
  it("keeps valid overrides and drops invalid ones field by field", () => {
    const merged = mergePayPolicySettings({
      creditReserveBps: 1500,
      payoutBusinessDays: -2,
      unknownKey: 1,
    });
    expect(merged.settings.creditReserveBps).toBe(1500);
    expect(merged.settings.payoutBusinessDays).toBe(3);
    expect(merged.rejected.sort()).toEqual([
      "payoutBusinessDays",
      "unknownKey",
    ]);
  });

  it("defaults to daily payouts and reads the environment override", () => {
    expect(loadPayPolicySettings({}).defaultPayoutInterval).toBe("daily");
    expect(
      loadPayPolicySettings({
        DUNA_PAY_POLICY_JSON: JSON.stringify({ firstPayoutDelayDays: 3 }),
      }).firstPayoutDelayDays,
    ).toBe(3);
    expect(
      loadPayPolicySettings({ DUNA_PAY_POLICY_JSON: "{not json" })
        .firstPayoutDelayDays,
    ).toBe(7);
  });
});

describe("delivery rules (payout-policy §4)", () => {
  const line = { itemKind: "catalog-service", sessionCount: 0 } as const;
  it.each([
    [
      { ...line, catalogType: "service", catalogSubtype: "court-rental" },
      "scheduled-end",
    ],
    [
      { ...line, catalogType: "service", catalogSubtype: "private-lesson" },
      "scheduled-end",
    ],
    [
      { ...line, catalogType: "event", catalogSubtype: "clinic" },
      "scheduled-end",
    ],
    [
      {
        ...line,
        catalogType: "event",
        catalogSubtype: "tournament",
        deliveryStartsAt: at("2026-12-11T08:00:00Z"),
        deliveryEndsAt: at("2026-12-13T18:00:00Z"),
      },
      "event-last-day",
    ],
    [
      {
        ...line,
        catalogType: "event",
        catalogSubtype: "tournament",
        deliveryStartsAt: at("2026-12-01T08:00:00Z"),
        deliveryEndsAt: at("2026-12-20T18:00:00Z"),
      },
      "pro-rata-weekly",
    ],
    [
      {
        ...line,
        catalogType: "event",
        catalogSubtype: "league",
        sessionCount: 8,
      },
      "pro-rata-sessions",
    ],
    [
      {
        ...line,
        catalogType: "service",
        catalogSubtype: "program",
        sessionCount: 6,
      },
      "pro-rata-sessions",
    ],
    [
      {
        ...line,
        catalogType: "service",
        catalogSubtype: "program",
        deliveryStartsAt: at("2026-12-01T00:00:00Z"),
        deliveryEndsAt: at("2027-02-01T00:00:00Z"),
      },
      "pro-rata-weekly",
    ],
    [
      { ...line, catalogType: "plan", catalogSubtype: "membership" },
      "membership-period",
    ],
    [
      { ...line, catalogType: "plan", catalogSubtype: "credit-pack" },
      "credit-pack-reserve",
    ],
    [
      { ...line, catalogType: "plan", catalogSubtype: "bundle" },
      "credit-pack-reserve",
    ],
    [
      { ...line, catalogType: "good", catalogSubtype: "apparel" },
      "goods-fulfilment",
    ],
    [
      { ...line, catalogType: "good", catalogSubtype: "digital-content" },
      "instant",
    ],
    [
      {
        ...line,
        catalogType: "service",
        catalogSubtype: "private-lesson",
        paymentMethod: "card-present",
      },
      "instant",
    ],
    [{ itemKind: "booking", sessionCount: 0 }, "scheduled-end"],
    [{ itemKind: "catalog-plan", sessionCount: 0 }, "membership-period"],
    [{ itemKind: "mystery", sessionCount: 0 }, "scheduled-end"],
  ] as const)("%o → %s", (input, rule) => {
    expect(deliveryRuleFor(input, policy)).toBe(rule);
  });

  it("names the product kind", () => {
    expect(productKindFor({ itemKind: "booking", sessionCount: 0 })).toBe(
      "service/court-rental",
    );
    expect(
      productKindFor({
        itemKind: "catalog-good",
        catalogType: "good",
        catalogSubtype: "apparel",
        sessionCount: 0,
      }),
    ).toBe("good/apparel");
  });
});

describe("integer splitting", () => {
  it("never creates or loses a cent", () => {
    const next = random(7);
    for (let run = 0; run < 2_000; run += 1) {
      const total = Math.floor(next() * 1_000_000);
      const parts = 1 + Math.floor(next() * 40);
      const shares = splitEvenly(total, parts);
      expect(shares.reduce((sum, share) => sum + share, 0)).toBe(total);
      expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1);
    }
    expect(basisPointShare(999, 2500)).toBe(249);
    expect(() => splitEvenly(-1, 2)).toThrow();
    expect(() => splitEvenly(10, 0)).toThrow();
    expect(() => basisPointShare(10, 10_001)).toThrow();
  });
});

describe("one-time bookings (scheduled-end)", () => {
  const ended: ReleaseEvent = {
    kind: "booking-ended",
    occurredAt: at("2026-12-10T18:00:00Z"),
  };

  it("waits for delivery even when the end time has passed", () => {
    const plan = computeReleasePlan(
      obligation(),
      [],
      context,
      at("2026-12-11T00:00:00Z"),
    );
    expect(plan.tranches).toHaveLength(1);
    expect(plan.tranches[0]!.status).toBe("scheduled");
    expect(plan.releasableMinor).toBe(0);
    expect(plan.status).toBe("awaiting-delivery");
    expect(plan.nextReleaseAt?.toISOString()).toBe("2026-12-10T18:00:00.000Z");
  });

  it("releases on settlement + delivery, never before the session ended", () => {
    const before = computeReleasePlan(
      obligation(),
      [ended],
      context,
      at("2026-12-10T17:59:00Z"),
    );
    expect(before.releasableMinor).toBe(0);
    const after = computeReleasePlan(
      obligation(),
      [ended],
      context,
      at("2026-12-10T18:00:00Z"),
    );
    expect(after.tranches[0]!.status).toBe("releasable");
    expect(after.releasableMinor).toBe(10_000);
  });

  it("does not release unsettled money", () => {
    const plan = computeReleasePlan(
      obligation({ settledAt: undefined }),
      [ended],
      context,
      at("2026-12-11T00:00:00Z"),
    );
    expect(plan.tranches[0]!.status).toBe("delivered");
    expect(plan.status).toBe("pending-settlement");
  });

  it("releases nothing for a cancelled session", () => {
    const plan = computeReleasePlan(
      obligation(),
      [
        { kind: "delivery-cancelled", occurredAt: at("2026-12-09T17:00:00Z") },
        ended,
      ],
      context,
      at("2026-12-12T00:00:00Z"),
    );
    expect(plan.tranches[0]!.status).toBe("cancelled");
    expect(plan.releasableMinor).toBe(0);
    expect(plan.status).toBe("cancelled");
    const refunded = computeReleasePlan(
      obligation({ refundedProceedsMinor: 10_000 }),
      [{ kind: "delivery-cancelled", occurredAt: at("2026-12-09T17:00:00Z") }],
      context,
      at("2026-12-12T00:00:00Z"),
    );
    expect(refunded.status).toBe("refunded");
    expect(refunded.releasableMinor).toBe(0);
  });

  it("honours the first-payout date and holds", () => {
    const delayed = computeReleasePlan(
      obligation(),
      [ended],
      { ...context, firstPayoutNotBefore: at("2026-12-14T00:00:00Z") },
      at("2026-12-12T00:00:00Z"),
    );
    expect(delayed.tranches[0]!.status).toBe("delivered");
    expect(delayed.tranches[0]!.releasableAt?.toISOString()).toBe(
      "2026-12-14T00:00:00.000Z",
    );
    const held = computeReleasePlan(
      obligation(),
      [ended],
      { ...context, obligationHeld: true },
      at("2026-12-12T00:00:00Z"),
    );
    expect(held.tranches[0]!.status).toBe("held");
    expect(held.status).toBe("held");
    const disputed = computeReleasePlan(
      obligation({ disputedMinor: 10_000 }),
      [ended],
      context,
      at("2026-12-12T00:00:00Z"),
    );
    expect(disputed.tranches[0]!.status).toBe("held");
    expect(disputed.status).toBe("disputed");
  });

  it("ignores events from the future", () => {
    const plan = computeReleasePlan(
      obligation(),
      [ended],
      context,
      at("2026-12-10T12:00:00Z"),
    );
    expect(plan.tranches[0]!.status).toBe("scheduled");
  });
});

describe("events and programs", () => {
  it("event-last-day releases the whole entry at the end of the last day", () => {
    const plan = computeReleasePlan(
      obligation({ deliveryRule: "event-last-day" }),
      [{ kind: "booking-ended", occurredAt: at("2026-12-10T18:00:00Z") }],
      context,
      at("2026-12-12T00:00:00Z"),
    );
    // A court booking fact does not deliver a tournament.
    expect(plan.releasableMinor).toBe(0);
    const delivered = computeReleasePlan(
      obligation({ deliveryRule: "event-last-day" }),
      [
        {
          kind: "event-last-day-ended",
          occurredAt: at("2026-12-10T18:00:00Z"),
        },
      ],
      context,
      at("2026-12-12T00:00:00Z"),
    );
    expect(delivered.releasableMinor).toBe(10_000);
  });

  const sessions = [1, 2, 3].map((week) => ({
    id: `s${week}`,
    endsAt: at(`2026-12-${String(week * 7).padStart(2, "0")}T18:00:00Z`),
  }));
  const program = obligation({
    deliveryRule: "pro-rata-sessions",
    proceedsMinor: 10_000,
    sessions,
  });

  it("releases each session's pro-rata share after that session", () => {
    const plan = computeReleasePlan(
      program,
      [
        {
          kind: "session-ended",
          sessionId: "s1",
          occurredAt: sessions[0]!.endsAt,
        },
        {
          kind: "delivery-cancelled",
          sessionId: "s2",
          occurredAt: at("2026-12-13T00:00:00Z"),
        },
      ],
      context,
      at("2026-12-15T00:00:00Z"),
    );
    expect(plan.tranches.map((tranche) => tranche.baseAmountMinor)).toEqual([
      3_334, 3_333, 3_333,
    ]);
    expect(plan.tranches.map((tranche) => tranche.status)).toEqual([
      "releasable",
      "cancelled",
      "scheduled",
    ]);
    expect(plan.releasableMinor).toBe(3_334);
  });

  it("adds an opted-in start tranche released when the first session ends", () => {
    const plan = computeReleasePlan(
      { ...program, startTrancheBps: 4_000 },
      [
        {
          kind: "session-ended",
          sessionId: "s1",
          occurredAt: sessions[0]!.endsAt,
        },
      ],
      context,
      at("2026-12-08T00:00:00Z"),
    );
    // Capped at the policy's 25%.
    expect(plan.tranches[0]!.kind).toBe("start-tranche");
    expect(plan.tranches[0]!.baseAmountMinor).toBe(2_500);
    expect(plan.tranches.reduce((sum, t) => sum + t.baseAmountMinor, 0)).toBe(
      10_000,
    );
    expect(plan.releasableMinor).toBe(2_500 + 2_500);
  });

  it("falls back to weekly portions without a session schedule", () => {
    const weekly = obligation({
      deliveryRule: "pro-rata-weekly",
      proceedsMinor: 1_000,
      deliveryStartsAt: at("2026-12-01T00:00:00Z"),
      deliveryEndsAt: at("2026-12-22T00:00:00Z"),
    });
    const plan = computeReleasePlan(
      weekly,
      [
        {
          kind: "weekly-portion-elapsed",
          sequence: 0,
          occurredAt: at("2026-12-08T00:00:00Z"),
        },
      ],
      context,
      at("2026-12-09T00:00:00Z"),
    );
    expect(plan.tranches.map((t) => t.baseAmountMinor)).toEqual([
      334, 333, 333,
    ]);
    expect(plan.tranches[2]!.deliveryDueAt?.toISOString()).toBe(
      "2026-12-22T00:00:00.000Z",
    );
    expect(plan.releasableMinor).toBe(334);
    const sessionsMissing = computeReleasePlan(
      { ...weekly, deliveryRule: "pro-rata-sessions", sessions: [] },
      [],
      context,
      at("2026-12-09T00:00:00Z"),
    );
    expect(sessionsMissing.tranches).toHaveLength(3);
  });

  it("cancelling a program mid-way keeps delivered weeks and stops the rest", () => {
    const plan = computeReleasePlan(
      program,
      [
        {
          kind: "session-ended",
          sessionId: "s1",
          occurredAt: sessions[0]!.endsAt,
        },
        { kind: "delivery-cancelled", occurredAt: at("2026-12-10T00:00:00Z") },
        {
          kind: "session-ended",
          sessionId: "s2",
          occurredAt: sessions[1]!.endsAt,
        },
      ],
      context,
      at("2026-12-30T00:00:00Z"),
    );
    expect(plan.tranches.map((t) => t.status)).toEqual([
      "releasable",
      "cancelled",
      "cancelled",
    ]);
    expect(plan.status).toBe("awaiting-delivery");
  });
});

describe("memberships, credit packs, goods and instant sales", () => {
  it("memberships wait for the later of settlement + 3 business days and the refund window", () => {
    const membership = obligation({
      deliveryRule: "membership-period",
      createdAt: at("2026-12-01T10:00:00Z"),
      settledAt: at("2026-12-03T10:00:00Z"),
      refundWindowEndsAt: undefined,
    });
    const received: ReleaseEvent = {
      kind: "membership-payment-received",
      occurredAt: at("2026-12-01T10:00:00Z"),
    };
    const early = computeReleasePlan(
      membership,
      [received],
      context,
      at("2026-12-07T10:00:00Z"),
    );
    expect(early.releasableMinor).toBe(0);
    expect(early.tranches[0]!.releasableAt?.toISOString()).toBe(
      "2026-12-08T10:00:00.000Z",
    );
    const windowed = computeReleasePlan(
      { ...membership, refundWindowEndsAt: at("2026-12-31T10:00:00Z") },
      [received],
      context,
      at("2026-12-20T10:00:00Z"),
    );
    expect(windowed.releasableMinor).toBe(0);
    expect(windowed.tranches[0]!.releasableAt?.toISOString()).toBe(
      "2026-12-31T10:00:00.000Z",
    );
  });

  it("credit packs release on settlement, or per redeemed credit for new clubs", () => {
    const pack = obligation({
      deliveryRule: "credit-pack-reserve",
      proceedsMinor: 1_000,
      creditsGranted: 3,
    });
    const settlement = computeReleasePlan(
      { ...pack, creditRelease: "settlement" },
      [{ kind: "access-granted", occurredAt: pack.createdAt }],
      context,
      at("2026-12-04T00:00:00Z"),
    );
    expect(settlement.releasableMinor).toBe(1_000);
    const redemption = computeReleasePlan(
      { ...pack, creditRelease: "redemption" },
      [
        { kind: "access-granted", occurredAt: pack.createdAt },
        {
          kind: "credit-redeemed",
          credits: 2,
          occurredAt: at("2026-12-05T00:00:00Z"),
        },
        {
          kind: "credit-refunded",
          credits: 1,
          occurredAt: at("2026-12-06T00:00:00Z"),
        },
      ],
      context,
      at("2026-12-07T00:00:00Z"),
    );
    expect(redemption.tranches.map((t) => t.status)).toEqual([
      "releasable",
      "releasable",
      "cancelled",
    ]);
    expect(redemption.releasableMinor).toBe(667);
  });

  it("large credit packs group credits into proportional tranches", () => {
    const plan = computeReleasePlan(
      obligation({
        deliveryRule: "credit-pack-reserve",
        creditRelease: "redemption",
        creditsGranted: 1_000,
        proceedsMinor: 100_000,
      }),
      [
        {
          kind: "credit-redeemed",
          credits: 500,
          occurredAt: at("2026-12-05T00:00:00Z"),
        },
      ],
      context,
      at("2026-12-07T00:00:00Z"),
    );
    expect(plan.tranches).toHaveLength(366);
    // Half the credits redeemed: half the cash, within one tranche's rounding.
    expect(Math.abs(plan.releasableMinor - 50_000)).toBeLessThan(274);
  });

  it("goods release on fulfilment or shipment; instant sales on access", () => {
    const goods = obligation({
      deliveryRule: "goods-fulfilment",
      shipByAt: at("2026-12-31T00:00:00Z"),
    });
    expect(
      computeReleasePlan(goods, [], context, at("2026-12-07T00:00:00Z"))
        .releasableMinor,
    ).toBe(0);
    expect(
      computeReleasePlan(
        goods,
        [{ kind: "goods-shipped", occurredAt: at("2026-12-05T00:00:00Z") }],
        context,
        at("2026-12-07T00:00:00Z"),
      ).releasableMinor,
    ).toBe(10_000);
    expect(
      computeReleasePlan(
        obligation({ deliveryRule: "instant" }),
        [{ kind: "access-granted", occurredAt: at("2026-12-01T10:00:00Z") }],
        context,
        at("2026-12-03T00:00:00Z"),
      ).releasableMinor,
    ).toBe(10_000);
  });
});

describe("refunds and released money", () => {
  const ended: ReleaseEvent = {
    kind: "booking-ended",
    occurredAt: at("2026-12-10T18:00:00Z"),
  };

  it("a partial refund before release reduces what is paid", () => {
    const plan = computeReleasePlan(
      obligation({ refundedProceedsMinor: 2_500 }),
      [ended],
      context,
      at("2026-12-11T00:00:00Z"),
    );
    expect(plan.releasableMinor).toBe(7_500);
    expect(plan.status).toBe("partially-refunded");
  });

  it("released tranches are immutable and a later refund becomes over-released", () => {
    const plan = computeReleasePlan(
      obligation({
        refundedProceedsMinor: 4_000,
        released: [
          {
            sequence: 0,
            amountMinor: 10_000,
            releasedAt: at("2026-12-11T00:00:00Z"),
            payoutId: "po",
          },
        ],
      }),
      [ended],
      context,
      at("2026-12-12T00:00:00Z"),
    );
    expect(plan.tranches[0]!.status).toBe("released");
    expect(plan.tranches[0]!.amountMinor).toBe(10_000);
    expect(plan.overReleasedMinor).toBe(4_000);
    expect(plan.releasableMinor).toBe(0);
  });

  it("refunds come off the latest open portions first", () => {
    const sessions = [1, 2].map((n) => ({
      id: `s${n}`,
      endsAt: at(`2026-12-0${n * 4}T18:00:00Z`),
    }));
    const plan = computeReleasePlan(
      obligation({
        deliveryRule: "pro-rata-sessions",
        sessions,
        refundedProceedsMinor: 6_000,
      }),
      [
        {
          kind: "session-ended",
          sessionId: "s1",
          occurredAt: sessions[0]!.endsAt,
        },
      ],
      context,
      at("2026-12-05T00:00:00Z"),
    );
    expect(plan.tranches.map((t) => [t.amountMinor, t.status])).toEqual([
      [4_000, "releasable"],
      [0, "reversed"],
    ]);
  });

  it("is a released obligation once every open portion is paid", () => {
    const plan = computeReleasePlan(
      obligation({
        released: [
          {
            sequence: 0,
            amountMinor: 10_000,
            releasedAt: at("2026-12-11T00:00:00Z"),
          },
        ],
      }),
      [ended],
      context,
      at("2026-12-12T00:00:00Z"),
    );
    expect(plan.status).toBe("released");
    expect(plan.unreleasedMinor).toBe(0);
  });

  it("rejects corrupt amounts", () => {
    expect(() =>
      computeReleasePlan(
        obligation({ proceedsMinor: -1 }),
        [],
        context,
        new Date(),
      ),
    ).toThrow();
    expect(() =>
      computeReleasePlan(
        obligation({
          released: [{ sequence: 0, amountMinor: 1.5, releasedAt: new Date() }],
        }),
        [],
        context,
        new Date(),
      ),
    ).toThrow();
  });
});

describe("money invariants (property-style)", () => {
  const rules = [
    "scheduled-end",
    "event-last-day",
    "pro-rata-sessions",
    "pro-rata-weekly",
    "membership-period",
    "credit-pack-reserve",
    "goods-fulfilment",
    "instant",
  ] as const;
  const kinds = [
    "booking-ended",
    "session-ended",
    "event-last-day-ended",
    "weekly-portion-elapsed",
    "membership-payment-received",
    "credit-redeemed",
    "credit-refunded",
    "goods-fulfilled",
    "goods-shipped",
    "access-granted",
    "paid-in-person",
    "delivery-cancelled",
  ] as const;

  it("never pays more than is owed, is deterministic, and is order-independent", () => {
    const next = random(42);
    const pick = <T>(list: readonly T[]) =>
      list[Math.floor(next() * list.length)]!;
    for (let run = 0; run < 1_500; run += 1) {
      const base = at("2026-12-01T00:00:00Z").getTime();
      const sessionCount = Math.floor(next() * 6);
      const sessions = Array.from({ length: sessionCount }, (_, index) => ({
        id: `s${index}`,
        endsAt: new Date(base + (index + 1) * 3 * 86_400_000),
      }));
      const proceeds = Math.floor(next() * 50_000);
      const draft = obligation({
        deliveryRule: pick(rules),
        proceedsMinor: proceeds,
        refundedProceedsMinor: Math.floor(next() * proceeds * 1.2),
        disputedMinor: next() < 0.1 ? 100 : 0,
        settledAt: next() < 0.8 ? new Date(base + 86_400_000) : undefined,
        deliveryStartsAt: new Date(base),
        deliveryEndsAt: new Date(base + Math.floor(next() * 60) * 86_400_000),
        sessions,
        startTrancheBps: Math.floor(next() * 3_000),
        creditRelease: next() < 0.5 ? "redemption" : "settlement",
        creditsGranted: 1 + Math.floor(next() * 20),
      });
      const events: ReleaseEvent[] = Array.from(
        { length: Math.floor(next() * 8) },
        (_, index) => ({
          id: `e${index}`,
          kind: pick(kinds),
          occurredAt: new Date(base + Math.floor(next() * 40) * 86_400_000),
          sessionId:
            next() < 0.5 && sessionCount
              ? `s${Math.floor(next() * sessionCount)}`
              : undefined,
          sequence: next() < 0.3 ? Math.floor(next() * 5) : undefined,
          credits: Math.floor(next() * 5),
        }),
      );
      const now = new Date(base + Math.floor(next() * 50) * 86_400_000);
      const plan = computeReleasePlan(draft, events, context, now);
      const owed = Math.max(
        0,
        draft.proceedsMinor - draft.refundedProceedsMinor,
      );
      const assigned = plan.tranches.reduce((sum, t) => sum + t.amountMinor, 0);
      // Splits never create or lose a cent.
      expect(plan.tranches.reduce((sum, t) => sum + t.baseAmountMinor, 0)).toBe(
        draft.proceedsMinor,
      );
      // No path pays a club more than it is owed.
      expect(assigned).toBeLessThanOrEqual(owed);
      expect(plan.releasableMinor + plan.releasedMinor).toBeLessThanOrEqual(
        owed,
      );
      expect(plan.tranches.every((t) => t.amountMinor >= 0)).toBe(true);
      // Cancelled portions and unsettled money release nothing.
      for (const tranche of plan.tranches) {
        if (tranche.status === "releasable") {
          expect(draft.settledAt && draft.settledAt <= now).toBeTruthy();
          expect(tranche.deliveredAt).toBeDefined();
        }
      }
      // Deterministic and independent of event order (replays change nothing).
      const replay = computeReleasePlan(
        draft,
        [...events].reverse().concat(events),
        context,
        now,
      );
      expect(replay).toEqual(plan);

      // Releasing what is releasable never lets a later plan release it again.
      const releasedNow = plan.tranches
        .filter((t) => t.status === "releasable")
        .map((t) => ({
          sequence: t.sequence,
          amountMinor: t.amountMinor,
          releasedAt: now,
        }));
      const after = computeReleasePlan(
        { ...draft, released: releasedNow },
        events,
        context,
        now,
      );
      expect(after.releasableMinor).toBe(0);
      expect(after.releasedMinor + after.unreleasedMinor).toBeLessThanOrEqual(
        Math.max(owed, after.releasedMinor),
      );
    }
  });
});
