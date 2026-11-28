/**
 * The Watch hand-off for a live match (M-P4a), through the existing bridge
 * (`watch-scoring.ts` over the `duna-watch-scoring` module; the Watch app
 * and its swipe interaction are unchanged).
 *
 * The phone sends the Watch a scoring session (the same context the film
 * studio sends: session id, teams, score, format); the Watch's own swipes
 * come back as events for that session, which the phone applies to its log
 * with the Watch's event ids (so a repeat is ignored) and acknowledges once
 * they are stored. A score scored on the Watch alone still arrives as a
 * score draft and opens "Add a result" (`WatchDraftSheet`).
 */
import { useEffect, useRef } from "react";
import {
  acknowledgeWatchVisionEvents,
  getPendingWatchVisionEvents,
  isWatchScoringAvailable,
  subscribeToWatchVisionEvents,
  syncVisionSessionToWatch,
  type WatchVisionEvent,
} from "../../../watch-scoring";
import type { LiveMatch, LiveView, ScoreEvent } from "./scoring-machine";
import { watchContextFor, watchEventToScoreEvent } from "./watch-mapping";

export function watchAvailable(): boolean {
  try {
    return isWatchScoringAvailable();
  } catch {
    return false;
  }
}

/**
 * Keeps the Watch in step with the match and feeds its events back.
 * `apply` must store the events before it resolves; they are acknowledged
 * to the Watch only then.
 */
export function useWatchBridge(input: {
  readonly match: LiveMatch | null;
  readonly view: LiveView | null;
  readonly matchId?: string;
  readonly updatedAt?: string;
  readonly apply: (events: readonly ScoreEvent[]) => Promise<void>;
}) {
  const { match, view, matchId, updatedAt, apply } = input;
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const sessionId = match?.id;

  useEffect(() => {
    if (!match || !view || !watchAvailable()) return;
    syncVisionSessionToWatch(watchContextFor(match, view, matchId, updatedAt));
  }, [match, matchId, updatedAt, view]);

  useEffect(() => {
    if (!sessionId || !watchAvailable()) return;
    let chain = Promise.resolve();
    const take = (events: readonly WatchVisionEvent[]) => {
      const mine = events.filter((event) => event.sessionId === sessionId);
      if (mine.length === 0) return;
      chain = chain
        .then(async () => {
          const scoreEvents = mine.flatMap((event) => {
            const mapped = watchEventToScoreEvent(event);
            return mapped ? [mapped] : [];
          });
          if (scoreEvents.length > 0) await applyRef.current(scoreEvents);
          acknowledgeWatchVisionEvents(mine.map((event) => event.eventId));
        })
        .catch(() => undefined);
    };
    take(getPendingWatchVisionEvents());
    return subscribeToWatchVisionEvents((event) => take([event]));
  }, [sessionId]);
}
