/**
 * Where's place search (M-P1) over the existing Duna Places endpoints
 * (`/api/places/autocomplete` and `/api/places/details` on the Duna web
 * app, which hold the provider key). Debounced, latest-request-wins, and
 * honest about a missing key: a 503 is "not configured", and Where then
 * still works with Duna clubs and recent places.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { WhereStatus } from "@duna/ui/native/search";
import { dunaWebUrl } from "../../../mobile-api";
import type { FindWhere } from "./find-search";

export const PLACES_DEBOUNCE_MS = 220;

export interface PlaceSuggestion {
  readonly placeId: string;
  readonly mainText: string;
  readonly secondaryText: string;
}

/** The status a response maps to. Pure; tested. */
export function placesStatusFor(input: {
  readonly httpStatus: number;
  readonly count: number;
}): WhereStatus {
  if (input.httpStatus === 503) return "not-configured";
  if (input.httpStatus >= 400) return "error";
  return input.count === 0 ? "empty" : "ready";
}

export function usePlaces(query: string) {
  const [suggestions, setSuggestions] = useState<readonly PlaceSuggestion[]>(
    [],
  );
  const [status, setStatus] = useState<WhereStatus>("idle");
  const request = useRef(0);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 3) {
      setSuggestions([]);
      setStatus("idle");
      return;
    }
    const current = ++request.current;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setStatus("loading");
      void fetch(
        `${dunaWebUrl}/api/places/autocomplete?q=${encodeURIComponent(text)}`,
        { signal: controller.signal },
      )
        .then(async (response) => {
          const payload = (await response.json().catch(() => ({}))) as {
            readonly suggestions?: readonly PlaceSuggestion[];
          };
          if (current !== request.current) return;
          const next = response.ok ? (payload.suggestions ?? []) : [];
          setSuggestions(next.slice(0, 4));
          setStatus(
            placesStatusFor({
              httpStatus: response.status,
              count: next.length,
            }),
          );
        })
        .catch((reason: unknown) => {
          if (current !== request.current) return;
          if (reason instanceof Error && reason.name === "AbortError") return;
          setSuggestions([]);
          setStatus(
            reason instanceof TypeError ||
              (reason instanceof Error && /network/i.test(reason.message))
              ? "offline"
              : "error",
          );
        });
    }, PLACES_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const resolve = useCallback(
    async (suggestion: PlaceSuggestion): Promise<FindWhere | null> => {
      const response = await fetch(
        `${dunaWebUrl}/api/places/details?placeId=${encodeURIComponent(suggestion.placeId)}`,
      );
      const place = (await response.json().catch(() => ({}))) as {
        readonly name?: string;
        readonly latitude?: number;
        readonly longitude?: number;
      };
      if (
        !response.ok ||
        place.latitude === undefined ||
        place.longitude === undefined
      ) {
        setStatus(response.status === 503 ? "not-configured" : "error");
        return null;
      }
      return {
        kind: "place",
        label: place.name ?? suggestion.mainText,
        latitude: place.latitude,
        longitude: place.longitude,
      };
    },
    [],
  );

  return { suggestions, status, resolve };
}
