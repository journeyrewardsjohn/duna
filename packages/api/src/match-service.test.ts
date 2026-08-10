import { describe, expect, it } from "vitest";
import { matchParticipantInvitationMessage } from "./match-service";

describe("matchParticipantInvitationMessage", () => {
  it("uses the reported opponents and unique claim link as the invitation hook", () => {
    expect(
      matchParticipantInvitationMessage({
        opponentNames: ["Mara", "Elena"],
        inviteUrl: "https://duna.coach/join/match/unique-token",
      }),
    ).toBe(
      "Your match against Mara & Elena has been reported in Duna. Join now to see your rating and track your progress for free. https://duna.coach/join/match/unique-token",
    );
  });

  it("keeps a useful fallback when the opposing roster is unavailable", () => {
    expect(
      matchParticipantInvitationMessage({
        opponentNames: [],
        inviteUrl: "https://duna.coach/join/match/unique-token",
      }),
    ).toContain("against your opponents");
  });
});
