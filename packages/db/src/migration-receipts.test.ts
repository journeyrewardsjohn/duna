import { describe, expect, it } from "vitest";
import {
  type DunaVisionMigrationEvidence,
  planDunaVisionReceiptRecovery,
} from "./migration-receipts";

const completeEvidence: DunaVisionMigrationEvidence = {
  scraperControls: true,
  sourceConnectionActivity: true,
  visionColumns: true,
  visionIndexes: true,
  visionTables: true,
  visionTimelineReviewMarker: true,
  visionConstraints: true,
};

const expected = [
  { hash: "main-hash", tag: "0071_thick_dark_beast", when: 71 },
  { hash: "vision-hash", tag: "0072_solid_bushwacker", when: 72 },
] as const;

describe("Duna Vision migration receipt recovery", () => {
  it("only recovers receipts after the complete schema footprint is present", () => {
    expect(
      planDunaVisionReceiptRecovery({
        evidence: { ...completeEvidence, visionIndexes: false },
        expected,
        stored: [],
      }),
    ).toEqual([]);

    expect(
      planDunaVisionReceiptRecovery({
        evidence: completeEvidence,
        expected,
        stored: [{ createdAt: 71, hash: "main-hash" }],
      }),
    ).toEqual([expected[1]]);
  });

  it("refuses to overwrite a conflicting migration receipt", () => {
    expect(() =>
      planDunaVisionReceiptRecovery({
        evidence: completeEvidence,
        expected,
        stored: [{ createdAt: 72, hash: "unexpected-hash" }],
      }),
    ).toThrow("different hash");
  });
});
