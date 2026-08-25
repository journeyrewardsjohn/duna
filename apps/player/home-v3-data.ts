import type { BookingSummary, EventSummary } from "@duna/core";

/**
 * A Home commitment is often both a registration/booking and a discoverable
 * event. Prefer the event so the player gets its participants, policies, live
 * state, and registration action instead of a generic booking receipt.
 */
export function linkedHomeEvent(
  booking: BookingSummary,
  events: readonly EventSummary[],
): EventSummary | undefined {
  const titleKey = (title: string) =>
    title
      .replace(/\s*[—-]\s*week\s+\d+\s*$/i, "")
      .trim()
      .toLocaleLowerCase("en-US");
  return events.find(
    (event) =>
      event.id === booking.sessionId ||
      (titleKey(event.title) === titleKey(booking.title) &&
        Math.abs(
          new Date(event.startsAt).getTime() -
            new Date(booking.startsAt).getTime(),
        ) <
          15 * 60_000),
  );
}
