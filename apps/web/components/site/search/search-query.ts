/**
 * The home search's state and how it becomes the find-a-game page's address
 * (`/discover`, SITE-4: `components/discover/search-state.ts` owns the
 * address and still reads every older one). Pure (no React, no browser), so
 * it is tested directly.
 */
import {
  DEFAULT_DISCOVER_STATE,
  type DiscoverState,
  discoverHref,
  WHAT_OPTIONS,
} from "../../discover/search-state";

export type WhereChoice =
  | { readonly kind: "anywhere" }
  | {
      readonly kind: "near-me";
      readonly latitude: number;
      readonly longitude: number;
    }
  | {
      /** A Places result or a Duna venue: a point to search around. */
      readonly kind: "place";
      readonly label: string;
      readonly address?: string;
      readonly latitude: number;
      readonly longitude: number;
      /** Where it came from, for the picker's icon. */
      readonly source: "places" | "duna";
      /** The provider's place id (Places results). */
      readonly placeId?: string;
      /** The Duna venue (Duna results). */
      readonly venueId?: string;
    };

export type WhenPreset = "today" | "tonight" | "weekend" | "week" | "any";

export type WhenChoice =
  | { readonly kind: "preset"; readonly preset: WhenPreset }
  /** One day from the day strip, or a range from the calendar (ISO dates). */
  | { readonly kind: "range"; readonly start: string; readonly end: string };

/** The spec's What categories (2.3), in order. */
export const WHAT_CATEGORIES = [
  { id: "open", label: "Open games", discovery: "matches" },
  { id: "clinic", label: "Clinics and training", discovery: "training" },
  { id: "league", label: "Leagues", discovery: "leagues" },
  { id: "tournament", label: "Tournaments", discovery: "tournaments" },
  { id: "court", label: "Court time", discovery: "court-rentals" },
  /** The old discovery page listed coaching under training. */
  { id: "coach", label: "Coaches", discovery: "training" },
] as const;

export type WhatCategory = (typeof WHAT_CATEGORIES)[number]["id"];
export type Surface = "beach" | "indoor" | "any";

export const WHEN_PRESETS: ReadonlyArray<{ id: WhenPreset; label: string }> = [
  { id: "today", label: "Today" },
  { id: "tonight", label: "Tonight" },
  { id: "weekend", label: "This weekend" },
  { id: "week", label: "This week" },
  { id: "any", label: "Any time" },
];

export const SURFACES: ReadonlyArray<{ id: Surface; label: string }> = [
  { id: "beach", label: "Beach" },
  { id: "indoor", label: "Indoor" },
  { id: "any", label: "Any" },
];

export interface SearchState {
  readonly where: WhereChoice;
  readonly when: WhenChoice;
  readonly what: ReadonlyArray<WhatCategory>;
  readonly surface: Surface;
}

export const DEFAULT_SEARCH: SearchState = {
  where: { kind: "anywhere" },
  when: { kind: "preset", preset: "week" },
  what: [],
  surface: "any",
};

/** "Tonight" starts at 4 PM local time (spec 2.3). */
export const TONIGHT_STARTS_AT_HOUR = 16;

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999,
  );
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function fromIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year!, (month ?? 1) - 1, day ?? 1);
}

/** The instants a When choice covers in the visitor's time zone, or none for Any time. */
export function whenRange(
  when: WhenChoice,
  now: Date = new Date(),
): { start: Date; end: Date } | null {
  if (when.kind === "range") {
    const start = startOfDay(fromIsoDate(when.start));
    const end = endOfDay(fromIsoDate(when.end));
    return end < start
      ? { start: startOfDay(end), end: endOfDay(start) }
      : { start, end };
  }
  switch (when.preset) {
    case "any":
      return null;
    case "today":
      return { start: startOfDay(now), end: endOfDay(now) };
    case "tonight": {
      const four = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        TONIGHT_STARTS_AT_HOUR,
      );
      return { start: now > four ? now : four, end: endOfDay(now) };
    }
    case "weekend": {
      // Saturday and Sunday ahead; on a weekend day, from today to Sunday.
      const day = now.getDay();
      const saturday =
        day === 6 || day === 0
          ? startOfDay(now)
          : addDays(startOfDay(now), 6 - day);
      const sunday = day === 0 ? startOfDay(now) : addDays(saturday, 1);
      return { start: saturday, end: endOfDay(sunday) };
    }
    case "week":
      return { start: startOfDay(now), end: endOfDay(addDays(now, 6)) };
  }
}

/** The search as the find-a-game page's state (SITE-4). */
export function toDiscoverState(state: SearchState): DiscoverState {
  const { where, when } = state;
  return {
    ...DEFAULT_DISCOVER_STATE,
    where:
      where.kind === "place"
        ? {
            kind: "place",
            label: where.label,
            ...(where.address ? { address: where.address } : {}),
            latitude: where.latitude,
            longitude: where.longitude,
            ...(where.venueId ? { venueId: where.venueId } : {}),
          }
        : where,
    when:
      when.kind === "preset"
        ? { kind: "preset", preset: when.preset }
        : when.start <= when.end
          ? { kind: "dates", from: when.start, to: when.end }
          : { kind: "dates", from: when.end, to: when.start },
    what: WHAT_OPTIONS.map((option) => option.id).filter((id) =>
      (state.what as readonly string[]).includes(id),
    ),
    surface: state.surface,
  };
}

/**
 * The find-a-game page's address for a search (`/discover?…`, read by
 * `components/discover/search-state.ts`). `now` is kept for callers of the
 * old signature: the address now carries days, not instants, so it no
 * longer depends on the visitor's clock.
 */
export function discoveryHref(
  state: SearchState,
  now: Date = new Date(),
  path = "/discover",
): string {
  void now;
  return discoverHref(toDiscoverState(state), path);
}

/** What the Where row says. */
export function whereText(where: WhereChoice): string {
  if (where.kind === "anywhere") return "Anywhere";
  if (where.kind === "near-me") return "Near me";
  return where.label;
}

const dayFormat = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

/** What the When row says. */
export function whenText(when: WhenChoice): string {
  if (when.kind === "preset") {
    return WHEN_PRESETS.find((preset) => preset.id === when.preset)!.label;
  }
  const start = dayFormat.format(fromIsoDate(when.start));
  if (when.start === when.end) return start;
  return `${start} to ${dayFormat.format(fromIsoDate(when.end))}`;
}

/** What the What row says. */
export function whatText(state: Pick<SearchState, "what" | "surface">): string {
  const names = state.what.map(
    (id) => WHAT_CATEGORIES.find((category) => category.id === id)!.label,
  );
  const kinds =
    names.length === 0
      ? "Anything"
      : names.length === 1
        ? names[0]!
        : `${names[0]} +${names.length - 1}`;
  const surface = SURFACES.find((item) => item.id === state.surface)!;
  return state.surface === "any" ? kinds : `${kinds} · ${surface.label}`;
}
