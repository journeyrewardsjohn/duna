import { describe, expect, it } from "vitest";
import { findMe } from "./identity";

const row = (
  overrides: Partial<Parameters<typeof findMe>[0][number]> = {},
) => ({
  id: "staff-1",
  personId: "person-1",
  displayName: "Theo Park",
  email: "Theo@Club.example",
  role: "coach" as const,
  isOwner: false,
  active: true,
  ...overrides,
});

describe("finding me on the team list", () => {
  it("matches the signed-in email, ignoring case and spaces", () => {
    expect(findMe([row()], "  theo@club.example ")).toEqual({
      staffProfileId: "staff-1",
      personId: "person-1",
      displayName: "Theo Park",
      role: "coach",
      isOwner: false,
    });
  });

  it("never guesses: no email, no match or a paused member is nobody", () => {
    expect(findMe([row()], undefined)).toBeUndefined();
    expect(findMe([row()], "someone@club.example")).toBeUndefined();
    expect(
      findMe([row({ active: false })], "theo@club.example"),
    ).toBeUndefined();
    expect(
      findMe([row({ email: undefined })], "theo@club.example"),
    ).toBeUndefined();
  });
});
