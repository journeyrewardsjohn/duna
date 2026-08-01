"use client";

import { Check, LoaderCircle, MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface PlaceSuggestion {
  readonly placeId: string;
  readonly text: string;
  readonly mainText: string;
  readonly secondaryText: string;
}

export function PlaceSearch({
  value,
  onAddress,
  onVenueName,
}: {
  readonly value: string;
  readonly onAddress: (value: string) => void;
  readonly onVenueName: (value: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<readonly PlaceSuggestion[]>(
    [],
  );
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(false);
  const requestNumber = useRef(0);

  useEffect(() => {
    if (selected || value.trim().length < 3) {
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
          readonly suggestions?: readonly PlaceSuggestion[];
        };
        if (current === requestNumber.current) {
          setSuggestions(payload.suggestions ?? []);
        }
      } finally {
        if (current === requestNumber.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [selected, value]);

  const choose = async (suggestion: PlaceSuggestion) => {
    setSelected(true);
    setSuggestions([]);
    onAddress(suggestion.text);
    onVenueName(suggestion.mainText);
    const response = await fetch(
      `/api/places/details?placeId=${encodeURIComponent(suggestion.placeId)}`,
    );
    if (!response.ok) return;
    const details = (await response.json()) as {
      readonly name?: string;
      readonly address?: string;
    };
    if (details.address) onAddress(details.address);
    if (details.name) onVenueName(details.name);
  };

  return (
    <label className="event-field--full place-search">
      <span>Address</span>
      <span className="place-search__input">
        <MapPin aria-hidden size={16} />
        <input
          autoComplete="off"
          onChange={(event) => {
            setSelected(false);
            onAddress(event.target.value);
          }}
          placeholder="Search venue or address"
          value={value}
        />
        {loading && <LoaderCircle className="spin" size={16} />}
        {selected && <Check size={16} />}
      </span>
      {suggestions.length > 0 && (
        <span className="place-search__results">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.placeId}
              onMouseDown={(event) => {
                event.preventDefault();
                void choose(suggestion);
              }}
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
      <small>You can still type a custom address.</small>
    </label>
  );
}
