/**
 * Find's search (M-P1): Where · When · What, mapped onto the shared
 * discovery search (`@duna/api/discovery-search`) and grouped by What for
 * the list and the map. Pure: no React Native, no network, no clock except
 * the `now` the caller passes. Tested in `find-search.test.ts`.
 *
 * Today the search runs over the public discovery map on the device
 * (`public.discoveryMap`) plus the group sessions of the person's clubs
 * (`find-sessions.ts`). The server search (`public.search.query`) is
 * contracted but not implemented yet; when it lands, `toDiscoveryCriteria`
 * is the one place that changes.
 */
import type { DiscoveryMapItem } from "@duna/api";
import {
  runDiscoverySearch,
  type DiscoveryCoordinates,
  type DiscoverySearchCriteria,
  type DiscoveryWhat,
} from "@duna/api/discovery-search";
import { formatMoney } from "@duna/core";
import type { PinKind } from "@duna/ui/native/map";
import type { GlyphName } from "@duna/ui/native/icons";
import type { FindSession } from "./find-sessions";

/** The What categories: the discovery search's, plus coaches (a slice of training). */
export type FindWhat = DiscoveryWhat | "coaches";

export const FIND_WHAT_OPTIONS: readonly {
  readonly value: FindWhat;
  readonly label: string;
  readonly detail: string;
  readonly icon: GlyphName;
}[] = [
  {
    value: "for-you",
    label: "For you",
    detail: "Play, training and places near you",
    icon: "highlight",
  },
  {
    value: "events",
    label: "Events",
    detail: "Open play and community events",
    icon: "schedule",
  },
  {
    value: "tournaments",
    label: "Tournaments",
    detail: "Local competition and the Pro Tour",
    icon: "tournament",
  },
  {
    value: "leagues",
    label: "Leagues",
    detail: "Recurring local competition",
    icon: "league",
  },
  {
    value: "training",
    label: "Training",
    detail: "Clinics, lessons and group sessions",
    icon: "clinic",
  },
  {
    value: "matches",
    label: "Matches",
    detail: "Games that need players",
    icon: "ball",
  },
  {
    value: "court-rentals",
    label: "Court rentals",
    detail: "Courts and open times",
    icon: "court",
  },
  {
    value: "coaches",
    label: "Coaches",
    detail: "Coaches who teach near you",
    icon: "coach",
  },
];

export type WhenPresetKey =
  | "today"
  | "tomorrow"
  | "this-weekend"
  | "next-7-days"
  | "next-30-days"
  | "any-time"
  | "custom";

export const WHEN_PRESETS: readonly {
  readonly key: Exclude<WhenPresetKey, "custom">;
  readonly label: string;
}[] = [
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "this-weekend", label: "This weekend" },
  { key: "next-7-days", label: "Next 7 days" },
  { key: "next-30-days", label: "Next 30 days" },
  { key: "any-time", label: "Any time" },
];

export interface FindWhere {
  readonly kind: "current" | "place" | "club";
  readonly label: string;
  readonly latitude: number;
  readonly longitude: number;
  /** For a club chosen in Where: its organisation, listed first. */
  readonly organizationId?: string;
}

export interface FindWhen {
  readonly preset: WhenPresetKey;
  /** Local calendar dates (YYYY-MM-DD), inclusive. */
  readonly from?: string;
  readonly to?: string;
}

export interface FindCriteria {
  readonly where: FindWhere | null;
  readonly when: FindWhen;
  readonly what: readonly FindWhat[];
}

export const EMPTY_CRITERIA: FindCriteria = {
  where: null,
  when: { preset: "any-time" },
  what: ["for-you"],
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/** A local calendar date for the device's day. */
export function isoDate(value: Date): string {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

/** The dates a When preset covers, from today. */
export function whenForPreset(
  preset: Exclude<WhenPresetKey, "custom">,
  now: Date,
): FindWhen {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case "any-time":
      return { preset };
    case "today":
      return { preset, from: isoDate(today), to: isoDate(today) };
    case "tomorrow": {
      const tomorrow = addDays(today, 1);
      return { preset, from: isoDate(tomorrow), to: isoDate(tomorrow) };
    }
    case "this-weekend": {
      // Saturday and Sunday; on a Sunday, today only.
      const day = today.getDay();
      const saturday = day === 0 ? today : addDays(today, (6 - day + 7) % 7);
      const sunday = day === 0 ? today : addDays(saturday, 1);
      return { preset, from: isoDate(saturday), to: isoDate(sunday) };
    }
    case "next-7-days":
      return { preset, from: isoDate(today), to: isoDate(addDays(today, 6)) };
    case "next-30-days":
      return { preset, from: isoDate(today), to: isoDate(addDays(today, 29)) };
  }
}

/** A range picked on the day strip; named after a preset when it matches one. */
export function whenForRange(from: string, to: string, now: Date): FindWhen {
  const [start, end] = from <= to ? [from, to] : [to, from];
  for (const preset of WHEN_PRESETS) {
    if (preset.key === "any-time") continue;
    const candidate = whenForPreset(preset.key, now);
    if (candidate.from === start && candidate.to === end) return candidate;
  }
  return { preset: "custom", from: start, to: end };
}

function shortDate(value: string, locale: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(year!, month! - 1, day!));
}

export function whenLabel(when: FindWhen, locale = "en-US"): string | null {
  if (when.preset === "any-time") return null;
  const preset = WHEN_PRESETS.find(
    (candidate) => candidate.key === when.preset,
  );
  if (preset) return preset.label;
  if (!when.from || !when.to) return null;
  if (when.from === when.to) return shortDate(when.from, locale);
  return `${shortDate(when.from, locale)} – ${shortDate(when.to, locale)}`;
}

export function whatLabel(what: readonly FindWhat[]): string | null {
  if (what.length === 0 || what.includes("for-you")) return null;
  const labels = what.map(
    (value) =>
      FIND_WHAT_OPTIONS.find((option) => option.value === value)?.label ??
      value,
  );
  return labels.length <= 2 ? labels.join(", ") : `${labels.length} kinds`;
}

/** The search-to-results parameter mapping onto the shared discovery search. */
export function toDiscoveryCriteria(
  criteria: FindCriteria,
): DiscoverySearchCriteria {
  const what = new Set<DiscoveryWhat>();
  for (const value of criteria.what) {
    what.add(value === "coaches" ? "training" : value);
  }
  const from = criteria.when.from;
  const to = criteria.when.to;
  return {
    location: criteria.where
      ? {
          mode: criteria.where.kind === "current" ? "current" : "place",
          label: criteria.where.label,
          latitude: criteria.where.latitude,
          longitude: criteria.where.longitude,
        }
      : { mode: "anywhere", label: "Anywhere" },
    when:
      from && to
        ? {
            preset: "custom",
            startsAt: localBoundary(from, false),
            endsAt: localBoundary(to, true),
          }
        : { preset: "flexible" },
    what: what.size === 0 ? ["for-you"] : [...what],
  };
}

function localBoundary(date: string, end: boolean): string {
  const [year, month, day] = date.split("-").map(Number);
  const value = end
    ? new Date(year!, month! - 1, day!, 23, 59, 59, 999)
    : new Date(year!, month! - 1, day!, 0, 0, 0, 0);
  return value.toISOString();
}

/** One result in the list and on the map. */
export interface FindResult {
  readonly id: string;
  readonly source: "discovery" | "session";
  readonly group: FindWhat;
  readonly title: string;
  /** When · where · level, in that order, as far as the data has them. */
  readonly meta: string;
  readonly price: string | null;
  readonly level: string | null;
  readonly pin: PinKind;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly live: boolean;
  readonly yours: boolean;
  readonly startsAt?: string;
  readonly item?: DiscoveryMapItem;
  readonly session?: FindSession;
}

export interface FindGroup {
  readonly key: FindWhat;
  readonly label: string;
  readonly results: readonly FindResult[];
}

export interface FindOutcome {
  readonly groups: readonly FindGroup[];
  readonly total: number;
  readonly radiusMiles?: number;
  readonly expandedWorldwide: boolean;
  readonly origin?: DiscoveryCoordinates;
}

/** Which What group an item belongs to (first match wins). */
export function groupForItem(item: DiscoveryMapItem): FindWhat {
  const kind = item.kind.toLowerCase();
  if (item.entityType === "coach") return "coaches";
  if (item.entityType === "pro-tour" || kind === "tournament")
    return "tournaments";
  if (kind === "league") return "leagues";
  if (["clinic", "private-lesson", "lesson", "training"].includes(kind))
    return "training";
  if (
    item.entityType === "match" ||
    ["match", "open-play", "pickup", "hosted-match"].includes(kind)
  )
    return "matches";
  if (
    item.entityType === "venue" ||
    item.entityType === "organization" ||
    kind === "court-booking"
  )
    return "court-rentals";
  return "events";
}

export function pinKindForItem(item: DiscoveryMapItem): PinKind {
  const kind = item.kind.toLowerCase();
  if (item.entityType === "organization") return "club";
  if (item.entityType === "venue") return "court";
  if (item.entityType === "coach") return "lesson";
  if (item.entityType === "pro-tour" || kind === "tournament")
    return "tournament";
  if (kind === "league") return "league";
  if (kind === "pickup" || kind === "open-play") return "pickup";
  if (item.entityType === "match") return "match";
  if (["clinic", "private-lesson", "lesson", "training"].includes(kind))
    return "lesson";
  return "match";
}

export function whenText(
  startsAt: string | undefined,
  timeZone: string | undefined,
  locale = "en-US",
): string | null {
  if (!startsAt) return null;
  const value = new Date(startsAt);
  if (Number.isNaN(value.getTime())) return null;
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(value);
}

function itemPrice(item: DiscoveryMapItem): string | null {
  if (!item.price) return null;
  if (item.price.amountMinor === 0) return "Free";
  return formatMoney(item.price.amountMinor, item.price.currency);
}

export function resultForItem(
  item: DiscoveryMapItem,
  options: {
    readonly origin?: DiscoveryCoordinates;
    readonly yourOrganizationIds?: ReadonlySet<string>;
    readonly distanceMiles?: (item: DiscoveryMapItem) => number;
  } = {},
): FindResult {
  const facts: string[] = [];
  const when = whenText(item.startsAt, undefined);
  if (when) facts.push(when);
  if (item.subtitle.trim()) facts.push(item.subtitle.trim());
  if (item.courtCount) {
    facts.push(`${item.courtCount} court${item.courtCount === 1 ? "" : "s"}`);
  }
  if (item.spotsRemaining !== undefined && item.entityType !== "venue") {
    facts.push(
      item.spotsRemaining === 0
        ? "Full"
        : `${item.spotsRemaining} spot${item.spotsRemaining === 1 ? "" : "s"} left`,
    );
  }
  if (item.level) facts.push(item.level);
  if (options.origin && options.distanceMiles) {
    const miles = options.distanceMiles(item);
    if (Number.isFinite(miles))
      facts.push(`${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`);
  }
  return {
    id: `discovery:${item.entityType}:${item.id}`,
    source: "discovery",
    group: groupForItem(item),
    title: item.title,
    meta: facts.join(" · "),
    price: itemPrice(item),
    level: item.level ?? null,
    pin: pinKindForItem(item),
    ...(item.latitude !== undefined ? { latitude: item.latitude } : {}),
    ...(item.longitude !== undefined ? { longitude: item.longitude } : {}),
    live: Boolean(item.live),
    yours: Boolean(
      item.organizationId &&
      options.yourOrganizationIds?.has(item.organizationId),
    ),
    ...(item.startsAt ? { startsAt: item.startsAt } : {}),
    item,
  };
}

function inWhen(startsAt: string | undefined, when: FindWhen): boolean {
  if (!when.from || !when.to || !startsAt) return true;
  const time = Date.parse(startsAt);
  if (Number.isNaN(time)) return true;
  return (
    time >= Date.parse(localBoundary(when.from, false)) &&
    time <= Date.parse(localBoundary(when.to, true))
  );
}

function wants(criteria: FindCriteria, group: FindWhat): boolean {
  return (
    criteria.what.length === 0 ||
    criteria.what.includes("for-you") ||
    criteria.what.includes(group) ||
    (group === "coaches" && criteria.what.includes("training"))
  );
}

const GROUP_ORDER: readonly FindWhat[] = [
  "matches",
  "training",
  "events",
  "tournaments",
  "leagues",
  "court-rentals",
  "coaches",
];

/**
 * Runs a search: the discovery items through the shared search (radius
 * widening, date and kind filters), the club sessions by When and What,
 * then everything grouped by What in a fixed order. Your clubs and live
 * results first inside a group.
 */
export function runFindSearch(input: {
  readonly items: readonly DiscoveryMapItem[];
  readonly sessions: readonly FindSession[];
  readonly criteria: FindCriteria;
  readonly yourOrganizationIds?: ReadonlySet<string>;
  readonly sessionResult: (session: FindSession) => FindResult;
}): FindOutcome {
  const discovery = runDiscoverySearch(
    input.items,
    toDiscoveryCriteria(input.criteria),
  );
  const distance = (item: DiscoveryMapItem) => {
    if (!discovery.origin) return Number.POSITIVE_INFINITY;
    return haversineMiles(discovery.origin, item);
  };
  const results: FindResult[] = [];
  for (const item of discovery.items) {
    const result = resultForItem(item, {
      origin: discovery.origin,
      yourOrganizationIds: input.yourOrganizationIds,
      distanceMiles: distance,
    });
    if (wants(input.criteria, result.group)) results.push(result);
  }
  for (const session of input.sessions) {
    if (!inWhen(session.startsAt, input.criteria.when)) continue;
    const result = input.sessionResult(session);
    if (wants(input.criteria, result.group)) results.push(result);
  }
  const groups: FindGroup[] = [];
  for (const key of GROUP_ORDER) {
    const members = results
      .filter((result) => result.group === key)
      .sort(
        (left, right) =>
          Number(right.live) - Number(left.live) ||
          Number(right.yours) - Number(left.yours) ||
          (Date.parse(left.startsAt ?? "") || Number.MAX_SAFE_INTEGER) -
            (Date.parse(right.startsAt ?? "") || Number.MAX_SAFE_INTEGER),
      );
    if (members.length === 0) continue;
    groups.push({
      key,
      label:
        FIND_WHAT_OPTIONS.find((option) => option.value === key)?.label ?? key,
      results: members,
    });
  }
  return {
    groups,
    total: results.length,
    ...(discovery.radiusMiles !== undefined
      ? { radiusMiles: discovery.radiusMiles }
      : {}),
    expandedWorldwide: discovery.expandedWorldwide,
    ...(discovery.origin ? { origin: discovery.origin } : {}),
  };
}

export function haversineMiles(
  origin: DiscoveryCoordinates,
  item: { readonly latitude?: number; readonly longitude?: number },
): number {
  if (item.latitude === undefined || item.longitude === undefined)
    return Number.POSITIVE_INFINITY;
  const radians = (value: number) => (value * Math.PI) / 180;
  const dLat = radians(item.latitude - origin.latitude);
  const dLon = radians(item.longitude - origin.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(origin.latitude)) *
      Math.cos(radians(item.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Duna clubs and courts that match what was typed in Where (listed first). */
export function dunaPlacesMatching(
  items: readonly DiscoveryMapItem[],
  query: string,
  yourOrganizationIds: ReadonlySet<string>,
  limit = 5,
): readonly DiscoveryMapItem[] {
  const text = query.trim().toLowerCase();
  const places = items.filter(
    (item) =>
      (item.entityType === "organization" || item.entityType === "venue") &&
      item.latitude !== undefined &&
      item.longitude !== undefined,
  );
  const matching = text
    ? places.filter(
        (item) =>
          item.title.toLowerCase().includes(text) ||
          item.subtitle.toLowerCase().includes(text),
      )
    : places.filter(
        (item) =>
          item.organizationId !== undefined &&
          yourOrganizationIds.has(item.organizationId),
      );
  return [...matching]
    .sort(
      (left, right) =>
        Number(
          right.organizationId !== undefined &&
            yourOrganizationIds.has(right.organizationId),
        ) -
          Number(
            left.organizationId !== undefined &&
              yourOrganizationIds.has(left.organizationId),
          ) || left.title.localeCompare(right.title),
    )
    .slice(0, limit);
}

/** The intent a Home or New-sheet shortcut opens Find with. */
export function criteriaForIntent(
  intent: "find-match" | "book-court" | "join-event" | "watch-pros" | "search",
  current: FindCriteria,
): FindCriteria {
  switch (intent) {
    case "find-match":
      return { ...current, what: ["matches"] };
    case "book-court":
      return { ...current, what: ["court-rentals"] };
    case "join-event":
      return { ...current, what: ["events", "tournaments", "leagues"] };
    case "watch-pros":
      return { ...current, what: ["tournaments"] };
    case "search":
      return current;
  }
}

/** Recent places: newest first, de-duplicated by label, at most five. */
export function pushRecent(
  recents: readonly FindWhere[],
  where: FindWhere,
  limit = 5,
): readonly FindWhere[] {
  if (where.kind === "current") return recents;
  return [
    where,
    ...recents.filter(
      (recent) => recent.label.toLowerCase() !== where.label.toLowerCase(),
    ),
  ].slice(0, limit);
}

export function parseRecents(value: string | null): readonly FindWhere[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is FindWhere =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as FindWhere).label === "string" &&
        typeof (entry as FindWhere).latitude === "number" &&
        typeof (entry as FindWhere).longitude === "number" &&
        ((entry as FindWhere).kind === "place" ||
          (entry as FindWhere).kind === "club"),
    );
  } catch {
    return [];
  }
}
