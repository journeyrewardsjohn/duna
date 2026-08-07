import { describe, expect, it } from "vitest";
import {
  encodeAdmissionCredential,
  parseAdmissionCredential,
} from "./admission";

describe("admission credentials", () => {
  it("keeps player registration and fan ticket credentials distinct", () => {
    const registration = encodeAdmissionCredential({
      kind: "player-registration",
      token: "10000000-0000-4000-8000-000000000001",
    });
    const ticket = encodeAdmissionCredential({
      kind: "fan-ticket",
      token: "ticket-token-123456789",
    });

    expect(parseAdmissionCredential(registration)).toEqual({
      version: 1,
      kind: "player-registration",
      token: "10000000-0000-4000-8000-000000000001",
    });
    expect(parseAdmissionCredential(ticket)?.kind).toBe("fan-ticket");
  });

  it("rejects malformed and ambiguous values", () => {
    expect(
      parseAdmissionCredential("10000000-0000-4000-8000-000000000001"),
    ).toBeUndefined();
    expect(
      parseAdmissionCredential("duna:admission:v1:fan-ticket:short"),
    ).toBeUndefined();
  });
});
