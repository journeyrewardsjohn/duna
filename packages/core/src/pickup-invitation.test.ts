import { describe, expect, it } from "vitest";
import {
  pickupInviteActionLabel,
  pickupInviteExplanation,
  pickupInviteResult,
} from "./pickup-invitation";

describe("pickup invitation language", () => {
  it("uses a direct action instead of internal capacity terminology", () => {
    expect(pickupInviteActionLabel(1)).toBe("Send invite");
    expect(pickupInviteActionLabel(3)).toBe("Send 3 invites");
  });

  it("explains who confirms and when spots remain available", () => {
    expect(pickupInviteExplanation(false)).toBe(
      "Invited players confirm their own place. Spots stay open until then.",
    );
    expect(pickupInviteExplanation(true)).toBe(
      "Invited players confirm and pay for their own place. Spots stay open until then.",
    );
  });

  it("reports sent and already-active players in plain language", () => {
    expect(
      pickupInviteResult({
        invitedCount: 1,
        alreadyActiveCount: 0,
        paidMatch: false,
      }),
    ).toBe("Invite sent. Spots stay open until the player confirms.");
    expect(
      pickupInviteResult({
        invitedCount: 0,
        alreadyActiveCount: 1,
        paidMatch: true,
      }),
    ).toBe("This player is already part of this match.");
  });
});
