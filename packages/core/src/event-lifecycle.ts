export type EventLifecycleStatus = "active" | "cancelled" | "completed";
export type EventPhase = "upcoming" | "live" | "completed" | "cancelled";

export interface EventLifecycleWindow {
  readonly startsAt: string;
  readonly endsAt: string;
  readonly lifecycleStatus?: EventLifecycleStatus;
}

/**
 * Returns the player-facing phase of an event without requiring a scheduled
 * background job to rewrite historical records. Terminal states always win;
 * otherwise the schedule is the source of truth.
 */
export function eventPhase(
  event: EventLifecycleWindow,
  now: number | Date = Date.now(),
): EventPhase {
  if (event.lifecycleStatus === "cancelled") return "cancelled";
  if (event.lifecycleStatus === "completed") return "completed";

  const nowMs = now instanceof Date ? now.getTime() : now;
  const startsAt = Date.parse(event.startsAt);
  const endsAt = Date.parse(event.endsAt);

  // Invalid legacy dates should never make an event appear live or ended.
  if (
    !Number.isFinite(nowMs) ||
    !Number.isFinite(startsAt) ||
    !Number.isFinite(endsAt)
  ) {
    return "upcoming";
  }
  if (endsAt <= nowMs) return "completed";
  return startsAt <= nowMs ? "live" : "upcoming";
}

export function withEventLifecycle<T extends EventLifecycleWindow>(
  event: T,
  now: number | Date = Date.now(),
): T & {
  readonly lifecycleStatus: EventLifecycleStatus;
  readonly live: boolean;
} {
  const phase = eventPhase(event, now);
  return {
    ...event,
    lifecycleStatus:
      phase === "cancelled"
        ? "cancelled"
        : phase === "completed"
          ? "completed"
          : "active",
    live: phase === "live",
  };
}
