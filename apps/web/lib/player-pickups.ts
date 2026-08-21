import { eventPhase, type EventPhase, type EventSummary } from "@duna/core";

type PlayablePickupPhase = Extract<EventPhase, "live" | "upcoming">;

export interface PlayerPickupSelection {
  readonly pickups: readonly EventSummary[];
  readonly featuredPickup?: EventSummary;
  readonly featuredPickupPhase?: PlayablePickupPhase;
}

function playerPlayableEventPhase(
  event: EventSummary,
  now: Date | number = Date.now(),
): PlayablePickupPhase | undefined {
  const phase = eventPhase(event, now);
  return phase === "live" || phase === "upcoming" ? phase : undefined;
}

export function isPlayerPlayableEvent(
  event: EventSummary,
  now: Date | number = Date.now(),
): boolean {
  return Boolean(playerPlayableEventPhase(event, now));
}

/**
 * Limits Play surfaces to matches a player can still join or play. Historical
 * records remain available from their event page, but must never be promoted
 * as a current match.
 */
export function selectPlayerPickups(
  events: readonly EventSummary[],
  now: Date | number = Date.now(),
): PlayerPickupSelection {
  const pickups = events
    .flatMap((event) => {
      if (event.kind !== "pickup") return [];
      const phase = playerPlayableEventPhase(event, now);
      return phase ? [{ event, phase }] : [];
    })
    .sort(
      (left, right) =>
        Date.parse(left.event.startsAt) - Date.parse(right.event.startsAt),
    );
  const featured =
    pickups.find((pickup) => pickup.phase === "live") ?? pickups[0];

  return {
    pickups: pickups.map((pickup) => pickup.event),
    ...(featured
      ? {
          featuredPickup: featured.event,
          featuredPickupPhase: featured.phase,
        }
      : {}),
  };
}
