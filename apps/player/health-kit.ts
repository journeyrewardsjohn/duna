import type { HealthCategory } from "@duna/api";
import * as SecureStore from "expo-secure-store";
import type { DunaApiClient } from "./mobile-api";
import DunaHealthKit, {
  parseHealthKitChanges,
  type HealthKitAuthorizationRequest,
} from "./modules/duna-health-kit";
import { planHealthUploadBatches } from "./health-sync-utils";

const HEALTH_CURSOR_KEY = "duna.healthkit.cursor.v1";
const HEALTH_DIRTY_KEY = "duna.healthkit.changes.v1";
const HEALTHKIT_PAGE_LIMIT_PER_TYPE = 20;
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
};

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

export async function syncAppleHealth(input: {
  readonly client: DunaApiClient;
  readonly categories: readonly HealthCategory[];
  readonly onProgress?: (progress: HealthSyncProgress) => void;
}): Promise<{
  readonly pages: number;
  readonly imported: number;
  readonly deleted: number;
  readonly complete: boolean;
}> {
  if (!DunaHealthKit || !DunaHealthKit.isAvailable()) {
    throw new Error("Apple Health is unavailable on this device.");
  }
  let cursor = await SecureStore.getItemAsync(HEALTH_CURSOR_KEY);
  let pages = 0;
  let imported = 0;
  let deleted = 0;
  let recordsFound = 0;
  let hasMore = true;
  while (hasMore && pages < MAX_HEALTHKIT_PAGES_PER_SYNC) {
    input.onProgress?.({
      phase: "reading",
      pages,
      imported,
      deleted,
      recordsFound,
      pendingRecords: 0,
    });
    const raw = await DunaHealthKit.readChanges(
      JSON.stringify(input.categories),
      cursor,
      HEALTHKIT_PAGE_LIMIT_PER_TYPE,
    );
    const changes = parseHealthKitChanges(raw);
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
      });
      const result = await input.client.player.syncHealthSamples.mutate({
        categories: [...input.categories],
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        samples: [...batch.samples],
        deletedExternalIds: [...batch.deletedExternalIds],
      });
      imported += result.imported;
      deleted += result.deleted;
    }
    // The secure local anchor advances only after Duna acknowledges the batch.
    cursor = JSON.stringify(changes.cursors);
    await SecureStore.setItemAsync(HEALTH_CURSOR_KEY, cursor);
    pages += 1;
    hasMore = changes.hasMore;
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
  return { pages, imported, deleted, complete: !hasMore };
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
  ]);
}
