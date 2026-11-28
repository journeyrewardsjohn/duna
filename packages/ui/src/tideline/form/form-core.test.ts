import { describe, expect, it } from "vitest";
import {
  characterCount,
  cleanErrors,
  currencySymbol,
  editableMoney,
  errorSummary,
  formatMoneyInput,
  mergeErrors,
  parseMoneyMinor,
  sanitizeMoney,
} from "./form-core";

describe("money", () => {
  it("drops what a money field cannot hold and keeps the caret with its characters", () => {
    // Typed a letter after "48": the caret stays after the 8.
    expect(sanitizeMoney("48a", 3)).toEqual({ text: "48", caret: 2 });
    // Typed a comma in the middle of "1234": the caret does not jump.
    expect(sanitizeMoney("1,234", 2)).toEqual({ text: "1234", caret: 1 });
    // A second point and a third decimal are refused.
    expect(sanitizeMoney("12.3.4", 6)).toEqual({ text: "12.34", caret: 5 });
    expect(sanitizeMoney("12.345", 6)).toEqual({ text: "12.34", caret: 5 });
    // No decimals for zero-decimal currencies.
    expect(sanitizeMoney("1200.5", 6, { decimals: 0 })).toEqual({
      text: "12005",
      caret: 5,
    });
  });

  it("parses to minor units", () => {
    expect(parseMoneyMinor("48")).toBe(4800);
    expect(parseMoneyMinor("48.5")).toBe(4850);
    expect(parseMoneyMinor(".5")).toBe(50);
    expect(parseMoneyMinor("1,234.56")).toBe(123456);
    expect(parseMoneyMinor("")).toBeNull();
    expect(parseMoneyMinor(".")).toBeNull();
    expect(parseMoneyMinor("1200", { decimals: 0 })).toBe(1200);
  });

  it("groups at rest and not while editing", () => {
    expect(formatMoneyInput(123456)).toBe("1,234.56");
    expect(formatMoneyInput(null)).toBe("");
    expect(editableMoney(123456)).toBe("1234.56");
    expect(editableMoney(4800)).toBe("48.00");
  });

  it("finds the currency symbol", () => {
    expect(currencySymbol("USD")).toBe("$");
    expect(currencySymbol("EUR", "de-DE")).toBe("€");
  });
});

describe("characters", () => {
  it("counts what a person sees, and says when it is near or over", () => {
    expect(characterCount("Serve drill", 160)).toMatchObject({
      count: 11,
      over: false,
      near: false,
    });
    expect(characterCount("🏐🏐", 2)).toMatchObject({
      count: 2,
      remaining: 0,
      near: true,
    });
    expect(characterCount("abc", 2)).toMatchObject({
      over: true,
      remaining: -1,
    });
  });
});

describe("errors", () => {
  it("drops empty messages and lets the server win", () => {
    expect(
      cleanErrors({ name: "Enter a name.", email: undefined, phone: "" }),
    ).toEqual({
      name: "Enter a name.",
    });
    expect(
      mergeErrors(
        { email: "Enter an email." },
        { email: "That email is taken." },
      ),
    ).toEqual({ email: "That email is taken." });
  });

  it("summarises for the announcement", () => {
    expect(errorSummary({})).toBe("");
    expect(errorSummary({ a: "x" })).toBe("1 field needs attention.");
    expect(errorSummary({ a: "x", b: "y" })).toBe("2 fields need attention.");
  });
});
