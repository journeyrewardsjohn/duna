export type MigrationReceipt = {
  readonly hash: string;
  readonly tag: string;
  readonly when: number;
};

export type StoredMigrationReceipt = {
  readonly createdAt: number;
  readonly hash: string;
};

/**
 * Evidence collected before recovering migration receipts. Every condition must
 * hold before a completed migration is acknowledged without replaying its DDL.
 */
export type DunaVisionMigrationEvidence = {
  readonly scraperControls: boolean;
  readonly sourceConnectionActivity: boolean;
  readonly visionColumns: boolean;
  readonly visionIndexes: boolean;
  readonly visionTables: boolean;
  readonly visionTimelineReviewMarker: boolean;
  readonly visionConstraints: boolean;
};

export const dunaVisionReceiptSources = [
  { tag: "0071_thick_dark_beast", when: 1_786_881_853_788 },
  { tag: "0072_solid_bushwacker", when: 1_786_900_037_985 },
] as const;

export function planDunaVisionReceiptRecovery({
  evidence,
  expected,
  stored,
}: {
  readonly evidence: DunaVisionMigrationEvidence;
  readonly expected: readonly MigrationReceipt[];
  readonly stored: readonly StoredMigrationReceipt[];
}): MigrationReceipt[] {
  if (!Object.values(evidence).every(Boolean)) return [];

  for (const receipt of expected) {
    const receiptAtTimestamp = stored.find(
      (candidate) => candidate.createdAt === receipt.when,
    );
    if (receiptAtTimestamp && receiptAtTimestamp.hash !== receipt.hash) {
      throw new Error(
        `Cannot recover ${receipt.tag}: the stored receipt at ${receipt.when} has a different hash.`,
      );
    }
  }

  return expected.filter(
    (receipt) =>
      !stored.some(
        (candidate) =>
          candidate.createdAt === receipt.when &&
          candidate.hash === receipt.hash,
      ),
  );
}
