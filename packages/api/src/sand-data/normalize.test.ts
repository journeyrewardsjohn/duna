import { describe, expect, it } from "vitest";
import {
  crossSourceMatchFingerprint,
  matchMappingConfidence,
  normalizePersonName,
  sourceMatchFingerprint,
} from "./normalize";
import type { ExternalMatchRecord } from "./types";

const match: ExternalMatchRecord = {
  externalMatchId: "m-1",
  externalEventId: "event-1",
  title: "Test event",
  playedAt: "2026-07-31T12:00:00.000Z",
  participants: [
    { externalPersonId: "1", name: "Ána Smith", side: "A" },
    { externalPersonId: "2", name: "Bea Jones", side: "A" },
    { externalPersonId: "3", name: "Cara Brown", side: "B" },
    { externalPersonId: "4", name: "Dana Reed", side: "B" },
  ],
  sets: [
    { a: 21, b: 18 },
    { a: 21, b: 17 },
  ],
  winnerSide: "A",
  raw: {},
};

describe("sand data normalization", () => {
  it("normalizes names without losing identity-significant characters", () => {
    expect(normalizePersonName("  Ána  Smith-Jones ")).toBe("ana smith jones");
  });

  it("keeps source and cross-source fingerprints deterministic", () => {
    expect(sourceMatchFingerprint("bvbinfo", match)).toBe(
      sourceMatchFingerprint("bvbinfo", match),
    );
    expect(sourceMatchFingerprint("bvbinfo", match)).not.toBe(
      sourceMatchFingerprint("volleyball-life", match),
    );
    expect(crossSourceMatchFingerprint(match)).toHaveLength(64);
  });

  it("uses conservative confidence bands for identity suggestions", () => {
    expect(
      matchMappingConfidence({
        externalIdMatched: true,
        externalName: "Ana Smith",
        candidateName: "Different Name",
      }),
    ).toBe(10_000);
    expect(
      matchMappingConfidence({
        externalIdMatched: false,
        externalName: "Ana Smith",
        candidateName: "Ana Smith",
      }),
    ).toBe(9_500);
    expect(
      matchMappingConfidence({
        externalIdMatched: false,
        externalName: "A. Smith",
        candidateName: "Ana Smith",
      }),
    ).toBe(7_000);
  });
});
