import { Platform } from "react-native";
import DunaWatchScoring from "./modules/duna-watch-scoring";
import type {
  WatchMatchContext,
  WatchScoreDraft,
  WatchScoreSnapshot,
  WatchVisionContext,
  WatchVisionEvent,
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

function parseVisionEvent(
  value: string | null | undefined,
): WatchVisionEvent | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<WatchVisionEvent>;
    if (
      parsed.type !== "duna.visionEvent" ||
      parsed.source !== "apple-watch" ||
      typeof parsed.eventId !== "string" ||
      typeof parsed.sessionId !== "string" ||
      typeof parsed.eventType !== "string" ||
      typeof parsed.elapsedMs !== "number" ||
      typeof parsed.occurredAt !== "string" ||
      !parsed.score
    ) {
      return null;
    }
    return parsed as WatchVisionEvent;
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

export function syncVisionSessionToWatch(context: WatchVisionContext): boolean {
  return Boolean(
    DunaWatchScoring?.syncVisionSession?.(JSON.stringify(context)),
  );
}

export function getPendingWatchVisionEvents(): readonly WatchVisionEvent[] {
  const value = DunaWatchScoring?.getPendingVisionEvents?.();
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((event) => {
      const value = parseVisionEvent(JSON.stringify(event));
      return value ? [value] : [];
    });
  } catch {
    return [];
  }
}

export function acknowledgeWatchVisionEvents(
  eventIds: readonly string[],
): void {
  if (eventIds.length === 0) return;
  DunaWatchScoring?.acknowledgeVisionEvents?.(JSON.stringify(eventIds));
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

export function subscribeToWatchVisionEvents(
  listener: (event: WatchVisionEvent) => void,
): () => void {
  if (!DunaWatchScoring) return () => undefined;
  const subscription = DunaWatchScoring.addListener(
    "onVisionEvent",
    ({ json }) => {
      const event = parseVisionEvent(json);
      if (event) listener(event);
    },
  );
  return () => subscription.remove();
}

export type {
  WatchMatchContext,
  WatchScoreDraft,
  WatchScoreSnapshot,
  WatchVisionContext,
  WatchVisionEvent,
};
