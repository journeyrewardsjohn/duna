import { describe, expect, it } from "vitest";
import {
  PARTICIPATION_POLICY,
  PARTICIPATION_PRESETS,
  classifyRuleChange,
  lateCancellationCharge,
  matchParticipationPreset,
  participationReservePerPlayer,
  participationRevenueCliffs,
  participationPreset,
  perPlayerPrice,
  readParticipationRuleV2,
  resolveParticipationRuleV2,
  resolveParticipationRules,
  serializeParticipationRule,
  splitCostTiers,
  suggestParticipationCliffFix,
  validateParticipationRuleV2,
  type ParticipationRuleV2,
} from "./index";
import { readParticipationRules } from "../participation";

// 289's own ladder: 1 · 3, 2–6 · 2, 7+ · 1 (illustrative credits).
const ladder289 = [
  { minParticipants: 1, maxParticipants: 1, creditsPerPlayer: 3 },
  { minParticipants: 2, maxParticipants: 6, creditsPerPlayer: 2 },
  { minParticipants: 7, creditsPerPlayer: 1 },
];

describe("validation messages (exact words from the spec)", () => {
  it("refuses a minimum above capacity", () => {
    expect(
      validateParticipationRuleV2({ minParticipants: 5 }, { capacity: 4 })
        .issues,
    ).toEqual([
      "The minimum (5) can't be more than the 4 players a session holds.",
    ]);
    expect(
      validateParticipationRuleV2(
        { minParticipants: 3, unit: "team" },
        { capacity: 2 },
      ).issues,
    ).toEqual([
      "The minimum (3) can't be more than the 2 teams a session holds.",
    ]);
  });

  it("refuses a lock after the start", () => {
    expect(
      validateParticipationRuleV2(
        { minParticipants: 2, lockMinutesBeforeStart: -30 },
        { capacity: 4 },
      ).issues,
    ).toEqual(["We need to decide before the session starts."]);
  });

  it("refuses a rising per-player price", () => {
    expect(
      validateParticipationRuleV2(
        {
          tiers: [
            { minParticipants: 1, maxParticipants: 1, creditsPerPlayer: 2 },
            { minParticipants: 2, maxParticipants: 4, creditsPerPlayer: 3 },
          ],
        },
        { capacity: 4 },
      ).issues,
    ).toEqual(["The 2-player price can't be higher than the 1-player price."]);
  });

  it("names a gap in the ladder", () => {
    expect(
      validateParticipationRuleV2(
        {
          minParticipants: 2,
          tiers: [
            { minParticipants: 2, maxParticipants: 4, creditsPerPlayer: 3 },
            { minParticipants: 6, maxParticipants: 8, creditsPerPlayer: 2 },
          ],
        },
        { capacity: 8 },
      ).issues,
    ).toEqual([
      "Prices must cover every group size from 2 to 8. 5 is missing.",
    ]);
  });

  it("names an overlap", () => {
    expect(
      validateParticipationRuleV2(
        {
          minParticipants: 2,
          tiers: [
            { minParticipants: 2, maxParticipants: 6, creditsPerPlayer: 3 },
            { minParticipants: 6, maxParticipants: 8, creditsPerPlayer: 2 },
          ],
        },
        { capacity: 8 },
      ).issues,
    ).toEqual(["Two prices cover 6 players."]);
  });

  it("refuses attendance pricing on a new save (decision 2)", () => {
    expect(
      validateParticipationRuleV2(
        { minParticipants: 2, settlementBasis: "attendance" },
        { capacity: 4 },
      ).issues,
    ).toEqual([
      "Prices are now fixed when the group is decided. Attendance no longer changes the price.",
    ]);
  });

  it("refuses a ladder and a split together, and ladders on the club default", () => {
    expect(
      validateParticipationRuleV2(
        { tiers: ladder289, splitCostMinor: 6000 },
        { capacity: 8 },
      ).issues,
    ).toContain("Choose a price ladder or a cost to split, not both.");
    expect(
      validateParticipationRuleV2(
        { minParticipants: 3, tiers: ladder289 },
        { forClubDefault: true },
      ).issues,
    ).toEqual([
      "Prices by group size are set on each offering, not the club default.",
    ]);
  });

  it("keeps the 289 rule that the credit price is the highest rung", () => {
    expect(
      validateParticipationRuleV2(
        { tiers: ladder289 },
        { capacity: 8, allowCredits: true, creditCost: 2 },
      ).issues,
    ).toEqual([
      "Set the credit price to 3 credits, the highest price. Players reserve that amount and get the difference back.",
    ]);
  });

  it("warns, never blocks, on a revenue cliff (289's 7th player: 12 → 7)", () => {
    const result = validateParticipationRuleV2(
      { tiers: ladder289 },
      { capacity: 8, allowCredits: true, creditCost: 3 },
    );
    expect(result.issues).toEqual([]);
    expect(result.warnings.map((warning) => warning.message)).toEqual([
      "A 7th player lowers your total from 12 to 7 credits.",
    ]);
    expect(PARTICIPATION_POLICY.revenueCliffIsWarning).toBe(true);
  });

  it("formats money cliffs with the currency", () => {
    expect(
      participationRevenueCliffs(
        {
          unit: "player",
          tiers: [
            {
              minParticipants: 1,
              maxParticipants: 3,
              amountMinorPerPlayer: 2500,
            },
            {
              minParticipants: 4,
              maxParticipants: 6,
              amountMinorPerPlayer: 1500,
            },
          ],
        },
        6,
        "USD",
      ).map((cliff) => cliff.message),
    ).toEqual(["A 4th player lowers your total from $75.00 to $60.00."]);
  });

  it("accepts the 289 keys and stores version 2", () => {
    const result = validateParticipationRuleV2(
      {
        minParticipants: 4,
        minimumPolicy: "cancel",
        cutoffMinutesBeforeStart: 120,
        settlementBasis: "cutoff",
        creditTiers: [
          { minParticipants: 4, maxParticipants: 7, creditsPerPlayer: 3 },
          { minParticipants: 8, creditsPerPlayer: 2 },
        ],
      },
      { capacity: 12, allowCredits: true, creditCost: 3 },
    );
    expect(result.rule).toEqual({
      version: 2,
      unit: "player",
      minParticipants: 4,
      minimumPolicy: "cancel",
      lockMinutesBeforeStart: 120,
      waitlist: false,
      tiers: [
        { minParticipants: 4, maxParticipants: 7, creditsPerPlayer: 3 },
        { minParticipants: 8, maxParticipants: 12, creditsPerPlayer: 2 },
      ],
    });
  });
});

describe("the cliff fix", () => {
  it("raises a rung only enough to remove the drop, never above the rung before", () => {
    const fixed = suggestParticipationCliffFix({
      tiers: resolveParticipationRuleV2(
        readParticipationRuleV2({ tiers: ladder289 })!,
        { capacity: 8 },
      ).tiers,
    });
    expect(fixed.map((tier) => tier.creditsPerPlayer)).toEqual([3, 2, 2]);
    expect(
      participationRevenueCliffs({ unit: "player", tiers: fixed }, 8),
    ).toEqual([]);
  });

  it("never introduces a rising price", () => {
    for (let a = 1; a <= 9; a += 1) {
      for (let b = 1; b <= a; b += 1) {
        for (let c = 1; c <= b; c += 1) {
          const tiers = [
            { minParticipants: 1, maxParticipants: 2, creditsPerPlayer: a },
            { minParticipants: 3, maxParticipants: 5, creditsPerPlayer: b },
            { minParticipants: 6, maxParticipants: 9, creditsPerPlayer: c },
          ];
          const fixed = suggestParticipationCliffFix({ tiers });
          for (let size = 2; size <= 9; size += 1) {
            expect(perPlayerPrice(fixed, size)!).toBeLessThanOrEqual(
              perPlayerPrice(fixed, size - 1)!,
            );
          }
        }
      }
    }
  });
});

describe("property: validated ladders never raise a player's price", () => {
  it("holds for every accepted ladder of up to three rungs", () => {
    let accepted = 0;
    for (let a = 1; a <= 5; a += 1) {
      for (let b = 1; b <= 5; b += 1) {
        for (let c = 1; c <= 5; c += 1) {
          const result = validateParticipationRuleV2(
            {
              tiers: [
                { minParticipants: 1, maxParticipants: 2, creditsPerPlayer: a },
                { minParticipants: 3, maxParticipants: 4, creditsPerPlayer: b },
                { minParticipants: 5, creditsPerPlayer: c },
              ],
            },
            { capacity: 8 },
          );
          if (!result.rule) continue;
          accepted += 1;
          for (let size = 2; size <= 8; size += 1) {
            expect(
              perPlayerPrice(result.rule.tiers, size)!,
            ).toBeLessThanOrEqual(perPlayerPrice(result.rule.tiers, size - 1)!);
          }
        }
      }
    }
    // a ≥ b ≥ c: 35 of the 125 combinations.
    expect(accepted).toBe(35);
  });
});

describe("presets", () => {
  it("are the four proposed defaults", () => {
    expect(
      PARTICIPATION_PRESETS.map((preset) => [
        preset.id,
        preset.rule.minParticipants,
        preset.rule.maxParticipants,
        preset.rule.minimumPolicy,
        preset.rule.waitlist,
        preset.priceBySize,
      ]),
    ).toEqual([
      ["private", 1, 1, "run", false, false],
      ["semi-private", 2, 2, "cancel", false, false],
      ["small-group", 3, 6, "cancel", true, false],
      ["clinic", 4, 12, "cancel", true, true],
    ]);
  });

  it("validate cleanly and are recognised back", () => {
    for (const preset of PARTICIPATION_PRESETS) {
      expect(validateParticipationRuleV2(preset.rule).issues).toEqual([]);
      expect(
        matchParticipationPreset(preset.rule, preset.rule.maxParticipants),
      ).toBe(preset.id);
    }
    expect(participationPreset("clinic").label).toBe("Clinic");
  });
});

describe("club default and per-offering override", () => {
  const clubDefault = {
    version: 2,
    minParticipants: 3,
    minimumPolicy: "cancel",
    lockMinutesBeforeStart: 720,
    waitlist: true,
    tiers: [],
  };

  it("inherits the club default when the offering has none", () => {
    const resolved = resolveParticipationRules({
      clubDefault,
      kind: "service",
      capacity: 8,
    });
    expect(resolved.source).toBe("club-default");
    expect(resolved.rule).toMatchObject({
      minParticipants: 3,
      capacity: 8,
      lockMinutesBeforeStart: 720,
    });
  });

  it("lets an explicit 'No minimum' override the default", () => {
    const resolved = resolveParticipationRules({
      own: {
        version: 2,
        minParticipants: 1,
        minimumPolicy: "run",
        waitlist: false,
        tiers: [],
      },
      clubDefault,
      kind: "service",
      capacity: 8,
    });
    expect(resolved.source).toBe("own");
    expect(resolved.rule?.minParticipants).toBe(1);
    // The offering's own rule still takes the club's lock when it sets none.
    expect(resolved.rule?.lockMinutesBeforeStart).toBe(720);
  });

  it("never gives a private lesson a group rule, and clamps a small session", () => {
    expect(
      resolveParticipationRules({ clubDefault, kind: "service", capacity: 1 })
        .source,
    ).toBe("none");
    expect(
      resolveParticipationRules({ clubDefault, kind: "service", capacity: 2 })
        .rule?.minParticipants,
    ).toBe(2);
    expect(
      resolveParticipationRules({
        clubDefault,
        clubDefaultAppliesTo: ["pickup"],
        kind: "service",
        capacity: 8,
      }).source,
    ).toBe("none");
  });

  it("falls back to the refund window, then 24 hours (decision 1)", () => {
    const rule = readParticipationRuleV2({ minParticipants: 2 })!;
    expect(
      resolveParticipationRuleV2(rule, {
        capacity: 4,
        refundWindowMinutes: 360,
      }).lockMinutesBeforeStart,
    ).toBe(360);
    expect(
      resolveParticipationRuleV2(rule, { capacity: 4 }).lockMinutesBeforeStart,
    ).toBe(1_440);
  });
});

describe("reading stored rules", () => {
  it("reads 289 rows and keeps attendance pricing for them only", () => {
    const rule = readParticipationRuleV2({
      minParticipants: 2,
      cutoffMinutesBeforeStart: 60,
      settlementBasis: "attendance",
      creditTiers: ladder289,
    });
    expect(rule).toMatchObject({
      version: 2,
      lockMinutesBeforeStart: 60,
      legacySettlementBasis: "attendance",
      waitlist: false,
    });
    expect(rule?.tiers).toHaveLength(3);
  });

  it("never applies part of a malformed ladder", () => {
    expect(
      readParticipationRuleV2({
        tiers: [
          { minParticipants: 1, creditsPerPlayer: 2 },
          { minParticipants: 0 },
        ],
      })?.tiers,
    ).toEqual([]);
  });

  it("round-trips through serialization", () => {
    const rule: ParticipationRuleV2 = {
      version: 2,
      unit: "team",
      minParticipants: 4,
      minimumPolicy: "run",
      lockMinutesBeforeStart: 2880,
      waitlist: true,
      tiers: [],
    };
    expect(readParticipationRuleV2(serializeParticipationRule(rule))).toEqual(
      rule,
    );
  });

  it("the v1 reader maps v2 rows (the adapter)", () => {
    expect(
      readParticipationRules(
        {
          version: 2,
          minParticipants: 3,
          minimumPolicy: "cancel",
          lockMinutesBeforeStart: 600,
          waitlist: true,
          tiers: [
            { minParticipants: 1, maxParticipants: 8, creditsPerPlayer: 2 },
          ],
        },
        8,
      ),
    ).toEqual({
      minParticipants: 3,
      maxParticipants: 8,
      minimumPolicy: "cancel",
      cutoffMinutesBeforeStart: 600,
      settlementBasis: "cutoff",
      creditTiers: [
        { minParticipants: 1, maxParticipants: 8, creditsPerPlayer: 2 },
      ],
    });
  });
});

describe("money helpers", () => {
  const tiers = resolveParticipationRuleV2(
    readParticipationRuleV2({ tiers: ladder289 })!,
    { capacity: 8 },
  ).tiers;

  it("reserves the most and charges a late canceller the final price (decision 4)", () => {
    expect(participationReservePerPlayer(tiers)).toBe(3);
    expect(
      lateCancellationCharge({
        tiers,
        finalGroupSize: 5,
        quantity: 2,
        reserved: 6,
      }),
    ).toBe(4);
    // Never above the reserve, even for a group that ran small.
    expect(
      lateCancellationCharge({
        tiers,
        finalGroupSize: 1,
        quantity: 1,
        reserved: 2,
      }),
    ).toBe(2);
    expect(
      lateCancellationCharge({
        tiers: [],
        finalGroupSize: 4,
        quantity: 1,
        reserved: 3,
      }),
    ).toBe(3);
  });

  it("splits a court rounding up, remainder to the host", () => {
    const split = splitCostTiers(6000, 4, 6);
    expect(split.tiers).toEqual([
      { minParticipants: 4, maxParticipants: 4, amountMinorPerPlayer: 1500 },
      { minParticipants: 5, maxParticipants: 5, amountMinorPerPlayer: 1200 },
      { minParticipants: 6, maxParticipants: 6, amountMinorPerPlayer: 1000 },
    ]);
    const odd = splitCostTiers(1000, 3, 3);
    expect(odd.tiers[0]!.amountMinorPerPlayer).toBe(334);
    expect(odd.remainders).toEqual([{ groupSize: 3, remainderMinor: 2 }]);
  });
});

describe("classifying a rule change (§8)", () => {
  const base = resolveParticipationRuleV2(
    readParticipationRuleV2({
      minParticipants: 4,
      minimumPolicy: "cancel",
      lockMinutesBeforeStart: 1440,
      tiers: [
        { minParticipants: 1, maxParticipants: 5, creditsPerPlayer: 3 },
        { minParticipants: 6, creditsPerPlayer: 2 },
      ],
    })!,
    { capacity: 10 },
  );
  const changed = (patch: Record<string, unknown>) =>
    resolveParticipationRuleV2(
      readParticipationRuleV2({
        ...serializeParticipationRule(base),
        ...patch,
      })!,
      { capacity: (patch.capacity as number | undefined) ?? 10 },
    );

  it("loosens: lower minimum, run, later lock, cheaper prices, more places", () => {
    expect(
      classifyRuleChange(base, changed({ minParticipants: 3 })).overall,
    ).toBe("loosens");
    expect(
      classifyRuleChange(base, changed({ minimumPolicy: "run" })).overall,
    ).toBe("loosens");
    expect(
      classifyRuleChange(base, changed({ lockMinutesBeforeStart: 600 }))
        .overall,
    ).toBe("loosens");
    expect(
      classifyRuleChange(
        base,
        changed({
          tiers: [
            { minParticipants: 1, maxParticipants: 5, creditsPerPlayer: 3 },
            { minParticipants: 6, creditsPerPlayer: 1 },
          ],
        }),
      ).overall,
    ).toBe("loosens");
    expect(
      classifyRuleChange(base, changed({ capacity: 12 })).fields.capacity,
    ).toBe("loosens");
  });

  it("tightens when any field tightens", () => {
    expect(
      classifyRuleChange(base, changed({ minParticipants: 5 })).overall,
    ).toBe("tightens");
    expect(
      classifyRuleChange(
        base,
        changed({ minParticipants: 3, lockMinutesBeforeStart: 2880 }),
      ).overall,
    ).toBe("tightens");
    expect(classifyRuleChange(base, changed({})).overall).toBe("neutral");
  });
});
