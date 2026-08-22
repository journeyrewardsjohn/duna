import { describe, expect, it } from "vitest";
import { expectedTeamSizeSchema, teamClaimTokenSchema } from "./contracts";

describe("expected team size contract", () => {
  it("accepts one-player entries for individual KOB", () => {
    expect(expectedTeamSizeSchema.safeParse(1).success).toBe(true);
  });

  it("continues to reject invalid team sizes", () => {
    expect(expectedTeamSizeSchema.safeParse(0).success).toBe(false);
    expect(expectedTeamSizeSchema.safeParse(7).success).toBe(false);
  });
});

describe("team claim token contract", () => {
  it("accepts both checkout UUIDs and organizer-created opaque tokens", () => {
    expect(
      teamClaimTokenSchema.safeParse("c1d7fd7a-c97b-4c6c-8a25-a5864f388ab6")
        .success,
    ).toBe(true);
    expect(
      teamClaimTokenSchema.safeParse(
        "0ad323e8fcca425d99550077004e8b9668453893631e47e081f353638354a985",
      ).success,
    ).toBe(true);
  });

  it("rejects malformed or navigable claim values", () => {
    expect(teamClaimTokenSchema.safeParse("too-short").success).toBe(false);
    expect(
      teamClaimTokenSchema.safeParse("https://example.com/not-a-token").success,
    ).toBe(false);
    expect(
      teamClaimTokenSchema.safeParse("validlength but spaces").success,
    ).toBe(false);
  });
});
