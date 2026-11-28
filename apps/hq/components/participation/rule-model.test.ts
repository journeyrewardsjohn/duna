import {
  participationPreset,
  participationRevenueCliffs,
  validateParticipationRuleV2,
} from "@duna/core";
import { describe, expect, it } from "vitest";
import {
  addLadderRow,
  checkDraft,
  cliffFixLadder,
  draftFromPreset,
  draftFromRule,
  draftPreset,
  ladderTiers,
  ladderTotals,
  lockPhrase,
  ruleInputFromDraft,
  ruleSentenceText,
  storedRule,
  type RuleDraft,
} from "./rule-model";

const base: RuleDraft = {
  unit: "player",
  minParticipants: 3,
  capacity: 8,
  lockMinutes: 1_440,
  policy: "cancel",
  waitlist: true,
  priceBySize: false,
  ladder: [],
};

describe("the rule sentence and the stored rule", () => {
  it("round-trips a rule through the sentence and the shared validator", () => {
    const check = checkDraft(base);
    expect(check.issues).toEqual([]);
    const stored = storedRule(check.rule!);
    const again = draftFromRule(stored, 8);
    expect(again).toEqual(base);
    // The shared core accepts exactly what the sentence produced.
    expect(validateParticipationRuleV2(stored, { capacity: 8 }).issues).toEqual(
      [],
    );
  });

  it("round-trips a ladder", () => {
    const draft: RuleDraft = {
      ...base,
      minParticipants: 4,
      capacity: 12,
      priceBySize: true,
      ladder: [
        { from: 4, credits: 3 },
        { from: 8, credits: 2 },
      ],
    };
    const check = checkDraft(draft, { allowCredits: true, creditCost: 3 });
    expect(check.issues).toEqual([]);
    expect(check.rule!.tiers).toEqual([
      { minParticipants: 4, maxParticipants: 7, creditsPerPlayer: 3 },
      { minParticipants: 8, maxParticipants: 12, creditsPerPlayer: 2 },
    ]);
    expect(draftFromRule(storedRule(check.rule!), 12)).toEqual(draft);
  });

  it("leaves the decision time to the club default when it is not set", () => {
    const draft = { ...base, lockMinutes: null };
    const input = ruleInputFromDraft(draft);
    expect(input).not.toHaveProperty("lockMinutesBeforeStart");
    expect(
      draftFromRule(storedRule(checkDraft(draft).rule!), 8).lockMinutes,
    ).toBe(null);
  });

  it("reads 289's old keys (cutoff, credit tiers) into the sentence", () => {
    const draft = draftFromRule(
      {
        minParticipants: 2,
        minimumPolicy: "cancel",
        cutoffMinutesBeforeStart: 720,
        creditTiers: [
          { minParticipants: 2, maxParticipants: 6, creditsPerPlayer: 2 },
        ],
      },
      6,
    );
    expect(draft.lockMinutes).toBe(720);
    expect(draft.priceBySize).toBe(true);
    expect(draft.ladder).toEqual([{ from: 2, credits: 2 }]);
  });

  it("says a sentence without a minimum as running whatever the number", () => {
    expect(ruleSentenceText(undefined)).toBe(
      "Runs whatever the number of players.",
    );
    expect(ruleSentenceText(storedRule(checkDraft(base).rule!))).toBe(
      "Runs with at least 3 players. We decide 24 hours before it starts. If fewer are booked, cancel and return credits or payment. When it's full, keep a waitlist.",
    );
  });

  it("names lock times in words", () => {
    expect(lockPhrase(60)).toBe("1 hour");
    expect(lockPhrase(1_440)).toBe("24 hours");
    expect(lockPhrase(2_880)).toBe("2 days");
    expect(lockPhrase(90)).toBe("90 minutes");
  });
});

describe("validation comes from the shared core, word for word", () => {
  it("refuses a minimum above the capacity", () => {
    const check = checkDraft({ ...base, minParticipants: 5, capacity: 4 });
    expect(check.rule).toBeUndefined();
    expect(check.issues).toEqual(
      validateParticipationRuleV2(
        ruleInputFromDraft({ ...base, minParticipants: 5, capacity: 4 }),
        {
          capacity: 4,
        },
      ).issues,
    );
    expect(check.issues[0]).toBe(
      "The minimum (5) can't be more than the 4 players a session holds.",
    );
  });

  it("refuses a price that rises as the group grows", () => {
    const check = checkDraft(
      {
        ...base,
        capacity: 8,
        minParticipants: 2,
        priceBySize: true,
        ladder: [
          { from: 2, credits: 2 },
          { from: 5, credits: 3 },
        ],
      },
      { allowCredits: true },
    );
    expect(check.issues).toContain(
      "The 5-player price can't be higher than the 2-player price.",
    );
  });

  it("asks for a price on a ladder row and for credit payment", () => {
    const empty = checkDraft(
      { ...base, priceBySize: true, ladder: [{ from: 3, credits: null }] },
      { allowCredits: true },
    );
    expect(empty.issues).toEqual(["Row 1 needs a price per player."]);
    const noCredits = checkDraft(
      { ...base, priceBySize: true, ladder: [{ from: 3, credits: 2 }] },
      { allowCredits: false },
    );
    expect(noCredits.issues).toContain(
      "Credit prices by group size need credit payment. Turn on credits first.",
    );
  });

  it("needs a capacity first", () => {
    expect(checkDraft({ ...base, capacity: null }).issues).toEqual([
      "Set how many players a session holds first.",
    ]);
  });
});

describe("the ladder and the cliff warning", () => {
  // 289's own ladder: 1 · 3, 2–6 · 2, 7+ · 1. The 7th player drops 12 to 7.
  const cliff: RuleDraft = {
    ...base,
    minParticipants: 1,
    capacity: 8,
    policy: "run",
    priceBySize: true,
    ladder: [
      { from: 1, credits: 3 },
      { from: 2, credits: 2 },
      { from: 7, credits: 1 },
    ],
  };

  it("turns rows into contiguous tiers ending at the capacity", () => {
    expect(ladderTiers(cliff.ladder, 8)).toEqual([
      { minParticipants: 1, maxParticipants: 1, creditsPerPlayer: 3 },
      { minParticipants: 2, maxParticipants: 6, creditsPerPlayer: 2 },
      { minParticipants: 7, maxParticipants: 8, creditsPerPlayer: 1 },
    ]);
  });

  it("warns with the shared words and the worked numbers, without blocking", () => {
    const check = checkDraft(cliff, { allowCredits: true, creditCost: 3 });
    expect(check.issues).toEqual([]);
    expect(check.warnings.map((warning) => warning.message)).toEqual([
      "A 7th player lowers your total from 12 to 7 credits.",
    ]);
    expect(check.warnings).toEqual(participationRevenueCliffs(check.rule!, 8));
    const totals = ladderTotals(cliff);
    expect(totals.find((row) => row.size === 6)?.total).toBe(12);
    expect(totals.find((row) => row.size === 7)?.total).toBe(7);
  });

  it("offers the core's fix, which has no cliff", () => {
    const fix = cliffFixLadder(cliff)!;
    const fixed = checkDraft({ ...cliff, ladder: fix }, { allowCredits: true });
    expect(fixed.issues).toEqual([]);
    expect(fixed.warnings).toEqual([]);
  });

  it("adds a row one player after the last", () => {
    expect(addLadderRow([{ from: 4, credits: 3 }], 4)).toEqual([
      { from: 4, credits: 3 },
      { from: 5, credits: 3 },
    ]);
    expect(addLadderRow([], 3)).toEqual([{ from: 3, credits: null }]);
  });
});

describe("presets", () => {
  it("applies each preset and recognises it again", () => {
    for (const id of [
      "private",
      "semi-private",
      "small-group",
      "clinic",
    ] as const) {
      const draft = draftFromPreset(id, base);
      expect(draft.capacity).toBe(participationPreset(id).rule.maxParticipants);
      expect(draftPreset(draft)).toBe(id);
    }
  });

  it("calls a changed preset custom", () => {
    const draft = { ...draftFromPreset("small-group", base), capacity: 7 };
    expect(draftPreset(draft)).toBeUndefined();
  });
});
