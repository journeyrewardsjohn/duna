import { describe, expect, it } from "vitest";
import {
  confirmProblems,
  initialFocusFor,
  isDestructiveBulk,
  secondStepFor,
  typedMatches,
} from "./confirm-core";

describe("the second step", () => {
  it("is asked only for destructive bulk actions", () => {
    const removeMembers = {
      tier: "strong" as const,
      verb: "Remove 12 members",
      destructive: true,
      bulk: { count: 12, noun: "members", typeToConfirm: "remove 12 members" },
    };
    expect(isDestructiveBulk(removeMembers)).toBe(true);
    expect(secondStepFor(removeMembers)).toEqual({
      kind: "type",
      phrase: "remove 12 members",
    });

    // A refund moves money but is one item: restated, no typing.
    expect(
      secondStepFor({
        tier: "strong",
        verb: "Refund $48.00",
        destructive: true,
        amount: "$48.00",
        bulk: { count: 1, noun: "booking", typeToConfirm: "refund" },
      }),
    ).toBeNull();

    // A bulk action that is not destructive: no typing either.
    expect(
      secondStepFor({
        tier: "strong",
        verb: "Invite 40 players",
        bulk: { count: 40, noun: "players", typeToConfirm: "invite" },
      }),
    ).toBeNull();

    // Tier 1 never asks.
    expect(
      secondStepFor({
        tier: "confirm",
        verb: "Delete drill",
        destructive: true,
        bulk: { count: 3, noun: "drills", typeToConfirm: "delete" },
      }),
    ).toBeNull();
  });

  it("offers ticking a sentence when no phrase is given", () => {
    expect(
      secondStepFor({
        tier: "strong",
        verb: "Cancel 6 sessions",
        destructive: true,
        bulk: {
          count: 6,
          noun: "sessions",
          acknowledge: "I understand 38 players are emailed.",
        },
      }),
    ).toEqual({
      kind: "acknowledge",
      sentence: "I understand 38 players are emailed.",
    });
  });

  it("forgives case and spacing, never an empty answer", () => {
    expect(typedMatches("  Remove   12 MEMBERS ", "remove 12 members")).toBe(
      true,
    );
    expect(typedMatches("remove 12", "remove 12 members")).toBe(false);
    expect(typedMatches("", "")).toBe(false);
  });
});

describe("problems a development warning names", () => {
  it("rejects vague verbs", () => {
    expect(confirmProblems({ tier: "confirm", verb: "OK" })[0]).toMatch(
      /says nothing/,
    );
    expect(
      confirmProblems({ tier: "confirm", verb: "Send to 14 people" }),
    ).toEqual([]);
  });

  it("asks a strong confirmation to restate what is at stake", () => {
    expect(
      confirmProblems({ tier: "strong", verb: "Refund $48.00" })[0],
    ).toMatch(/restates/);
    expect(
      confirmProblems({
        tier: "strong",
        verb: "Refund $48.00",
        amount: "$48.00",
        recipients: "Jane Doe",
      }),
    ).toEqual([]);
  });

  it("names a second step asked for where it does not belong", () => {
    expect(
      confirmProblems({
        tier: "strong",
        verb: "Refund $48.00",
        amount: "$48.00",
        bulk: { count: 1, noun: "booking", typeToConfirm: "refund" },
      }),
    ).toContainEqual(expect.stringMatching(/only for destructive bulk/));
  });
});

describe("initial focus", () => {
  it("starts on Cancel for destructive actions and on the verb otherwise", () => {
    expect(initialFocusFor({ destructive: true }, null)).toBe("cancel");
    expect(initialFocusFor({ destructive: false }, null)).toBe("confirm");
    expect(
      initialFocusFor({ destructive: true }, { kind: "type", phrase: "x" }),
    ).toBe("second-step");
  });
});
