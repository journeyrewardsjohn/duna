import { describe, expect, it } from "vitest";
import { expectedTeamSizeSchema } from "./contracts";

describe("expected team size contract", () => {
  it("accepts one-player entries for individual KOB", () => {
    expect(expectedTeamSizeSchema.safeParse(1).success).toBe(true);
  });

  it("continues to reject invalid team sizes", () => {
    expect(expectedTeamSizeSchema.safeParse(0).success).toBe(false);
    expect(expectedTeamSizeSchema.safeParse(7).success).toBe(false);
  });
});
