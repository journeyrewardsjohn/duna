import { describe, expect, it } from "vitest";
import { evaluateDivisionCriteria } from "./division-eligibility";

const eventDate = new Date("2026-08-29T19:00:00Z");

describe("division eligibility criteria", () => {
  it("returns every reason that makes a player ineligible", () => {
    expect(
      evaluateDivisionCriteria({
        asOf: eventDate,
        criteria: {
          ageMinimum: 18,
          gender: "Women's",
          ratingMinimum: 3.5,
        },
        participant: {
          birthDate: "2015-09-01",
          genderCategory: "male",
          rating: 2.4,
        },
      }),
    ).toEqual({
      eligible: false,
      reasons: [
        "Rating must be 3.50 or higher",
        "Must be 18 or older",
        "This is a women's division",
      ],
    });
  });

  it("fails closed when required identity criteria are not verified", () => {
    expect(
      evaluateDivisionCriteria({
        asOf: eventDate,
        criteria: { ageMaximum: 17, gender: "Girls" },
        participant: { rating: 3 },
      }),
    ).toEqual({
      eligible: false,
      reasons: [
        "Age eligibility is not verified",
        "Gender eligibility is not verified",
      ],
    });
  });

  it("evaluates age on the event date", () => {
    expect(
      evaluateDivisionCriteria({
        asOf: eventDate,
        criteria: { ageMinimum: 18 },
        participant: { birthDate: "2008-08-29", rating: 3 },
      }).eligible,
    ).toBe(true);
  });
});
