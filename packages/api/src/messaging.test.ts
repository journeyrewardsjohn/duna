import { describe, expect, it } from "vitest";
import { canSendAt, enforceGuardianCopies } from "./messaging";

describe("messaging safety", () => {
  it("adds every verified guardian at the server boundary", () => {
    expect(
      enforceGuardianCopies({
        recipientPersonId: "minor",
        recipientIsMinor: true,
        verifiedGuardianPersonIds: ["guardian-1", "guardian-2"],
        requestedCopyPersonIds: ["guardian-1"],
      }),
    ).toEqual({
      recipientPersonId: "minor",
      guardianCopyPersonIds: ["guardian-1", "guardian-2"],
      enforced: true,
    });
  });

  it("blocks coach-to-minor messages when no guardian is verified", () => {
    expect(() =>
      enforceGuardianCopies({
        recipientPersonId: "minor",
        recipientIsMinor: true,
        verifiedGuardianPersonIds: [],
      }),
    ).toThrow("verified guardian");
  });

  it("allows transactional notices through quiet hours", () => {
    expect(
      canSendAt({
        now: new Date("2026-07-30T05:00:00.000Z"),
        timezoneOffsetMinutes: -420,
        quietHoursStart: 21 * 60,
        quietHoursEnd: 8 * 60,
        transactional: true,
      }),
    ).toBe(true);
  });
});
