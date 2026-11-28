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

/** Over the visitor's search budget (HTTP 429): wait a few seconds. */
export class PlacesRateLimitedError extends Error {
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super("Lots of searches just now. Try again in a few seconds.");
    this.name = "PlacesRateLimitedError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function rateLimited(response: Response): PlacesRateLimitedError {
  const retryAfter = Number(response.headers.get("retry-after"));
  return new PlacesRateLimitedError(
    Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 5,
  );
}

/**
 * One provider session per open picker: every keystroke and the place chosen
 * are billed together. Start a new one after a place is chosen.
 */
export function newPlacesSession(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
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
  session?: string,
): Promise<PlaceSuggestion[]> {
  if (query.trim().length < PLACES_MIN_LENGTH) return [];
  const sessionParameter = session
    ? `&session=${encodeURIComponent(session)}`
    : "";
  const response = await fetch(
    `/api/places/autocomplete?q=${encodeURIComponent(query.trim())}${sessionParameter}`,
    { signal },
  );
  if (response.status === 503) throw new PlacesNotConfiguredError();
  if (response.status === 429) throw rateLimited(response);
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
  session?: string,
): Promise<Extract<WhereChoice, { kind: "place" }>> {
  const sessionParameter = session
    ? `&session=${encodeURIComponent(session)}`
    : "";
  const response = await fetch(
    `/api/places/details?placeId=${encodeURIComponent(suggestion.placeId)}${sessionParameter}`,
  );
  if (response.status === 503) throw new PlacesNotConfiguredError();
  if (response.status === 429) throw rateLimited(response);
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
    placeId: suggestion.placeId,
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
