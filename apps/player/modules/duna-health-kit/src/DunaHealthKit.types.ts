import type { HealthCategory, HealthSampleInput } from "@duna/api";

export type HealthKitCursor = Readonly<Record<string, string>>;

export type HealthKitChanges = {
  readonly samples: readonly HealthSampleInput[];
  readonly deletedExternalIds: readonly string[];
  readonly cursors: HealthKitCursor;
  readonly hasMore: boolean;
};

export type DunaHealthKitModuleEvents = {
  onHealthDataChanged: (payload: {
    readonly metric: string;
    readonly detectedAt: string;
  }) => void;
};

export type HealthKitAuthorizationRequest = {
  readonly requested: true;
  readonly categories: readonly HealthCategory[];
  /** HealthKit does not reveal whether read access was denied. */
  readonly readStatus: "not-disclosed-by-healthkit";
};
