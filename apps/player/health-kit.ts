import type { HealthCategory } from "@duna/api";
import * as SecureStore from "expo-secure-store";
import type { DunaApiClient } from "./mobile-api";
import DunaHealthKit, {
  parseHealthKitChanges,
  type HealthKitAuthorizationRequest,
} from "./modules/duna-health-kit";
import {
  mergeAppleHealthSyncState,
  planHealthUploadBatches,
  type AppleHealthSyncState,
} from "./health-sync-utils";

const HEALTH_CURSOR_KEY = "duna.healthkit.cursor.v1";
const HEALTH_DIRTY_KEY = "duna.healthkit.changes.v1";
const HEALTH_BACKFILL_KEY = "duna.healthkit.backfill.v2";
// The native reader fills one bounded page across selected types. Busy sources
// such as Apple Watch or WHOOP can therefore use the whole page instead of
// advancing only a handful of records per sync.
const HEALTHKIT_PAGE_RECORD_LIMIT = 400;
// Stay below the original production sync guard while a large backfill is in
// progress. A remaining anchor is retained and the next foreground/manual sync
// continues exactly where this session stopped.
const MAX_HEALTHKIT_PAGES_PER_SYNC = 25;

export type HealthSyncProgress = {
  readonly phase: "reading" | "uploading";
  readonly pages: number;
  readonly imported: number;
  readonly deleted: number;
  readonly recordsFound: number;
  readonly pendingRecords: number;
  readonly totalRecordsProcessed: number;
  readonly remainingMetrics: readonly string[];
};

export type AppleHealthSyncInput = {
  readonly client: DunaApiClient;
  readonly categories: readonly HealthCategory[];
  readonly maxPages?: number;
  readonly onProgress?: (progress: HealthSyncProgress) => void;
};

export type AppleHealthSyncResult = {
  readonly pages: number;
  readonly imported: number;
  readonly deleted: number;
  readonly complete: boolean;
  readonly recordsFound: number;
  readonly state: AppleHealthSyncState;
};

let appleHealthSyncActive = false;

export function isAppleHealthSyncActive(): boolean {
  return appleHealthSyncActive;
}

export const healthCategoryDetails: Readonly<
  Record<
    HealthCategory,
    {
      readonly label: string;
      readonly description: string;
      readonly icon: string;
    }
  >
> = {
  heart: {
    label: "Heart",
    description:
      "Heart rate, resting heart rate, HRV, walking heart rate and VO₂ max",
    icon: "♥",
  },
  recovery: {
    label: "Recovery",
    description:
      "Sleep, respiratory rate, oxygen saturation and body temperature",
    icon: "☾",
  },
  activity: {
    label: "Activity",
    description: "Energy, steps, distance, exercise, stand time and workouts",
    icon: "↗",
  },
  body: {
    label: "Body",
    description: "Weight, body-fat percentage and lean body mass",
    icon: "◎",
  },
};

export function isAppleHealthAvailable(): boolean {
  return Boolean(DunaHealthKit?.isAvailable());
}

export async function requestAppleHealthAccess(
  categories: readonly HealthCategory[],
): Promise<HealthKitAuthorizationRequest> {
  if (!DunaHealthKit || !DunaHealthKit.isAvailable()) {
    throw new Error(
      "Apple Health is available only in the installed Duna iPhone app.",
    );
  }
  return DunaHealthKit.requestAuthorization(JSON.stringify(categories));
}

export async function syncAppleHealth(
  input: AppleHealthSyncInput,
): Promise<AppleHealthSyncResult> {
  if (appleHealthSyncActive) {
    throw new Error("Apple Health history is already syncing.");
  }
  appleHealthSyncActive = true;
  try {
    return await syncAppleHealthOnce(input);
  } finally {
    appleHealthSyncActive = false;
  }
}

async function syncAppleHealthOnce(
  input: AppleHealthSyncInput,
): Promise<AppleHealthSyncResult> {
  if (!DunaHealthKit || !DunaHealthKit.isAvailable()) {
    throw new Error("Apple Health is unavailable on this device.");
  }
  let cursor = await SecureStore.getItemAsync(HEALTH_CURSOR_KEY);
  let pages = 0;
  let imported = 0;
  let deleted = 0;
  let recordsFound = 0;
  let hasMore = true;
  let remainingMetrics: readonly string[] = [];
  let syncState = await getAppleHealthSyncState();
  const startingRecordsProcessed = syncState?.recordsProcessed ?? 0;
  const pageBudget = Math.max(
    1,
    Math.min(
      input.maxPages ?? MAX_HEALTHKIT_PAGES_PER_SYNC,
      MAX_HEALTHKIT_PAGES_PER_SYNC,
    ),
  );
  while (hasMore && pages < pageBudget) {
    input.onProgress?.({
      phase: "reading",
      pages,
      imported,
      deleted,
      recordsFound,
      pendingRecords: 0,
      totalRecordsProcessed: startingRecordsProcessed + recordsFound,
      remainingMetrics,
    });
    const raw = await DunaHealthKit.readChanges(
      JSON.stringify(input.categories),
      cursor,
      HEALTHKIT_PAGE_RECORD_LIMIT,
    );
    const changes = parseHealthKitChanges(raw);
    remainingMetrics = changes.metricsWithMore ?? [];
    recordsFound += changes.samples.length + changes.deletedExternalIds.length;
    const uploadBatches = planHealthUploadBatches(
      changes.samples,
      changes.deletedExternalIds,
    );
    for (const batch of uploadBatches) {
      input.onProgress?.({
        phase: "uploading",
        pages,
        imported,
        deleted,
        recordsFound,
        pendingRecords: batch.samples.length + batch.deletedExternalIds.length,
        totalRecordsProcessed: startingRecordsProcessed + recordsFound,
        remainingMetrics,
      });
      const earliestAuthorizedAt = batch.samples
        .map((sample) => sample.startedAt)
        .sort()[0];
      const result = await input.client.player.syncHealthSamples.mutate({
        categories: [...input.categories],
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        earliestAuthorizedAt,
        samples: [...batch.samples],
        deletedExternalIds: [...batch.deletedExternalIds],
      });
      if (result.protocolVersion !== 2) {
        throw new Error(
          "Duna Health secure history support is still rolling out. Your import checkpoint was preserved; please try again shortly.",
        );
      }
      imported += result.imported;
      deleted += result.deleted;
    }
    // The secure local anchor advances only after Duna acknowledges the batch.
    cursor = JSON.stringify(changes.cursors);
    await SecureStore.setItemAsync(HEALTH_CURSOR_KEY, cursor);
    pages += 1;
    hasMore = changes.hasMore;
    const now = new Date().toISOString();
    syncState = mergeAppleHealthSyncState({
      previous: syncState,
      categories: input.categories,
      recordsProcessed: changes.samples.length,
      deletionsProcessed: changes.deletedExternalIds.length,
      pagesProcessed: 1,
      complete: !hasMore,
      remainingMetrics,
      now,
    });
    await SecureStore.setItemAsync(
      HEALTH_BACKFILL_KEY,
      JSON.stringify(syncState),
    );
    if (
      !hasMore ||
      (changes.samples.length === 0 && changes.deletedExternalIds.length === 0)
    ) {
      break;
    }
  }
  if (hasMore) {
    await SecureStore.setItemAsync(HEALTH_DIRTY_KEY, new Date().toISOString());
  } else {
    await SecureStore.deleteItemAsync(HEALTH_DIRTY_KEY);
  }
  const finalState =
    syncState ??
    mergeAppleHealthSyncState({
      categories: input.categories,
      recordsProcessed: 0,
      deletionsProcessed: 0,
      pagesProcessed: pages,
      complete: !hasMore,
      remainingMetrics,
      now: new Date().toISOString(),
    });
  return {
    pages,
    imported,
    deleted,
    complete: !hasMore,
    recordsFound,
    state: finalState,
  };
}

export async function getAppleHealthSyncState(): Promise<
  AppleHealthSyncState | undefined
> {
  const stored = await SecureStore.getItemAsync(HEALTH_BACKFILL_KEY);
  if (!stored) return undefined;
  try {
    return JSON.parse(stored) as AppleHealthSyncState;
  } catch {
    await SecureStore.deleteItemAsync(HEALTH_BACKFILL_KEY);
    return undefined;
  }
}

export async function hasPendingAppleHealthChanges(): Promise<boolean> {
  return Boolean(await SecureStore.getItemAsync(HEALTH_DIRTY_KEY));
}

export async function startAppleHealthMonitoring(
  categories: readonly HealthCategory[],
): Promise<(() => void) | undefined> {
  if (!DunaHealthKit || !DunaHealthKit.isAvailable()) return undefined;
  const module = DunaHealthKit;
  const subscription = module.addListener("onHealthDataChanged", () => {
    void SecureStore.setItemAsync(HEALTH_DIRTY_KEY, new Date().toISOString());
  });
  await module.startMonitoring(JSON.stringify(categories));
  return () => {
    subscription.remove();
    module.stopMonitoring();
  };
}

export async function clearAppleHealthCursor(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(HEALTH_CURSOR_KEY),
    SecureStore.deleteItemAsync(HEALTH_DIRTY_KEY),
    SecureStore.deleteItemAsync(HEALTH_BACKFILL_KEY),
  ]);
}
