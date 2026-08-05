import { NativeModule, requireOptionalNativeModule } from "expo";
import type {
  DunaHealthKitModuleEvents,
  HealthKitAuthorizationRequest,
  HealthKitChanges,
} from "./DunaHealthKit.types";

declare class DunaHealthKitNativeModule extends NativeModule<DunaHealthKitModuleEvents> {
  isAvailable(): boolean;
  requestAuthorization(
    categoriesJson: string,
  ): Promise<HealthKitAuthorizationRequest>;
  readChanges(
    categoriesJson: string,
    cursorJson: string | null,
    limitPerType: number,
  ): Promise<string>;
  startMonitoring(categoriesJson: string): Promise<boolean>;
  stopMonitoring(): void;
}

const nativeModule =
  requireOptionalNativeModule<DunaHealthKitNativeModule>("DunaHealthKit");

export function parseHealthKitChanges(value: string): HealthKitChanges {
  return JSON.parse(value) as HealthKitChanges;
}

export default nativeModule;
