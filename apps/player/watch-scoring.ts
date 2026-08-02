import { Platform } from "react-native";
import DunaWatchScoring from "./modules/duna-watch-scoring";
import type {
  WatchMatchContext,
  WatchScoreDraft,
} from "./modules/duna-watch-scoring";

function parseDraft(value: string | null | undefined): WatchScoreDraft | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<WatchScoreDraft>;
    if (
      parsed.type !== "duna.scoreDraft" ||
      parsed.source !== "apple-watch" ||
      typeof parsed.draftId !== "string" ||
      !Array.isArray(parsed.sets)
    ) {
      return null;
    }
    return parsed as WatchScoreDraft;
  } catch {
    return null;
  }
}

export function isWatchScoringAvailable(): boolean {
  return Platform.OS === "ios" && Boolean(DunaWatchScoring?.isSupported?.());
}

export function getPendingWatchScoreDraft(): WatchScoreDraft | null {
  return parseDraft(DunaWatchScoring?.getPendingScoreDraft?.());
}

export function clearPendingWatchScoreDraft(): void {
  DunaWatchScoring?.clearPendingScoreDraft?.();
}

export function syncMatchToWatch(context: WatchMatchContext): boolean {
  return Boolean(DunaWatchScoring?.syncMatch?.(JSON.stringify(context)));
}

export function subscribeToWatchScoreDraft(
  listener: (draft: WatchScoreDraft) => void,
): () => void {
  if (!DunaWatchScoring) return () => undefined;
  const subscription = DunaWatchScoring.addListener(
    "onScoreDraft",
    ({ json }) => {
      const draft = parseDraft(json);
      if (draft) listener(draft);
    },
  );
  return () => subscription.remove();
}

export type { WatchMatchContext, WatchScoreDraft };
