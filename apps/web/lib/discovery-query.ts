import {
  discoveryPresetRange,
  type DiscoveryCoordinates,
  type DiscoveryDateRange,
  type DiscoveryLocation,
  type DiscoverySearchCriteria,
  type DiscoveryWhat,
  type DiscoveryWhenPreset,
} from "@duna/api/discovery-search";

export type DiscoveryQuery = Record<
  string,
  string | readonly string[] | undefined
>;

const validPresets = new Set<DiscoveryWhenPreset>([
  "flexible",
  "next-7-days",
  "this-month",
  "next-month",
  "next-3-months",
  "custom",
]);

const validWhat = new Set<DiscoveryWhat>([
  "for-you",
  "events",
  "tournaments",
  "leagues",
  "training",
  "matches",
  "court-rentals",
]);

function first(value: string | readonly string[] | undefined) {
  return typeof value === "string" ? value : value?.[0];
}

function finiteCoordinate(
  value: string | undefined,
  minimum: number,
  maximum: number,
) {
  if (!value) return undefined;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) &&
    coordinate >= minimum &&
    coordinate <= maximum
    ? coordinate
    : undefined;
}

function validInstant(value: string | undefined) {
  return value && !Number.isNaN(Date.parse(value)) ? value : undefined;
}

export function defaultDiscoveryCriteria(
  coordinates?: DiscoveryCoordinates,
): DiscoverySearchCriteria {
  return {
    location: coordinates
      ? {
          mode: "current",
          label: "Current location",
          ...coordinates,
        }
      : { mode: "anywhere", label: "Anywhere" },
    when: { preset: "flexible" },
    what: ["for-you"],
  };
}

export function discoveryCriteriaFromQuery(
  query: DiscoveryQuery,
): DiscoverySearchCriteria {
  const mode = first(query.where);
  const latitude = finiteCoordinate(first(query.lat), -90, 90);
  const longitude = finiteCoordinate(first(query.lng), -180, 180);
  let location: DiscoveryLocation = { mode: "anywhere", label: "Anywhere" };
  if (
    (mode === "current" || mode === "place") &&
    latitude !== undefined &&
    longitude !== undefined
  ) {
    location = {
      mode,
      label:
        first(query.location)?.trim().slice(0, 120) ||
        (mode === "current" ? "Current location" : "Selected place"),
      address: first(query.address)?.trim().slice(0, 240) || undefined,
      latitude,
      longitude,
    };
  }

  const presetValue = first(query.when);
  const preset = validPresets.has(presetValue as DiscoveryWhenPreset)
    ? (presetValue as DiscoveryWhenPreset)
    : "flexible";
  const startsAt = validInstant(first(query.start));
  const endsAt = validInstant(first(query.end));
  const validRange =
    startsAt && endsAt && Date.parse(startsAt) <= Date.parse(endsAt)
      ? { startsAt, endsAt }
      : undefined;
  let when: DiscoveryDateRange;
  if (preset === "flexible") when = { preset };
  else if (validRange) when = { preset, ...validRange };
  else if (preset === "custom") when = { preset: "flexible" };
  else when = discoveryPresetRange(preset);

  const what = (first(query.what) ?? "for-you")
    .split(",")
    .filter((value): value is DiscoveryWhat =>
      validWhat.has(value as DiscoveryWhat),
    );
  return {
    location,
    when,
    what: what.length > 0 ? what : ["for-you"],
  };
}

export function discoveryCriteriaToQuery(criteria: DiscoverySearchCriteria) {
  const query = new URLSearchParams();
  query.set("where", criteria.location.mode);
  if (criteria.location.mode !== "anywhere") {
    query.set("location", criteria.location.label);
    query.set("lat", String(criteria.location.latitude));
    query.set("lng", String(criteria.location.longitude));
    if (criteria.location.address) {
      query.set("address", criteria.location.address);
    }
  }
  query.set("when", criteria.when.preset);
  if (criteria.when.startsAt && criteria.when.endsAt) {
    query.set("start", criteria.when.startsAt);
    query.set("end", criteria.when.endsAt);
  }
  query.set("what", criteria.what.join(",") || "for-you");
  return query.toString();
}

export function customDiscoveryRange(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T23:59:59.999`);
  if (
    !start ||
    !end ||
    Number.isNaN(startDate.valueOf()) ||
    Number.isNaN(endDate.valueOf()) ||
    endDate < startDate
  ) {
    return undefined;
  }
  return {
    preset: "custom" as const,
    startsAt: startDate.toISOString(),
    endsAt: endDate.toISOString(),
  };
}
