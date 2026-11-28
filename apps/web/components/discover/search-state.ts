/**
 * Find a game: the search's state and its address (SITE-4). Pure: no React,
 * no browser, no clock (callers pass `now`), so the round trip and every
 * legacy address are tested directly (`search-state.test.ts`).
 *
 * The address is the state: a search is shareable, the back button walks
 * through searches, and the server renders the first results from it.
 *
 *   where     anywhere (default) | current | place | free text
 *   location  the place's name; address; lat, lng; venue (a Duna venue id)
 *   r         radius in miles (one of RADIUS_STEPS_MILES); empty = automatic
 *   when      today | tomorrow | tonight | weekend | week | any (default) | dates
 *   from, to  YYYY-MM-DD (when=dates; one day when equal)
 *   time      morning | afternoon | evening
 *   what      comma list of WhatId
 *   surface   beach | indoor
 *   view      map (phones: the map with the list in a sheet)
 *
 * Old addresses keep working: `/discover/results?…` and `/discover/map?…`
 * from the old pages, emails and the apps use `when=flexible|next-7-days|
 * this-month|next-month|next-3-months|custom` with ISO `start` / `end`,
 * `what=for-you|events|tournaments|leagues|training|matches|court-rentals`
 * and `focus=…`; the home page's search sends the same. All of them parse.
 */

export const DISCOVER_PATH = "/discover";
export const APP_DISCOVER_PATH = "/app/discover";

export type DiscoverWhere =
  | { readonly kind: "anywhere" }
  | {
      readonly kind: "near-me";
      readonly latitude: number;
      readonly longitude: number;
    }
  | {
      readonly kind: "place";
      readonly label: string;
      readonly address?: string;
      readonly latitude: number;
      readonly longitude: number;
      /** A Duna venue chosen in the Where picker. */
      readonly venueId?: string;
    }
  /** Free text (the site's search action, `/discover?where=Hermosa`). */
  | { readonly kind: "text"; readonly text: string };

export type WhenPresetId =
  "today" | "tomorrow" | "tonight" | "weekend" | "week" | "any";

export type DiscoverWhen =
  | { readonly kind: "preset"; readonly preset: WhenPresetId }
  /** Local calendar dates (YYYY-MM-DD) at the game; one day when equal. */
  | { readonly kind: "dates"; readonly from: string; readonly to: string };

export type Daypart = "morning" | "afternoon" | "evening";
export type WhatId =
  "open" | "clinic" | "league" | "tournament" | "event" | "court" | "coach";
export type SurfaceId = "beach" | "indoor" | "any";
export type DiscoverView = "list" | "map";

export interface DiscoverState {
  readonly where: DiscoverWhere;
  readonly when: DiscoverWhen;
  readonly time: Daypart | null;
  readonly what: readonly WhatId[];
  readonly surface: SurfaceId;
  readonly view: DiscoverView;
  /** Miles; null lets the search pick the smallest area with enough results. */
  readonly radius: number | null;
}

export const DEFAULT_DISCOVER_STATE: DiscoverState = {
  where: { kind: "anywhere" },
  when: { kind: "preset", preset: "any" },
  time: null,
  what: [],
  surface: "any",
  view: "list",
  radius: null,
};

/** Areas the search widens through, in miles. */
export const RADIUS_STEPS_MILES = [1, 5, 10, 25, 50, 100] as const;

/** "Tonight" starts at 4 PM at the game (website.md 2.3). */
export const TONIGHT_FROM_MINUTE = 16 * 60;
/** Morning ends at noon; the evening starts at 5 PM. */
export const AFTERNOON_FROM_MINUTE = 12 * 60;
export const EVENING_FROM_MINUTE = 17 * 60;

export const WHEN_PRESETS: ReadonlyArray<{
  readonly id: WhenPresetId;
  readonly label: string;
}> = [
  { id: "today", label: "Today" },
  { id: "tomorrow", label: "Tomorrow" },
  { id: "tonight", label: "Tonight" },
  { id: "weekend", label: "This weekend" },
  { id: "week", label: "This week" },
  { id: "any", label: "Any time" },
];

export const DAYPARTS: ReadonlyArray<{
  readonly id: Daypart;
  readonly label: string;
  readonly detail: string;
}> = [
  { id: "morning", label: "Morning", detail: "Before noon" },
  { id: "afternoon", label: "Afternoon", detail: "Noon to 5 PM" },
  { id: "evening", label: "Evening", detail: "From 5 PM" },
];

/** What the data really has, in the order players ask for it. */
export const WHAT_OPTIONS: ReadonlyArray<{
  readonly id: WhatId;
  readonly label: string;
  /** The old page's value for the same thing. */
  readonly legacy?: string;
}> = [
  { id: "open", label: "Open games", legacy: "matches" },
  { id: "clinic", label: "Clinics and lessons", legacy: "training" },
  { id: "league", label: "Leagues", legacy: "leagues" },
  { id: "tournament", label: "Tournaments", legacy: "tournaments" },
  { id: "event", label: "Events", legacy: "events" },
  { id: "court", label: "Court time", legacy: "court-rentals" },
  { id: "coach", label: "Coaches" },
];

export const SURFACE_OPTIONS: ReadonlyArray<{
  readonly id: SurfaceId;
  readonly label: string;
}> = [
  { id: "beach", label: "Beach" },
  { id: "indoor", label: "Indoor" },
  { id: "any", label: "Any" },
];

const WHAT_IDS = new Set<string>(WHAT_OPTIONS.map((option) => option.id));
const LEGACY_WHAT: Record<string, WhatId | null> = {
  "for-you": null,
  matches: "open",
  training: "clinic",
  leagues: "league",
  tournaments: "tournament",
  events: "event",
  "court-rentals": "court",
  // The old page's quick links (`focus=`).
  courts: "court",
  clubs: null,
};
const PRESETS = new Set<string>(WHEN_PRESETS.map((preset) => preset.id));
const DAYPART_IDS = new Set<string>(DAYPARTS.map((part) => part.id));

export type DiscoverQuery = Readonly<
  Record<string, string | readonly string[] | undefined>
>;

function first(value: string | readonly string[] | undefined) {
  return typeof value === "string" ? value : value?.[0];
}

function coordinate(value: string | undefined, limit: number) {
  if (value === undefined || value.trim() === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= limit
    ? number
    : undefined;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validIsoDate(value: string | undefined): string | undefined {
  if (!value || !ISO_DATE.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day
    ? value
    : undefined;
}

function isoDateUtc(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

function addIsoDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  return isoDateUtc(Date.UTC(year!, month! - 1, day! + days));
}

function clean(value: string | undefined, max: number) {
  const text = value?.replace(/\s+/g, " ").trim().slice(0, max);
  return text || undefined;
}

function parseWhere(query: DiscoverQuery): DiscoverWhere {
  const mode = clean(first(query.where), 120);
  const latitude = coordinate(first(query.lat), 90);
  const longitude = coordinate(first(query.lng), 180);
  const venueId = clean(first(query.venue), 64);
  const label = clean(first(query.location), 120);
  const address = clean(first(query.address), 240);
  const hasPoint = latitude !== undefined && longitude !== undefined;
  if (!mode || mode === "anywhere") return { kind: "anywhere" };
  if (mode === "current") {
    return hasPoint
      ? { kind: "near-me", latitude, longitude }
      : { kind: "anywhere" };
  }
  if (mode === "place") {
    if (!hasPoint) {
      return label ? { kind: "text", text: label } : { kind: "anywhere" };
    }
    return {
      kind: "place",
      label: label ?? "Selected place",
      ...(address ? { address } : {}),
      latitude,
      longitude,
      ...(venueId && /^[\w-]+$/.test(venueId) ? { venueId } : {}),
    };
  }
  // Anything else is what someone typed (the home page's search action).
  return { kind: "text", text: mode };
}

/**
 * An old ISO instant pair (computed in the visitor's own time zone) back to
 * local dates. The start is local midnight and the end local 23:59:59.999,
 * so half a day either way lands on the right date in any zone from UTC−12
 * to UTC+12.
 */
function legacyDates(start: string, end: string) {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) {
    return undefined;
  }
  const halfDay = 12 * 60 * 60_000;
  return {
    from: isoDateUtc(startMs + halfDay),
    to: isoDateUtc(Math.max(startMs + halfDay, endMs - halfDay)),
  };
}

function monthEnd(date: string, monthsAhead: number) {
  const [year, month] = date.split("-").map(Number);
  return isoDateUtc(Date.UTC(year!, month! + monthsAhead, 0));
}

function parseWhen(query: DiscoverQuery, now: Date): DiscoverWhen {
  const value = first(query.when);
  if (value && PRESETS.has(value)) {
    return { kind: "preset", preset: value as WhenPresetId };
  }
  const today = isoDateUtc(now.getTime());
  if (value === "dates" || value === "date") {
    const from = validIsoDate(first(query.from) ?? first(query.date));
    const to = validIsoDate(first(query.to)) ?? from;
    if (from && to) {
      return from <= to
        ? { kind: "dates", from, to }
        : { kind: "dates", from: to, to: from };
    }
    return { kind: "preset", preset: "any" };
  }
  // The old page's presets.
  switch (value) {
    case "next-7-days":
      return { kind: "preset", preset: "week" };
    case "this-month":
      return { kind: "dates", from: today, to: monthEnd(today, 0) };
    case "next-month": {
      const [year, month] = today.split("-").map(Number);
      return {
        kind: "dates",
        from: isoDateUtc(Date.UTC(year!, month!, 1)),
        to: monthEnd(today, 1),
      };
    }
    case "next-3-months": {
      const [year, month, day] = today.split("-").map(Number);
      return {
        kind: "dates",
        from: today,
        to: isoDateUtc(Date.UTC(year!, month! + 2, day!)),
      };
    }
    case "custom": {
      const dates = legacyDates(
        first(query.start) ?? "",
        first(query.end) ?? "",
      );
      return dates
        ? { kind: "dates", ...dates }
        : { kind: "preset", preset: "any" };
    }
    default:
      return { kind: "preset", preset: "any" };
  }
}

function parseWhat(query: DiscoverQuery): WhatId[] {
  const raw = first(query.what);
  const ids = new Set<WhatId>();
  for (const part of (raw ?? "").split(",")) {
    const value = part.trim();
    if (WHAT_IDS.has(value)) ids.add(value as WhatId);
    else if (value in LEGACY_WHAT) {
      const mapped = LEGACY_WHAT[value];
      if (mapped) ids.add(mapped);
    }
  }
  // The old quick links narrowed with `focus` when nothing else was chosen.
  const focus = first(query.focus);
  if (ids.size === 0 && focus && focus in LEGACY_WHAT) {
    const mapped = LEGACY_WHAT[focus];
    if (mapped) ids.add(mapped);
  }
  return WHAT_OPTIONS.map((option) => option.id).filter((id) => ids.has(id));
}

/** The state an address describes. Unknown or broken values fall back to the defaults. */
export function parseDiscoverQuery(
  query: DiscoverQuery,
  now: Date = new Date(),
): DiscoverState {
  const time = first(query.time);
  const surface = first(query.surface);
  const radius = Number(first(query.r));
  return {
    where: parseWhere(query),
    when: parseWhen(query, now),
    time: time && DAYPART_IDS.has(time) ? (time as Daypart) : null,
    what: parseWhat(query),
    surface: surface === "beach" || surface === "indoor" ? surface : "any",
    view: first(query.view) === "map" ? "map" : "list",
    radius: (RADIUS_STEPS_MILES as readonly number[]).includes(radius)
      ? radius
      : null,
  };
}

/** The canonical query string for a state: fixed order, defaults left out. */
export function discoverQueryString(state: DiscoverState): string {
  const query = new URLSearchParams();
  const { where } = state;
  if (where.kind === "near-me") {
    query.set("where", "current");
    query.set("lat", where.latitude.toFixed(5));
    query.set("lng", where.longitude.toFixed(5));
  } else if (where.kind === "place") {
    query.set("where", "place");
    query.set("location", where.label);
    if (where.address) query.set("address", where.address);
    query.set("lat", where.latitude.toFixed(5));
    query.set("lng", where.longitude.toFixed(5));
    if (where.venueId) query.set("venue", where.venueId);
  } else if (where.kind === "text") {
    query.set("where", where.text);
  }
  if (state.radius !== null && where.kind !== "anywhere") {
    query.set("r", String(state.radius));
  }
  if (state.when.kind === "dates") {
    query.set("when", "dates");
    query.set("from", state.when.from);
    if (state.when.to !== state.when.from) query.set("to", state.when.to);
  } else if (state.when.preset !== "any") {
    query.set("when", state.when.preset);
  }
  if (state.time) query.set("time", state.time);
  if (state.what.length > 0) query.set("what", state.what.join(","));
  if (state.surface !== "any") query.set("surface", state.surface);
  if (state.view === "map") query.set("view", "map");
  return query.toString();
}

export function discoverHref(
  state: DiscoverState,
  path: string = DISCOVER_PATH,
): string {
  const query = discoverQueryString(state);
  return query ? `${path}?${query}` : path;
}

/** Is this the bare page (the indexable landing state)? */
export function isDefaultSearch(state: DiscoverState): boolean {
  return discoverQueryString({ ...state, view: "list" }) === "";
}

// ---------- Words ----------

const shortDate = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function formatIsoDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return shortDate.format(new Date(Date.UTC(year!, month! - 1, day!)));
}

export function whereLabel(where: DiscoverWhere): string {
  switch (where.kind) {
    case "anywhere":
      return "Anywhere";
    case "near-me":
      return "Near you";
    case "place":
      return where.label;
    case "text":
      return where.text;
  }
}

export function whenLabel(when: DiscoverWhen, time: Daypart | null = null) {
  const day =
    when.kind === "preset"
      ? WHEN_PRESETS.find((preset) => preset.id === when.preset)!.label
      : when.from === when.to
        ? formatIsoDate(when.from)
        : `${formatIsoDate(when.from)} to ${formatIsoDate(when.to)}`;
  if (!time) return day;
  const part = DAYPARTS.find((item) => item.id === time)!.label.toLowerCase();
  return when.kind === "preset" && when.preset === "any"
    ? `Any ${part}`
    : `${day}, ${part}`;
}

export function whatLabel(
  state: Pick<DiscoverState, "what" | "surface">,
): string {
  const names = state.what.map(
    (id) => WHAT_OPTIONS.find((option) => option.id === id)!.label,
  );
  const kinds =
    names.length === 0
      ? "Anything"
      : names.length === 1
        ? names[0]!
        : `${names[0]} +${names.length - 1}`;
  if (state.surface === "any") return kinds;
  const surface = SURFACE_OPTIONS.find((item) => item.id === state.surface)!;
  return `${kinds} · ${surface.label}`;
}

/** The page's one title: "Games near Hermosa Beach". */
export function discoverTitle(state: DiscoverState): string {
  switch (state.where.kind) {
    case "anywhere":
      return "Find a game";
    case "near-me":
      return "Games near you";
    case "place":
      return `Games near ${state.where.label}`;
    case "text":
      return `Games near ${state.where.text}`;
  }
}

/** The next wider area, for "widen the area" (null at the widest). */
export function widerRadius(current: number): number | null {
  return RADIUS_STEPS_MILES.find((step) => step > current) ?? null;
}

/** The dates a preset covers at the game, given today there. */
export function presetDates(
  preset: WhenPresetId,
  today: string,
  weekday: number,
): { from: string; to: string } | null {
  switch (preset) {
    case "any":
      return null;
    case "today":
    case "tonight":
      return { from: today, to: today };
    case "tomorrow": {
      const tomorrow = addIsoDays(today, 1);
      return { from: tomorrow, to: tomorrow };
    }
    case "weekend": {
      // Saturday and Sunday ahead; on a weekend day, from today to Sunday.
      if (weekday === 0) return { from: today, to: today };
      if (weekday === 6) return { from: today, to: addIsoDays(today, 1) };
      const saturday = addIsoDays(today, 6 - weekday);
      return { from: saturday, to: addIsoDays(saturday, 1) };
    }
    case "week":
      return { from: today, to: addIsoDays(today, 6) };
  }
}

export { addIsoDays };
