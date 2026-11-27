import { NativeModule, requireOptionalNativeModule } from "expo";
import type {
  DunaHealthKitModuleEvents,
  HealthKitAuthorizationRequest,
  HealthKitChanges,
} from "./DunaHealthKit.types";

declare class DunaHealthKitNativeModule extends NativeModule<DunaHealthKitModuleEvents> {
  isAvailable(): boolean;
  /** StoreKit storefront country (ISO alpha-3, e.g. "USA"); a client claim. */
  storefrontCountryCode(): Promise<string | null>;
  /**
   * `metricsJson` narrows HealthKit to the metric allowlist Duna returned for
   * the player's age band; null keeps every metric in the categories.
   */
  requestAuthorization(
    categoriesJson: string,
    metricsJson: string | null,
  ): Promise<HealthKitAuthorizationRequest>;
  readChanges(
    categoriesJson: string,
    cursorJson: string | null,
    recordLimit: number,
    metricsJson: string | null,
  ): Promise<string>;
  startMonitoring(
    categoriesJson: string,
    metricsJson: string | null,
  ): Promise<boolean>;
  stopMonitoring(): void;
}

const nativeModule =
  requireOptionalNativeModule<DunaHealthKitNativeModule>("DunaHealthKit");

export function parseHealthKitChanges(value: string): HealthKitChanges {
  return JSON.parse(value) as HealthKitChanges;
}

export default nativeModule;
