import { describe, expect, it } from "vitest";
import { buildTournamentWalletPassDefinition } from "./wallet-pass";

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
