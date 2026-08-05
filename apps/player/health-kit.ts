import type { HealthCategory } from "@duna/api";
import * as SecureStore from "expo-secure-store";
import type { DunaApiClient } from "./mobile-api";
import DunaHealthKit, {
  parseHealthKitChanges,
  type HealthKitAuthorizationRequest,
} from "./modules/duna-health-kit";

const HEALTH_CURSOR_KEY = "duna.healthkit.cursor.v1";
const HEALTH_DIRTY_KEY = "duna.healthkit.changes.v1";

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
  readonly onBatch?: (progress: {
    readonly batches: number;
    readonly imported: number;
    readonly deleted: number;
  }) => void;
}): Promise<{
  readonly batches: number;
  readonly imported: number;
  readonly deleted: number;
}> {
  if (!DunaHealthKit || !DunaHealthKit.isAvailable()) {
    throw new Error("Apple Health is unavailable on this device.");
  }
  let cursor = await SecureStore.getItemAsync(HEALTH_CURSOR_KEY);
  let batches = 0;
  let imported = 0;
  let deleted = 0;
  let hasMore = true;
  while (hasMore && batches < 50) {
    const raw = await DunaHealthKit.readChanges(
      JSON.stringify(input.categories),
      cursor,
      250,
    );
    const changes = parseHealthKitChanges(raw);
    const result = await input.client.player.syncHealthSamples.mutate({
      categories: [...input.categories],
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      samples: [...changes.samples],
      deletedExternalIds: [...changes.deletedExternalIds],
    });
    // The secure local anchor advances only after Duna acknowledges the batch.
    cursor = JSON.stringify(changes.cursors);
    await SecureStore.setItemAsync(HEALTH_CURSOR_KEY, cursor);
    batches += 1;
    imported += result.imported;
    deleted += result.deleted;
    input.onBatch?.({ batches, imported, deleted });
    hasMore = changes.hasMore;
    if (
      !hasMore ||
      (changes.samples.length === 0 && changes.deletedExternalIds.length === 0)
    ) {
      break;
    }
  }
  await SecureStore.deleteItemAsync(HEALTH_DIRTY_KEY);
  return { batches, imported, deleted };
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
