import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARTICIPATION_CUTOFF_MINUTES,
  creditTierForHeadcount,
  decideParticipationMinimum,
  describeParticipationTier,
  participationCutoffAt,
  participationRulesAreInert,
  planParticipationSettlement,
  readParticipationRules,
  reservedCreditsPerPlayer,
  validateParticipationRules,
} from "./participation";

// Beach Elite VB Academy: a lone player gets a private, a small group pays
// less each, and a large group pays the least.
const academyTiers = [
  { minParticipants: 1, maxParticipants: 1, creditsPerPlayer: 3 },
  { minParticipants: 2, maxParticipants: 6, creditsPerPlayer: 2 },
  { minParticipants: 7, creditsPerPlayer: 1 },
];
const academyContext = { capacity: 12, allowCredits: true, creditCost: 3 };

describe("participation rule validation", () => {
  it("treats a missing rule set as a capacity-only offer", () => {
    expect(validateParticipationRules(undefined, academyContext)).toEqual({
      issues: [],
    });
    expect(readParticipationRules(undefined, 12)).toBeUndefined();
  });

  it("applies conservative defaults and resolves the open-ended tier", () => {
    const result = validateParticipationRules(
      { creditTiers: academyTiers },
      academyContext,
    );
    expect(result.issues).toEqual([]);
    expect(result.rules).toEqual({
      minParticipants: 1,
      maxParticipants: 12,
      minimumPolicy: "run",
      cutoffMinutesBeforeStart: DEFAULT_PARTICIPATION_CUTOFF_MINUTES,
      settlementBasis: "cutoff",
      creditTiers: [
        { minParticipants: 1, maxParticipants: 1, creditsPerPlayer: 3 },
        { minParticipants: 2, maxParticipants: 6, creditsPerPlayer: 2 },
        { minParticipants: 7, maxParticipants: 12, creditsPerPlayer: 1 },
      ],
    });
  });

  it("accepts a minimum with a cancel policy and no tiers", () => {
    const result = validateParticipationRules(
      {
        minParticipants: 4,
        minimumPolicy: "cancel",
        cutoffMinutesBeforeStart: 120,
        settlementBasis: "cutoff",
      },
      { capacity: 12, allowCredits: false },
    );
    expect(result.issues).toEqual([]);
    expect(result.rules).toMatchObject({
      minParticipants: 4,
      minimumPolicy: "cancel",
      cutoffMinutesBeforeStart: 120,
      creditTiers: [],
    });
  });

  it.each([
    [
      "a minimum above the maximum",
      { minParticipants: 13 },
      "cannot exceed the maximum",
    ],
    ["a zero minimum", { minParticipants: 0 }, "1 or more"],
    [
      "an unknown minimum policy",
      { minimumPolicy: "wait" },
      "cancelled or runs anyway",
    ],
    [
      "a cutoff longer than a week",
      { cutoffMinutesBeforeStart: 20_000 },
      "between 0 minutes and 7 days",
    ],
    [
      "an unknown settlement basis",
      { settlementBasis: "vibes" },
      "booked headcount or on recorded attendance",
    ],
    [
      "a gap between tiers",
      {
        creditTiers: [
          { minParticipants: 1, maxParticipants: 1, creditsPerPlayer: 3 },
          { minParticipants: 3, creditsPerPlayer: 1 },
        ],
      },
      "leaves a gap",
    ],
    [
      "overlapping tiers",
      {
        creditTiers: [
          { minParticipants: 1, maxParticipants: 4, creditsPerPlayer: 3 },
          { minParticipants: 4, creditsPerPlayer: 1 },
        ],
      },
      "overlaps the tier before it",
    ],
    [
      "tiers that start above the minimum",
      {
        creditTiers: [
          { minParticipants: 2, maxParticipants: 6, creditsPerPlayer: 3 },
          { minParticipants: 7, creditsPerPlayer: 1 },
        ],
      },
      "must start at the minimum of 1 player",
    ],
    [
      "tiers that stop short of the maximum",
      {
        creditTiers: [
          { minParticipants: 1, maxParticipants: 6, creditsPerPlayer: 3 },
        ],
      },
      "must reach the maximum of 12 players",
    ],
    [
      "tiers past the maximum",
      {
        creditTiers: [
          { minParticipants: 1, maxParticipants: 20, creditsPerPlayer: 3 },
        ],
      },
      "goes past the maximum",
    ],
    [
      "an open-ended tier that is not last",
      {
        creditTiers: [
          { minParticipants: 1, creditsPerPlayer: 3 },
          { minParticipants: 2, creditsPerPlayer: 1 },
        ],
      },
      "Only the last tier may be open-ended",
    ],
    [
      "a free tier",
      {
        creditTiers: [{ minParticipants: 1, creditsPerPlayer: 0 }],
      },
      "credit price per player of 1 or more",
    ],
    [
      "an inverted tier",
      {
        creditTiers: [
          { minParticipants: 1, maxParticipants: 0, creditsPerPlayer: 2 },
        ],
      },
      "before it starts",
    ],
  ])("rejects %s", (_name, rules, message) => {
    const result = validateParticipationRules(rules, academyContext);
    expect(result.rules).toBeUndefined();
    expect(result.issues.join(" ")).toContain(message);
  });

  it("requires credit payment for group-size pricing", () => {
    const result = validateParticipationRules(
      { creditTiers: academyTiers },
      { capacity: 12, allowCredits: false },
    );
    expect(result.issues.join(" ")).toContain("Turn on credit payment first");
  });

  it("requires the catalog credit price to equal the highest tier", () => {
    const result = validateParticipationRules(
      { creditTiers: academyTiers },
      { capacity: 12, allowCredits: true, creditCost: 2 },
    );
    expect(result.issues.join(" ")).toContain(
      "Set the credit price to 3 credits",
    );
  });

  it("keeps tiers within a minimum above one", () => {
    const result = validateParticipationRules(
      {
        minParticipants: 2,
        minimumPolicy: "cancel",
        creditTiers: [
          { minParticipants: 2, maxParticipants: 6, creditsPerPlayer: 2 },
          { minParticipants: 7, maxParticipants: 12, creditsPerPlayer: 1 },
        ],
      },
      { capacity: 12, allowCredits: true, creditCost: 2 },
    );
    expect(result.issues).toEqual([]);
    expect(result.rules?.creditTiers).toHaveLength(2);
  });
});

describe("stored participation rules", () => {
  it("clamps a stored minimum to a smaller occurrence capacity", () => {
    const rules = readParticipationRules(
      { minParticipants: 8, minimumPolicy: "cancel" },
      6,
    );
    expect(rules).toMatchObject({ minParticipants: 6, maxParticipants: 6 });
  });

  it("never partially applies a malformed tier table", () => {
    const rules = readParticipationRules(
      {
        creditTiers: [
          { minParticipants: 1, maxParticipants: 1, creditsPerPlayer: 3 },
          { minParticipants: "two", creditsPerPlayer: 2 },
        ],
      },
      12,
    );
    expect(rules?.creditTiers).toEqual([]);
  });

  it("recognizes rules that change nothing", () => {
    expect(participationRulesAreInert(readParticipationRules({}, 12)!)).toBe(
      true,
    );
    expect(
      participationRulesAreInert(
        readParticipationRules({ minParticipants: 4 }, 12)!,
      ),
    ).toBe(true);
    expect(
      participationRulesAreInert(
        readParticipationRules(
          { minParticipants: 4, minimumPolicy: "cancel" },
          12,
        )!,
      ),
    ).toBe(false);
    expect(
      participationRulesAreInert(
        readParticipationRules({ creditTiers: academyTiers }, 12)!,
      ),
    ).toBe(false);
  });
});

describe("headcount pricing", () => {
  const tiers = validateParticipationRules(
    { creditTiers: academyTiers },
    academyContext,
  ).rules!.creditTiers;

  it.each([
    [0, 3],
    [1, 3],
    [2, 2],
    [6, 2],
    [7, 1],
    [12, 1],
    [40, 1],
  ])("prices a headcount of %i at %i credits each", (headcount, credits) => {
    expect(creditTierForHeadcount(tiers, headcount)?.creditsPerPlayer).toBe(
      credits,
    );
  });

  it("reserves the highest tier that could still apply", () => {
    expect(reservedCreditsPerPlayer(tiers)).toBe(3);
    expect(reservedCreditsPerPlayer([])).toBeUndefined();
  });

  it("returns the difference without ever charging more than reserved", () => {
    expect(
      planParticipationSettlement({
        creditTiers: tiers,
        headcount: 4,
        bookings: [
          { id: "solo", quantity: 1, reservedCredits: 3 },
          { id: "family", quantity: 3, reservedCredits: 9 },
          // Booked under an older, cheaper table: never charged upward.
          { id: "legacy", quantity: 1, reservedCredits: 1 },
        ],
      }),
    ).toEqual([
      {
        id: "solo",
        creditsPerPlayer: 2,
        settledCredits: 2,
        returnedCredits: 1,
      },
      {
        id: "family",
        creditsPerPlayer: 2,
        settledCredits: 6,
        returnedCredits: 3,
      },
      {
        id: "legacy",
        creditsPerPlayer: 2,
        settledCredits: 1,
        returnedCredits: 0,
      },
    ]);
  });

  it("leaves fixed-price bookings untouched", () => {
    expect(
      planParticipationSettlement({
        creditTiers: [],
        headcount: 4,
        bookings: [{ id: "fixed", quantity: 2, reservedCredits: 4 }],
      }),
    ).toEqual([
      {
        id: "fixed",
        creditsPerPlayer: 2,
        settledCredits: 4,
        returnedCredits: 0,
      },
    ]);
  });

  it("describes tiers the way a booking page reads them", () => {
    expect(tiers.map((tier) => describeParticipationTier(tier, 12))).toEqual([
      "1 player, 3 credits each",
      "2 to 6 players, 2 credits each",
      "7 or more players, 1 credit each",
    ]);
  });
});

describe("minimum decisions", () => {
  it("computes the cutoff from the start time", () => {
    expect(
      participationCutoffAt(new Date("2026-12-10T17:00:00.000Z"), {
        cutoffMinutesBeforeStart: 120,
      }).toISOString(),
    ).toBe("2026-12-10T15:00:00.000Z");
  });

  it("moves the decision when a session opens inside its cutoff window", () => {
    const startsAt = new Date("2026-12-10T17:00:00.000Z");
    const rules = { cutoffMinutesBeforeStart: 1_440 };
    // Opened well before the cutoff: the cutoff stands.
    expect(
      participationCutoffAt(
        startsAt,
        rules,
        new Date("2026-12-01T00:00:00.000Z"),
      ).toISOString(),
    ).toBe("2026-12-09T17:00:00.000Z");
    // Opened ten hours before the start: decide five hours before the start.
    expect(
      participationCutoffAt(
        startsAt,
        rules,
        new Date("2026-12-10T07:00:00.000Z"),
      ).toISOString(),
    ).toBe("2026-12-10T12:00:00.000Z");
    // Opened after the start: never earlier than it opened.
    expect(
      participationCutoffAt(
        startsAt,
        rules,
        new Date("2026-12-10T18:00:00.000Z"),
      ).toISOString(),
    ).toBe("2026-12-10T18:00:00.000Z");
  });

  it("cancels or runs an under-filled session by policy", () => {
    expect(
      decideParticipationMinimum(
        { minParticipants: 4, minimumPolicy: "cancel" },
        3,
      ),
    ).toBe("cancel-under-minimum");
    expect(
      decideParticipationMinimum(
        { minParticipants: 4, minimumPolicy: "run" },
        3,
      ),
    ).toBe("run-under-minimum");
    expect(
      decideParticipationMinimum(
        { minParticipants: 4, minimumPolicy: "cancel" },
        4,
      ),
    ).toBe("minimum-met");
  });
});
