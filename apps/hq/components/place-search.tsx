"use client";

import { Check, LoaderCircle, MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface PlaceSuggestion {
  readonly placeId: string;
  readonly text: string;
  readonly mainText: string;
  readonly secondaryText: string;
}

export interface PlaceDetails {
  readonly placeId?: string;
  readonly name?: string;
  readonly address?: string;
  readonly addressLine1?: string;
  readonly locality?: string;
  readonly administrativeArea?: string;
  readonly postalCode?: string;
  readonly countryCode?: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly googleMapsUri?: string;
  readonly timeZone?: string;
}

export function PlaceSearch({
  value,
  onAddress,
  onVenueName,
  onPlace,
  label = "Address",
  helper,
  placeholder = "Search venue or address",
  required = false,
  validationMessage,
  onResolveError,
  suggestionsEnabled = true,
}: {
  readonly value: string;
  readonly onAddress: (value: string) => void;
  readonly onVenueName: (value: string) => void;
  readonly onPlace?: (details: PlaceDetails) => boolean | void;
  readonly label?: string;
  readonly helper?: string;
  readonly placeholder?: string;
  readonly required?: boolean;
  readonly validationMessage?: string;
  readonly onResolveError?: (message: string) => void;
  readonly suggestionsEnabled?: boolean;
}) {
  const [suggestions, setSuggestions] = useState<readonly PlaceSuggestion[]>(
    [],
  );
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [selected, setSelected] = useState(false);
  const [error, setError] = useState("");
  const requestNumber = useRef(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.setCustomValidity(validationMessage ?? "");
  }, [validationMessage]);

  useEffect(() => {
    if (!suggestionsEnabled || selected || value.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    const current = ++requestNumber.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/places/autocomplete?q=${encodeURIComponent(value)}`,
        );
        const payload = (await response.json()) as {
          readonly error?: string;
          readonly suggestions?: readonly PlaceSuggestion[];
        };
        if (current === requestNumber.current) {
          if (!response.ok) {
            setSuggestions([]);
            setError(
              payload.error ??
                "Google address search is temporarily unavailable.",
            );
            return;
          }
          setError("");
          setSuggestions(payload.suggestions ?? []);
        }
      } catch {
        if (current === requestNumber.current) {
          setSuggestions([]);
          setError("Google address search is temporarily unavailable.");
        }
      } finally {
        if (current === requestNumber.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [selected, suggestionsEnabled, value]);

  const choose = async (suggestion: PlaceSuggestion) => {
    setSelected(false);
    setSuggestions([]);
    setError("");
    setResolving(true);
    onAddress(suggestion.text);
    onVenueName(suggestion.mainText);
    try {
      const response = await fetch(
        `/api/places/details?placeId=${encodeURIComponent(suggestion.placeId)}`,
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          readonly error?: string;
        };
        throw new Error(
          payload.error ?? "Google could not resolve that address.",
        );
      }
      const details = (await response.json()) as PlaceDetails;
      if (!details.addressLine1 && !details.address) {
        throw new Error("Google returned an incomplete address.");
      }
      if (details.address) onAddress(details.address);
      if (details.name) onVenueName(details.name);
      const accepted = onPlace?.(details);
      setSelected(accepted !== false);
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "Google could not resolve that address.";
      setError(message);
      onResolveError?.(message);
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="event-field--full place-search">
      <label>
        <span>{label}</span>
        <span className="place-search__input">
          <MapPin aria-hidden size={16} />
          <input
            aria-describedby={error ? "place-search-error" : undefined}
            aria-invalid={Boolean(error) || Boolean(validationMessage)}
            autoComplete="off"
            onChange={(event) => {
              setSelected(false);
              setError("");
              onAddress(event.target.value);
            }}
            placeholder={placeholder}
            ref={input}
            required={required}
            value={value}
          />
          {(loading || resolving) && (
            <LoaderCircle aria-hidden className="spin" size={16} />
          )}
          {selected && <Check aria-hidden size={16} />}
        </span>
      </label>
      {suggestions.length > 0 && (
        <span className="place-search__results">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.placeId}
              onClick={() => void choose(suggestion)}
              type="button"
            >
              <MapPin aria-hidden size={16} />
              <span>
                <strong>{suggestion.mainText}</strong>
                <small>{suggestion.secondaryText}</small>
              </span>
            </button>
          ))}
          <small>Powered by Google</small>
        </span>
      )}
      {resolving && (
        <small className="place-search__status" role="status">
          Confirming the full address…
        </small>
      )}
      {error && (
        <small
          className="place-search__error"
          id="place-search-error"
          role="alert"
        >
          {error}
        </small>
      )}
      {helper && <small>{helper}</small>}
    </div>
  );
}
