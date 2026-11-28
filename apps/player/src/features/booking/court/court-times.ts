/**
 * Court times, pure (M-P3): the start-time chips, the courts open at a start,
 * the open matches at a start, and the conditions for a start as the design
 * system's `ConditionsLine` reads them. Tested in `court-flow.test.ts`.
 */
import type { HourlyConditions } from "@duna/tideline-core";
import type { CourtAvailability } from "../../courts/court-types";

/** "2026-12-01T18:30:00" or "18:30" → minutes after midnight. */
export function localMinute(local: string): number | null {
  const match = local.match(/(?:T|^)(\d{2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** "YYYY-MM-DD" + minutes → "YYYY-MM-DDTHH:mm" (what the checkout takes). */
export function localStart(date: string, minute: number): string {
  const hours = String(Math.floor(minute / 60)).padStart(2, "0");
  const minutes = String(minute % 60).padStart(2, "0");
  return `${date}T${hours}:${minutes}`;
}

type Slot = CourtAvailability["slots"][number];
type OpenMatch = CourtAvailability["openMatches"][number];

/** One chip per start, with how many courts are open and the lowest list price. */
export function courtSlots(
  availability: Pick<CourtAvailability, "slots">,
): readonly {
  readonly startMinute: number;
  readonly available: boolean;
  readonly remaining: number;
  readonly fromMinor?: number;
  readonly currency?: string;
}[] {
  const byStart = new Map<
    number,
    { remaining: number; fromMinor?: number; currency?: string }
  >();
  for (const slot of availability.slots) {
    const minute = localMinute(slot.localStartsAt);
    if (minute === null) continue;
    const current = byStart.get(minute) ?? { remaining: 0 };
    current.remaining += 1;
    if (
      slot.price &&
      (current.fromMinor === undefined ||
        slot.price.amountMinor < current.fromMinor)
    ) {
      current.fromMinor = slot.price.amountMinor;
      current.currency = slot.price.currency;
    }
    byStart.set(minute, current);
  }
  return [...byStart.entries()]
    .sort(([left], [right]) => left - right)
    .map(([startMinute, value]) => ({
      startMinute,
      available: value.remaining > 0,
      ...value,
    }));
}

/** The courts open at a start minute, cheapest first, then by name. */
export function slotsAt(
  availability: Pick<CourtAvailability, "slots"> | undefined,
  minute: number | null,
): readonly Slot[] {
  if (!availability || minute === null) return [];
  return availability.slots
    .filter((slot) => localMinute(slot.localStartsAt) === minute)
    .sort(
      (left, right) =>
        (left.price?.amountMinor ?? 0) - (right.price?.amountMinor ?? 0) ||
        left.courtName.localeCompare(right.courtName, "en", { numeric: true }),
    );
}

export function openMatchesAt(
  availability: Pick<CourtAvailability, "openMatches"> | undefined,
  minute: number | null,
): readonly OpenMatch[] {
  if (!availability || minute === null) return [];
  return availability.openMatches.filter(
    (match) => localMinute(match.localStartsAt) === minute,
  );
}

/**
 * The forecast hour for a start as `HourlyConditions`: the slot's own reading
 * when it has one, else the nearest hourly point. Undefined without data.
 */
export function conditionsAt(
  availability: Pick<CourtAvailability, "forecast" | "slots"> | undefined,
  slot: Pick<Slot, "startsAt" | "weather"> | undefined,
): HourlyConditions | undefined {
  if (!availability || !slot) return undefined;
  const at = Date.parse(slot.startsAt);
  const point =
    slot.weather ??
    [...(availability.forecast?.hourly ?? [])].sort(
      (left, right) =>
        Math.abs(Date.parse(left.startsAt) - at) -
        Math.abs(Date.parse(right.startsAt) - at),
    )[0];
  if (!point || Math.abs(Date.parse(point.startsAt) - at) > 2 * 3_600_000)
    return undefined;
  return {
    at,
    ...(point.temperatureC !== undefined
      ? { temperatureC: point.temperatureC }
      : {}),
    ...(point.windSpeedKph !== undefined
      ? { windSpeedKph: point.windSpeedKph }
      : {}),
    ...(point.windGustKph !== undefined
      ? { windGustKph: point.windGustKph }
      : {}),
    ...(point.precipitationProbability !== undefined
      ? { precipChancePct: point.precipitationProbability }
      : {}),
  };
}
