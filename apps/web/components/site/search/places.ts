import { REQUEST_ID_HEADER } from "@duna/observability";
import { siteRecentPlacesStorageKey } from "../boot";
import type { WhereChoice } from "./search-query";

/** A suggestion from the Places endpoint (`/api/places/autocomplete`). */
export interface PlaceSuggestion {
  readonly placeId: string;
  readonly text: string;
  readonly mainText: string;
  readonly secondaryText: string;
}

/** One of Duna's own venues (clubs and public courts), from `public.venues`. */
export interface DunaVenue {
  readonly id: string;
  readonly name: string;
  readonly city: string;
  readonly region: string;
  readonly courtCount: number;
  readonly latitude: number;
  readonly longitude: number;
}

/** Place search is switched off on this deployment (no key). */
export class PlacesNotConfiguredError extends Error {
  constructor() {
    super("Place search is not configured.");
    this.name = "PlacesNotConfiguredError";
  }
}

/** A request failed; `reference` is the request id support can look up. */
export class SearchRequestError extends Error {
  readonly reference?: string;
  constructor(message: string, reference?: string) {
    super(message);
    this.name = "SearchRequestError";
    this.reference = reference;
  }
}

/** The Places endpoint needs at least three characters. */
export const PLACES_MIN_LENGTH = 3;

export async function fetchPlaceSuggestions(
  query: string,
  signal: AbortSignal,
): Promise<PlaceSuggestion[]> {
  if (query.trim().length < PLACES_MIN_LENGTH) return [];
  const response = await fetch(
    `/api/places/autocomplete?q=${encodeURIComponent(query.trim())}`,
    { signal },
  );
  if (response.status === 503) throw new PlacesNotConfiguredError();
  if (!response.ok) {
    throw new SearchRequestError(
      "Place search didn’t answer.",
      response.headers.get(REQUEST_ID_HEADER) ?? undefined,
    );
  }
  const payload = (await response.json()) as {
    readonly suggestions?: readonly PlaceSuggestion[];
  };
  return [...(payload.suggestions ?? [])].slice(0, 5);
}

/** Turns a chosen suggestion into a point to search around. */
export async function fetchPlaceDetails(
  suggestion: PlaceSuggestion,
): Promise<Extract<WhereChoice, { kind: "place" }>> {
  const response = await fetch(
    `/api/places/details?placeId=${encodeURIComponent(suggestion.placeId)}`,
  );
  if (response.status === 503) throw new PlacesNotConfiguredError();
  const payload = (await response.json().catch(() => ({}))) as {
    readonly name?: string;
    readonly address?: string;
    readonly latitude?: number;
    readonly longitude?: number;
  };
  if (
    !response.ok ||
    typeof payload.latitude !== "number" ||
    typeof payload.longitude !== "number"
  ) {
    throw new SearchRequestError(
      "We couldn’t find that place on the map.",
      response.headers.get(REQUEST_ID_HEADER) ?? undefined,
    );
  }
  return {
    kind: "place",
    label: suggestion.mainText || payload.name || suggestion.text,
    address: payload.address ?? suggestion.text,
    latitude: payload.latitude,
    longitude: payload.longitude,
    source: "places",
  };
}

/**
 * Duna's venues, read once per page from the existing public procedure
 * (`public.venues`, one query, cached by the browser for the visit).
 */
let venueRequest: Promise<DunaVenue[]> | null = null;

export function loadDunaVenues(): Promise<DunaVenue[]> {
  venueRequest ??= fetch("/api/trpc/public.venues")
    .then(async (response) => {
      if (!response.ok) return [];
      const payload = (await response.json()) as {
        readonly result?: { readonly data?: readonly DunaVenue[] };
      };
      return [...(payload.result?.data ?? [])];
    })
    .catch(() => {
      venueRequest = null;
      return [];
    });
  return venueRequest;
}

const MAX_RECENT = 3;

type RecentPlace = Extract<WhereChoice, { kind: "place" }>;

function isRecentPlace(value: unknown): value is RecentPlace {
  if (!value || typeof value !== "object") return false;
  const place = value as Record<string, unknown>;
  return (
    place.kind === "place" &&
    typeof place.label === "string" &&
    typeof place.latitude === "number" &&
    typeof place.longitude === "number"
  );
}

/** Up to three recent places from this browser (never sent anywhere). */
export function readRecentPlaces(): RecentPlace[] {
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(siteRecentPlacesStorageKey) ?? "[]",
    ) as unknown;
    return Array.isArray(stored)
      ? stored.filter(isRecentPlace).slice(0, MAX_RECENT)
      : [];
  } catch {
    return [];
  }
}

export function rememberPlace(place: RecentPlace) {
  try {
    const next = [
      place,
      ...readRecentPlaces().filter((item) => item.label !== place.label),
    ].slice(0, MAX_RECENT);
    window.localStorage.setItem(
      siteRecentPlacesStorageKey,
      JSON.stringify(next),
    );
  } catch {
    // Private windows may refuse storage; the search still works.
  }
}
