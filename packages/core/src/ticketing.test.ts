import { describe, expect, it } from "vitest";
import {
  claimTeamPartner,
  expireTeamClaim,
  promoteWaitlist,
  scanTicket,
  validateTicketTypePolicy,
  type TeamClaimState,
} from "./ticketing";

describe("events and ticketing state machines", () => {
  it("enforces mutually exclusive visibility and password states", () => {
    expect(
      validateTicketTypePolicy({
        hidden: true,
        passwordProtected: true,
        approvalRequired: false,
        inPersonOnly: false,
        manualSoldOut: false,
        transferability: "allowed",
        minimumPerOrder: 2,
        maximumPerOrder: 1,
        salesStartsAt: "2026-08-02T00:00:00Z",
        salesEndsAt: "2026-08-01T00:00:00Z",
      }),
    ).toEqual([
      "hidden-and-password-protected",
      "invalid-order-limits",
      "invalid-sales-window",
    ]);
  });

  const claim: TeamClaimState = {
    registrationId: "registration-1",
    payingPersonId: "player-1",
    token: "claim-secret",
    expiresAt: "2026-08-01T00:00:00Z",
    status: "pending",
  };

  it("blocks an ineligible partner and records a reason", () => {
    expect(
      claimTeamPartner({
        state: claim,
        token: claim.token,
        partnerPersonId: "player-2",
        now: "2026-07-30T12:00:00Z",
        eligibility: { allowed: false, reasons: ["rating-above-cap"] },
      }),
    ).toMatchObject({
      accepted: false,
      status: "pending",
      reason: "partner-ineligible",
      eligibilityReasons: ["rating-above-cap"],
    });
  });

  it("requires a reasoned, auditable director override", () => {
    expect(
      claimTeamPartner({
        state: claim,
        token: claim.token,
        partnerPersonId: "player-2",
        now: "2026-07-30T12:00:00Z",
        eligibility: { allowed: false, reasons: ["rating-above-cap"] },
        directorOverride: {
          actorPersonId: "director-1",
          reason: "Verified open-division exception",
        },
      }),
    ).toMatchObject({
      accepted: true,
      status: "claimed",
      rosterLockedAt: "2026-07-30T12:00:00Z",
      auditRequired: true,
    });
  });

  it("routes an expired claim to the configured fallback", () => {
    expect(
      expireTeamClaim({
        state: claim,
        now: "2026-08-01T00:00:00Z",
        fallback: "partner-finder",
      }).status,
    ).toBe("partner-finder");
  });

  it("detects duplicate scans even while a device is offline", () => {
    const decision = scanTicket({
      ticketToken: "ticket-1",
      status: "issued",
      previouslyScannedTokens: new Set(["ticket-1"]),
      scannedAt: "2026-07-30T12:00:00Z",
      deviceId: "front-desk-iphone",
      offline: true,
    });
    expect(decision).toMatchObject({
      accepted: false,
      duplicate: true,
      reason: "already-scanned",
    });
  });

  it("promotes waitlists deterministically with a hold timer", () => {
    expect(
      promoteWaitlist({
        entries: [
          { id: "b", position: 2, status: "waiting" },
          { id: "a", position: 1, status: "waiting" },
          { id: "c", position: 3, status: "waiting" },
        ],
        spots: 2,
        now: "2026-07-30T12:00:00Z",
        holdMinutes: 15,
      }),
    ).toEqual([
      {
        id: "b",
        position: 2,
        status: "offered",
        holdExpiresAt: "2026-07-30T12:15:00.000Z",
      },
      {
        id: "a",
        position: 1,
        status: "offered",
        holdExpiresAt: "2026-07-30T12:15:00.000Z",
      },
      { id: "c", position: 3, status: "waiting" },
    ]);
  });
});
