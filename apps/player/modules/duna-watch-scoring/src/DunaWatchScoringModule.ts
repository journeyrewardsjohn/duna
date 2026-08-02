import { NativeModule, requireOptionalNativeModule } from "expo";
import type { DunaWatchScoringModuleEvents } from "./DunaWatchScoring.types";

declare class DunaWatchScoringNativeModule extends NativeModule<DunaWatchScoringModuleEvents> {
  isSupported(): boolean;
  syncMatch(json: string): boolean;
  getPendingScoreDraft(): string | null;
  clearPendingScoreDraft(): void;
}

export default requireOptionalNativeModule<DunaWatchScoringNativeModule>(
  "DunaWatchScoring",
);
