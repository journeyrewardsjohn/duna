import { describe, expect, it } from "vitest";
import { contactFrom } from "./claim/claim-model";
import {
  claimHref,
  firstIncompleteStep,
  nameRows,
  resultSentence,
  todayIso,
} from "./flow-model";

describe("add-a-score flow model", () => {
  it("resumes at the first unfinished step, or the result", () => {
    expect(firstIncompleteStep([])).toBe(0);
    expect(firstIncompleteStep(["where"])).toBe(1);
    expect(firstIncompleteStep(["where", "score"])).toBe(2);
    expect(firstIncompleteStep(["where", "score", "players"])).toBe(3);
  });

  it("keeps typed names when the format changes", () => {
    const rows = nameRows([{ firstName: "Ana", lastInitial: "K" }], 3);
    expect(rows).toEqual([
      { firstName: "Ana", lastInitial: "K" },
      { firstName: "", lastInitial: "" },
      { firstName: "", lastInitial: "" },
    ]);
    expect(nameRows(rows, 1)).toEqual([{ firstName: "Ana", lastInitial: "K" }]);
  });

  it("says what a result would do, never as a rating", () => {
    const sentence = resultSentence({
      result: "won",
      setsWon: { you: 2, them: 0 },
      counts: true,
      reason: "competitive-doubles",
      whatItWouldDo: {
        startingPoint: 3,
        afterThisMatch: 3.12,
        change: 0.12,
        matchesUntilShown: 5,
      },
      warnings: [],
    });
    expect(sentence).toBe(
      "If the other side confirms it, a win like this moves a player new to Duna from 3.00 to 3.12 (+0.12).",
    );
    expect(sentence).not.toMatch(/~|±/);
    expect(
      resultSentence({
        result: "lost",
        setsWon: { you: 0, them: 1 },
        counts: false,
        reason: "friendly",
        warnings: [],
      }),
    ).toMatch(/friendly matches are kept in your history/);
  });

  it("claim links come back to the claim page after sign-up or sign-in", () => {
    expect(claimHref.signUp).toBe("/sign-up?returnTo=%2Fadd-score%2Fclaim");
    expect(claimHref.signIn).toBe("/sign-in?returnTo=%2Fadd-score%2Fclaim");
  });

  it("uses the visitor's own calendar day", () => {
    expect(todayIso(new Date(2026, 10, 28, 23, 30))).toBe("2026-11-28");
  });
});

describe("one box for a phone or an email", () => {
  it("reads an email, a phone with its country code, or nothing", () => {
    expect(contactFrom("")).toEqual({});
    expect(contactFrom(" Bo@Example.com ")).toEqual({
      email: "bo@example.com",
    });
    expect(contactFrom("+1 (310) 555-0100")).toEqual({
      phoneE164: "+13105550100",
    });
  });
  it("never guesses a country", () => {
    expect(contactFrom("310 555 0100").error).toMatch(/country code/);
    expect(contactFrom("bo@").error).toBeDefined();
  });
});
