import type { DiscoveryMapItem } from "./contracts";

export type { DiscoveryEntityType, DiscoveryMapItem } from "./contracts";

export type DiscoveryCoordinates = {
  readonly latitude: number;
  readonly longitude: number;
};

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

export type DiscoveryWhat =
  | "for-you"
  | "events"
  | "tournaments"
  | "leagues"
  | "training"
  | "matches"
  | "court-rentals";

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

export const DISCOVERY_RADIUS_STEPS = [
  10, 30, 60, 120, 240, 480, 960, 1_920, 3_840, 7_680, 12_000,
] as const;

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

export function discoveryDistanceMiles(
  origin: DiscoveryCoordinates,
  item: Pick<DiscoveryMapItem, "latitude" | "longitude">,
) {
  if (item.latitude === undefined || item.longitude === undefined) {
    return Number.POSITIVE_INFINITY;
  }
  const radians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = radians(item.latitude - origin.latitude);
  const longitudeDelta = radians(item.longitude - origin.longitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(origin.latitude)) *
      Math.cos(radians(item.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function matchesDate(item: DiscoveryMapItem, range: DiscoveryDateRange) {
  if (range.preset === "flexible" || !range.startsAt || !range.endsAt) {
    return true;
  }
  if (!item.startsAt && !item.endsAt) return true;
  const rangeStart = Date.parse(range.startsAt);
  const rangeEnd = Date.parse(range.endsAt);
  const itemStart = Date.parse(item.startsAt ?? item.endsAt ?? "");
  const itemEnd = Date.parse(item.endsAt ?? item.startsAt ?? "");
  if ([rangeStart, rangeEnd, itemStart, itemEnd].some(Number.isNaN)) {
    return true;
  }
  return itemStart <= rangeEnd && itemEnd >= rangeStart;
}

function matchesWhat(item: DiscoveryMapItem, what: readonly DiscoveryWhat[]) {
  if (what.length === 0 || what.includes("for-you")) return true;
  const kind = item.kind.toLowerCase();
  return what.some((selection) => {
    if (selection === "events") {
      return item.entityType === "event" && kind !== "tournament";
    }
    if (selection === "tournaments") {
      return item.entityType === "pro-tour" || kind === "tournament";
    }
    if (selection === "leagues") return kind === "league";
    if (selection === "training") {
      return (
        item.entityType === "coach" ||
        ["clinic", "private-lesson", "lesson", "training"].includes(kind)
      );
    }
    if (selection === "matches") {
      return (
        item.entityType === "match" ||
        ["match", "open-play", "pickup", "hosted-match"].includes(kind)
      );
    }
    return item.entityType === "venue" || kind === "court-booking";
  });
}

function startTimestamp(item: DiscoveryMapItem) {
  const timestamp = item.startsAt ? Date.parse(item.startsAt) : Number.NaN;
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
}

function sortedResults(
  items: readonly DiscoveryMapItem[],
  origin?: DiscoveryCoordinates,
) {
  return [...items].sort((left, right) => {
    const liveDifference =
      Number(Boolean(right.live)) - Number(Boolean(left.live));
    if (liveDifference) return liveDifference;
    if (origin) {
      const distanceDifference =
        discoveryDistanceMiles(origin, left) -
        discoveryDistanceMiles(origin, right);
      if (distanceDifference) return distanceDifference;
    }
    const dateDifference = startTimestamp(left) - startTimestamp(right);
    if (dateDifference) return dateDifference;
    return left.title.localeCompare(right.title);
  });
}

export function runDiscoverySearch(
  items: readonly DiscoveryMapItem[],
  criteria: DiscoverySearchCriteria,
  minimumNearbyResults = 5,
): DiscoverySearchResult {
  const matching = items.filter(
    (item) =>
      matchesDate(item, criteria.when) && matchesWhat(item, criteria.what),
  );
  if (criteria.location.mode === "anywhere") {
    return {
      criteria,
      items: sortedResults(matching),
      expandedWorldwide: false,
      totalMatches: matching.length,
    };
  }

  const origin = {
    latitude: criteria.location.latitude,
    longitude: criteria.location.longitude,
  };
  const geocoded = matching.filter(
    (item) => item.latitude !== undefined && item.longitude !== undefined,
  );
  const selectedRadius = DISCOVERY_RADIUS_STEPS.find(
    (radius) =>
      geocoded.filter((item) => discoveryDistanceMiles(origin, item) <= radius)
        .length >= minimumNearbyResults,
  );
  if (selectedRadius !== undefined) {
    const nearby = matching.filter(
      (item) =>
        item.latitude !== undefined &&
        item.longitude !== undefined &&
        discoveryDistanceMiles(origin, item) <= selectedRadius,
    );
    return {
      criteria,
      items: sortedResults(nearby, origin),
      origin,
      radiusMiles: selectedRadius,
      expandedWorldwide: false,
      totalMatches: matching.length,
    };
  }

  return {
    criteria,
    items: sortedResults(matching, origin),
    origin,
    expandedWorldwide: matching.length > 0,
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
