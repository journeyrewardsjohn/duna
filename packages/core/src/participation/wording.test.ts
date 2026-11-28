import { describe, expect, it } from "vitest";
import {
  PARTICIPATION_POLICY,
  PARTICIPATION_PRESETS,
  parseParticipationRulePhrase,
  parseParticipationRuleSentence,
  participationDisplay,
  participationIndefiniteArticle,
  participationLockAt,
  participationLockDuration,
  participationOrdinalWithArticle,
  participationPriceLine,
  participationRevenueCliffs,
  participationRulePhrase,
  participationRuleSentence,
  readParticipationRuleV2,
  renderParticipationCopy,
  renderParticipationDisplay,
  resolveParticipationRuleV2,
  type ParticipationRuleV2,
} from "./index";

describe("articles before ordinals (the cliff warning)", () => {
  // Said aloud: "an eighth", "an eleventh", "an eighteenth"; every other
  // ordinal from 1 to 30 takes "a".
  const an = new Set([8, 11, 18]);
  const table = Array.from({ length: 30 }, (_, index) => index + 1);
  it.each(table)("%i", (value) => {
    expect(participationIndefiniteArticle(value)).toBe(
      an.has(value) ? "an" : "a",
    );
  });

  it("writes the ordinal with its article", () => {
    expect(participationOrdinalWithArticle(8)).toBe("An 8th");
    expect(participationOrdinalWithArticle(11)).toBe("An 11th");
    expect(participationOrdinalWithArticle(18)).toBe("An 18th");
    expect(participationOrdinalWithArticle(7)).toBe("A 7th");
    expect(participationOrdinalWithArticle(12)).toBe("A 12th");
    expect(participationOrdinalWithArticle(21)).toBe("A 21st");
  });

  it("handles larger groups the way English says them", () => {
    for (const value of [80, 81, 89, 800, 811, 8_000, 11_000, 18_500]) {
      expect(participationIndefiniteArticle(value)).toBe("an");
    }
    for (const value of [100, 108, 111, 180, 1_100, 7_000]) {
      expect(participationIndefiniteArticle(value)).toBe("a");
    }
  });

  it("the clinic ladder warns about an 8th player", () => {
    const cliffs = participationRevenueCliffs(
      {
        unit: "player",
        tiers: [
          { minParticipants: 4, maxParticipants: 7, creditsPerPlayer: 3 },
          { minParticipants: 8, maxParticipants: 12, creditsPerPlayer: 2 },
        ],
      },
      12,
    );
    expect(cliffs.map((cliff) => cliff.message)).toEqual([
      "An 8th player lowers your total from 21 to 16 credits.",
    ]);
  });
});

describe("the price line is true in every state of the ladder", () => {
  const ladder = [
    { minParticipants: 1, maxParticipants: 3, creditsPerPlayer: 3 },
    { minParticipants: 4, maxParticipants: 7, creditsPerPlayer: 2 },
    { minParticipants: 8, maxParticipants: 12, creditsPerPlayer: 1 },
  ];
  const line = (groupSize: number, quantity = 1, capacity = 12) => {
    const token = participationPriceLine({
      tiers: ladder,
      unit: "credits",
      capacity,
      groupSize,
      quantity,
      lock: "Thu 6:00 PM",
    });
    return token ? renderParticipationCopy(token) : undefined;
  };

  it("keeps today's meaning while no cheaper rung is reached", () => {
    expect(line(2)).toBe(
      "3 credits now. If more join by Thu 6:00 PM, the difference comes back.",
    );
  });

  it("says exactly what comes back once a cheaper rung is reached", () => {
    expect(line(5)).toBe(
      "3 credits now; 1 comes back when the group is confirmed Thu 6:00 PM, more if more join.",
    );
    expect(line(9)).toBe(
      "3 credits now; 2 come back when the group is confirmed Thu 6:00 PM.",
    );
    // A parent booking twins: both places.
    expect(line(9, 2)).toBe(
      "6 credits now; 4 come back when the group is confirmed Thu 6:00 PM.",
    );
    // The cheapest rung the session can reach (capacity 7).
    expect(line(5, 1, 7)).toBe(
      "3 credits now; 1 comes back when the group is confirmed Thu 6:00 PM.",
    );
  });

  it("says nothing about differences when no rung is cheaper", () => {
    const flat = participationPriceLine({
      tiers: [
        { minParticipants: 1, maxParticipants: 3, creditsPerPlayer: 2 },
        { minParticipants: 4, maxParticipants: 6, creditsPerPlayer: 2 },
      ],
      unit: "credits",
      capacity: 6,
      groupSize: 1,
      quantity: 1,
      lock: "Thu 6:00 PM",
    });
    expect(renderParticipationCopy(flat!)).toBe("2 credits now.");
    // A full session on the cheapest reachable rung of a ladder that started there.
    expect(line(3, 1, 3)).toBe("3 credits now.");
  });

  it("speaks money to card payers", () => {
    const card = (groupSize: number, capacity = 12) => {
      const token = participationPriceLine({
        tiers: [
          {
            minParticipants: 1,
            maxParticipants: 3,
            amountMinorPerPlayer: 3000,
          },
          {
            minParticipants: 4,
            maxParticipants: 12,
            amountMinorPerPlayer: 2000,
          },
        ],
        unit: "minor",
        capacity,
        groupSize,
        quantity: 1,
        lock: "Thu 6:00 PM",
        currency: "USD",
      });
      return token ? renderParticipationCopy(token) : undefined;
    };
    expect(card(2)).toBe(
      "$30.00 now. If more join by Thu 6:00 PM, the difference goes back to your card.",
    );
    expect(card(5)).toBe(
      "$30.00 now; $10.00 goes back to your card when the group is confirmed Thu 6:00 PM.",
    );
    expect(card(2, 3)).toBe("$30.00 now.");
    // Never a money line without a currency.
    expect(
      participationPriceLine({
        tiers: ladder.map((tier) => ({
          ...tier,
          amountMinorPerPlayer: 100,
        })),
        unit: "minor",
        capacity: 12,
        groupSize: 1,
        quantity: 1,
        lock: "x",
      }),
    ).toBeUndefined();
  });

  it("the display model uses it, and promises card payers nothing yet", () => {
    const rule = resolveParticipationRuleV2(
      readParticipationRuleV2({
        minParticipants: 4,
        minimumPolicy: "cancel",
        lockMinutesBeforeStart: 1440,
        tiers: [
          { minParticipants: 4, maxParticipants: 7, creditsPerPlayer: 3 },
          { minParticipants: 8, creditsPerPlayer: 2 },
        ],
      })!,
      { capacity: 12 },
    );
    const startsAt = new Date("2026-12-12T02:00:00.000Z");
    const base = {
      rule,
      capacity: 12,
      booked: 9,
      startsAt,
      endsAt: new Date("2026-12-12T03:30:00.000Z"),
      lockAt: participationLockAt({ startsAt, lockMinutesBeforeStart: 1440 }),
      now: new Date("2026-12-08T17:00:00.000Z"),
      timeZone: "America/Los_Angeles",
    };
    expect(renderParticipationDisplay(participationDisplay(base)).price).toBe(
      "3 credits now; 1 comes back when the group is confirmed Thu 6:00 PM.",
    );
    expect(PARTICIPATION_POLICY.cardLadderCharged).toBe(false);
    expect(
      participationDisplay({ ...base, payment: { method: "card" } }).price,
    ).toBeUndefined();
  });
});

describe("a rule in one sentence and one phrase", () => {
  const smallGroup = PARTICIPATION_PRESETS.find(
    (preset) => preset.id === "small-group",
  )!.rule;

  it("says the small-group preset the way the owner reads it", () => {
    expect(
      participationRuleSentence({
        ...smallGroup,
        lockMinutesBeforeStart: 1440,
      }),
    ).toBe(
      "Runs with at least 3 players, up to 6. If fewer are booked 24 hours before, cancel and return credits. Keeps a waitlist.",
    );
    expect(participationRulePhrase(smallGroup)).toBe(
      "3 to 6 players · cancel if fewer · waitlist",
    );
  });

  it("covers every preset", () => {
    const words = PARTICIPATION_PRESETS.map((preset) => [
      participationRuleSentence(preset.rule),
      participationRulePhrase(preset.rule),
    ]);
    expect(words).toEqual([
      ["Runs with 1 player.", "1 player"],
      [
        "Runs with 2 players. If fewer are booked 24 hours before, cancel and return credits.",
        "2 players · cancel if fewer",
      ],
      [
        "Runs with at least 3 players, up to 6. If fewer are booked 24 hours before, cancel and return credits. Keeps a waitlist.",
        "3 to 6 players · cancel if fewer · waitlist",
      ],
      [
        "Runs with at least 4 players, up to 12. If fewer are booked 24 hours before, cancel and return credits. Keeps a waitlist.",
        "4 to 12 players · cancel if fewer · waitlist",
      ],
    ]);
  });

  it("speaks run, teams, no minimum, the start and a capacity override", () => {
    expect(
      participationRuleSentence({
        ...smallGroup,
        unit: "team",
        minimumPolicy: "run",
        waitlist: false,
        lockMinutesBeforeStart: 0,
      }),
    ).toBe(
      "Runs with at least 3 teams, up to 6. If fewer are booked when it starts, it runs anyway.",
    );
    expect(
      participationRuleSentence(
        { ...smallGroup, minParticipants: 1, waitlist: false },
        { capacity: 8 },
      ),
    ).toBe("No minimum, up to 8 players.");
    expect(participationLockDuration(90)).toBe("1 hour 30 minutes");
    expect(participationLockDuration(2_880)).toBe("2 days");
    expect(participationLockDuration(60)).toBe("1 hour");
  });

  it("round-trips every preset across locks, policies and waitlists", () => {
    const locks = [0, 30, 60, 90, 720, 1_440, 2_880, 10_080];
    for (const preset of PARTICIPATION_PRESETS) {
      for (const lock of locks) {
        for (const minimumPolicy of ["cancel", "run"] as const) {
          for (const waitlist of [true, false]) {
            for (const unit of ["player", "team"] as const) {
              const rule: ParticipationRuleV2 = {
                ...preset.rule,
                unit,
                minimumPolicy,
                waitlist,
                lockMinutesBeforeStart: lock,
              };
              const grouped = rule.minParticipants > 1;
              const expected = {
                unit,
                minParticipants: rule.minParticipants,
                maxParticipants: rule.maxParticipants,
                minimumPolicy: grouped ? minimumPolicy : "run",
                waitlist,
                priceBySize: false,
              };
              expect(
                parseParticipationRuleSentence(participationRuleSentence(rule)),
              ).toEqual({
                ...expected,
                ...(grouped ? { lockMinutesBeforeStart: lock } : {}),
              });
              expect(
                parseParticipationRulePhrase(participationRulePhrase(rule)),
              ).toEqual(expected);
            }
          }
        }
      }
    }
  });
});
