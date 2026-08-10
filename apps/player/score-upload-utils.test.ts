import { describe, expect, it } from "vitest";
import { validateCompletedScore } from "./score-upload-utils";

describe("validateCompletedScore", () => {
  it("accepts straight-set and deciding-set results", () => {
    expect(
      validateCompletedScore(2, [
        { a: 21, b: 17 },
        { a: 21, b: 19 },
      ]),
    ).toBeUndefined();
    expect(
      validateCompletedScore(2, [
        { a: 18, b: 21 },
        { a: 22, b: 20 },
        { a: 15, b: 11 },
      ]),
    ).toBeUndefined();
  });

  it("rejects tied sets and one-point margins", () => {
    expect(validateCompletedScore(1, [{ a: 21, b: 21 }])).toContain(
      "winner by at least two",
    );
    expect(validateCompletedScore(1, [{ a: 21, b: 20 }])).toContain(
      "winner by at least two",
    );
  });

  it("rejects sets recorded after a winner was decided", () => {
    expect(
      validateCompletedScore(2, [
        { a: 21, b: 10 },
        { a: 21, b: 12 },
        { a: 8, b: 15 },
      ]),
    ).toContain("after the match was already won");
  });
});
