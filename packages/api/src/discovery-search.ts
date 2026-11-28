/**
 * The device search (Player Find, the site's discover pages): Where, When
 * and What over `public.discoveryMap`. Filtering and ordering live in
 * ./discovery-ranking.ts, which the server search (`public.search.query`)
 * shares, so both give the same answers for the same items.
 */
import type { DiscoveryMapItem } from "./contracts";
import {
  DISCOVERY_RADIUS_STEPS,
  discoveryDistanceMiles,
  discoveryMatchesInstantRange,
  discoveryMatchesWhat,
  rankNearby,
  sortDiscoveryItems,
  type DiscoveryCoordinates,
  type DiscoveryWhat,
} from "./discovery-ranking";

export type { DiscoveryEntityType, DiscoveryMapItem } from "./contracts";
export type { DiscoveryCoordinates, DiscoveryWhat } from "./discovery-ranking";
export { DISCOVERY_RADIUS_STEPS, discoveryDistanceMiles };

export type DiscoveryLocation =
  | { readonly mode: "anywhere"; readonly label: "Anywhere" }
  | {
      readonly mode: "current" | "place";
      readonly label: string;
      readonly address?: string;
      readonly latitude: number;
      readonly longitude: number;
    };

export type DiscoveryWhenPreset =
  | "flexible"
  | "next-7-days"
  | "this-month"
  | "next-month"
  | "next-3-months"
  | "custom";

export type DiscoveryDateRange = {
  readonly preset: DiscoveryWhenPreset;
  readonly startsAt?: string;
  readonly endsAt?: string;
};

export type DiscoverySearchCriteria = {
  readonly location: DiscoveryLocation;
  readonly when: DiscoveryDateRange;
  readonly what: readonly DiscoveryWhat[];
};

export type DiscoverySearchResult = {
  readonly criteria: DiscoverySearchCriteria;
  readonly items: readonly DiscoveryMapItem[];
  readonly origin?: DiscoveryCoordinates;
  readonly radiusMiles?: number;
  readonly expandedWorldwide: boolean;
  readonly totalMatches: number;
};

export const discoveryWhatOptions: readonly {
  readonly value: DiscoveryWhat;
  readonly label: string;
  readonly detail: string;
}[] = [
  {
    value: "for-you",
    label: "For You",
    detail: "A smart mix of play, training, and places",
  },
  {
    value: "events",
    label: "Events",
    detail: "Open play and community events",
  },
  {
    value: "tournaments",
    label: "Tournaments",
    detail: "Local competition and the Pro Tour",
  },
  { value: "leagues", label: "Leagues", detail: "Recurring local competition" },
  {
    value: "training",
    label: "Training",
    detail: "Clinics, lessons, and coaches",
  },
  {
    value: "matches",
    label: "Matches",
    detail: "Live matches and games needing players",
  },
  {
    value: "court-rentals",
    label: "Court Rentals",
    detail: "Courts and open times",
  },
] as const;

function startOfDay(value: Date) {
  const result = new Date(value);
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfDay(value: Date) {
  const result = new Date(value);
  result.setHours(23, 59, 59, 999);
  return result;
}

function addDays(value: Date, days: number) {
  const result = new Date(value);
  result.setDate(result.getDate() + days);
  return result;
}

function addMonths(value: Date, months: number) {
  const result = new Date(value);
  result.setMonth(result.getMonth() + months);
  return result;
}

export function discoveryPresetRange(
  preset: Exclude<DiscoveryWhenPreset, "custom">,
  now = new Date(),
): DiscoveryDateRange {
  if (preset === "flexible") return { preset };
  const today = startOfDay(now);
  if (preset === "next-7-days") {
    return {
      preset,
      startsAt: today.toISOString(),
      endsAt: endOfDay(addDays(today, 6)).toISOString(),
    };
  }
  if (preset === "this-month") {
    return {
      preset,
      startsAt: today.toISOString(),
      endsAt: endOfDay(
        new Date(today.getFullYear(), today.getMonth() + 1, 0),
      ).toISOString(),
    };
  }
  if (preset === "next-month") {
    return {
      preset,
      startsAt: new Date(
        today.getFullYear(),
        today.getMonth() + 1,
        1,
      ).toISOString(),
      endsAt: endOfDay(
        new Date(today.getFullYear(), today.getMonth() + 2, 0),
      ).toISOString(),
    };
  }
  return {
    preset,
    startsAt: today.toISOString(),
    endsAt: endOfDay(addMonths(today, 3)).toISOString(),
  };
}

function matchesDate(item: DiscoveryMapItem, range: DiscoveryDateRange) {
  if (range.preset === "flexible") return true;
  return discoveryMatchesInstantRange(item, range);
}

export function runDiscoverySearch(
  items: readonly DiscoveryMapItem[],
  criteria: DiscoverySearchCriteria,
  minimumNearbyResults = 5,
): DiscoverySearchResult {
  const matching = items.filter(
    (item) =>
      matchesDate(item, criteria.when) &&
      discoveryMatchesWhat(item, criteria.what),
  );
  if (criteria.location.mode === "anywhere") {
    return {
      criteria,
      items: sortDiscoveryItems(matching),
      expandedWorldwide: false,
      totalMatches: matching.length,
    };
  }

  const origin = {
    latitude: criteria.location.latitude,
    longitude: criteria.location.longitude,
  };
  const ranked = rankNearby(matching, origin, { minimumNearbyResults });
  return {
    criteria,
    items: ranked.items,
    origin,
    ...(ranked.radiusMiles !== undefined
      ? { radiusMiles: ranked.radiusMiles }
      : {}),
    expandedWorldwide: ranked.expandedWorldwide,
    totalMatches: matching.length,
  };
}

export function discoveryWhenLabel(range: DiscoveryDateRange) {
  if (range.preset === "flexible") return "I’m flexible";
  const presetLabels: Record<
    Exclude<DiscoveryWhenPreset, "flexible" | "custom">,
    string
  > = {
    "next-7-days": "Next 7 days",
    "this-month": "This month",
    "next-month": "Next month",
    "next-3-months": "Next 3 months",
  };
  if (range.preset !== "custom") return presetLabels[range.preset];
  if (!range.startsAt || !range.endsAt) return "Choose dates";
  const format = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
  });
  return `${format.format(new Date(range.startsAt))} – ${format.format(
    new Date(range.endsAt),
  )}`;
}

export function discoveryWhatLabel(what: readonly DiscoveryWhat[]) {
  if (what.length === 0 || what.includes("for-you")) return "For You";
  const labels = new Map(
    discoveryWhatOptions.map((option) => [option.value, option.label]),
  );
  if (what.length === 1) return labels.get(what[0]!) ?? "For You";
  return `${what.length} play types`;
}

export function discoveryResultSummary(result: DiscoverySearchResult) {
  const count = `${result.items.length} ${result.items.length === 1 ? "result" : "results"}`;
  if (result.radiusMiles !== undefined) {
    return `${count} within ${result.radiusMiles} mi`;
  }
  if (result.expandedWorldwide) return `${count} · expanded worldwide`;
  return count;
}
