/**
 * The Watch hand-off's pure parts (M-P4a): a Watch event as a log event and
 * the context the Watch shows. Tested.
 */
import type { WatchVisionEvent } from "../../../modules/duna-watch-scoring/src/DunaWatchScoring.types";
import type { LiveMatch, LiveView, ScoreEvent } from "./scoring-machine";

/** The log event a Watch event becomes, or null (favourites, markers). Pure. */
export function watchEventToScoreEvent(
  event: WatchVisionEvent,
): ScoreEvent | null {
  if (event.eventType === "rally-won" && event.winnerSide) {
    return {
      id: event.eventId.toLowerCase(),
      type: "rally-won",
      winner: event.winnerSide,
      occurredAt: event.occurredAt,
    };
  }
  if (event.eventType === "undo" && event.targetEventId) {
    return {
      id: event.eventId.toLowerCase(),
      type: "undo",
      targetEventId: event.targetEventId.toLowerCase(),
      occurredAt: event.occurredAt,
    };
  }
  return null;
}

/** The context the Watch shows for this match. Pure. */
export function watchContextFor(
  match: LiveMatch,
  view: LiveView,
  matchId: string | undefined,
  updatedAt: string | undefined,
) {
  return {
    sessionId: match.id,
    captureMode: "record" as const,
    ...(matchId ? { matchId } : {}),
    teamA: view.names.home,
    teamB: view.names.away,
    status: match.endedAt ? ("ended" as const) : ("recording" as const),
    recordingStartedAt: match.createdAt,
    score: {
      setIndex: view.score.setIndex,
      sets: view.score.sets.map((set) => ({ a: set.a, b: set.b })),
      serving: view.serving,
      status: view.score.status,
    },
    ...(updatedAt ? { scoreUpdatedAt: updatedAt } : {}),
    format: {
      setsToWin: match.format.setsToWin,
      maximumSets: match.format.maximumSets,
      pointTargets: match.format.pointTargets,
      winBy: match.format.winBy,
      hardCaps: match.format.hardCaps.map((cap) => cap ?? 0),
      sideSwitchIntervals: match.format.sideSwitchIntervals,
    },
  };
}
