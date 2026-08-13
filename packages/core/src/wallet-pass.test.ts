import { describe, expect, it } from "vitest";
import {
  buildMemberWalletPassDefinition,
  buildTournamentWalletPassDefinition,
} from "./wallet-pass";

const shared = {
  id: "10000000-0000-4000-8000-000000000001",
  eventTitle: "Duna Summer Championship",
  holderName: "Sam Sutton",
  startsAt: "2026-08-29T13:00:00.000Z",
  endsAt: "2026-08-29T22:00:00.000Z",
  venueName: "The Strand",
  usable: true,
  passTypeIdentifier: "pass.coach.duna.tournament",
  teamIdentifier: "DUNATEAM",
} as const;

describe("tournament Apple Wallet passes", () => {
  it("creates a player check-in pass that cannot be mistaken for fan admission", () => {
    const pass = buildTournamentWalletPassDefinition({
      ...shared,
      kind: "player-registration",
      credentialPayload:
        "duna:admission:v1:player-registration:10000000-0000-4000-8000-000000000001",
      passLabel: "Player check-in",
    });

    expect(pass.logoText).toBe("Duna Player");
    expect(pass.eventTicket.primaryFields[0]?.label).toBe(
      "PLAYER REGISTRATION",
    );
    expect(pass.barcodes[0]?.message).toContain(":player-registration:");
  });

  it("creates a visually distinct fan ticket with a fan-only credential", () => {
    const pass = buildTournamentWalletPassDefinition({
      ...shared,
      kind: "fan-ticket",
      credentialPayload: "duna:admission:v1:fan-ticket:ticket-token-123456789",
      passLabel: "General admission",
    });

    expect(pass.logoText).toBe("Duna Tickets");
    expect(pass.eventTicket.primaryFields[0]?.label).toBe("ADMISSION TICKET");
    expect(pass.barcodes[0]?.message).toContain(":fan-ticket:");
  });
});

describe("Duna Membership Apple Wallet pass", () => {
  it("keeps personal details out of the QR and shows the next activity", () => {
    const pass = buildMemberWalletPassDefinition({
      personId: "person-1",
      memberId: "0DUNA7",
      holderName: "Maya Torres",
      credentialPayload: "duna:member:v1:opaque-token",
      upcoming: [
        {
          title: "Friday 2s",
          startsAt: "2026-08-14T18:00:00.000Z",
          venueName: "The Strand",
        },
      ],
      passTypeIdentifier: "pass.com.duna.member",
      teamIdentifier: "TEAM123",
    });

    expect(pass.barcodes[0]?.message).toBe("duna:member:v1:opaque-token");
    expect(pass.barcodes[0]?.message).not.toContain("Maya");
    expect(pass.storeCard.secondaryFields[1]?.value).toBe("Friday 2s");
    expect(pass.relevantDate).toBe("2026-08-14T18:00:00.000Z");
  });
});
