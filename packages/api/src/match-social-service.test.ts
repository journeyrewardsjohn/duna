import { describe, expect, it } from "vitest";
import { communityAccessFromFacts } from "./match-social-service";

describe("match community membership policy", () => {
  it("requires both a verified account and paid Player Premium", () => {
    expect(
      communityAccessFromFacts({ verified: true, paidPremium: true }),
    ).toEqual({
      verified: true,
      paidPremium: true,
      canComment: true,
    });

    expect(
      communityAccessFromFacts({ verified: true, paidPremium: false }),
    ).toMatchObject({
      verified: true,
      paidPremium: false,
      canComment: false,
      reason: expect.stringContaining("Player Premium"),
    });
  });

  it("does not let an unverified paid account comment", () => {
    expect(
      communityAccessFromFacts({ verified: false, paidPremium: true }),
    ).toMatchObject({
      verified: false,
      paidPremium: true,
      canComment: false,
      reason: expect.stringContaining("verifying"),
    });
  });
});
