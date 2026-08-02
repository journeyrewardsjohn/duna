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
  readonly latitude?: number;
  readonly longitude?: number;
}

export function PlaceSearch({
  id,
  value,
  onValue,
  onPlace,
}: {
  readonly id?: string;
  readonly value: string;
  readonly onValue: (value: string) => void;
  readonly onPlace: (details: PlaceDetails) => void;
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
    }, 260);
    return () => clearTimeout(timer);
  }, [selected, value]);

  const choose = async (suggestion: PlaceSuggestion) => {
    setSelected(true);
    setSuggestions([]);
    onValue(suggestion.text);
    const response = await fetch(
      `/api/places/details?placeId=${encodeURIComponent(suggestion.placeId)}`,
    );
    if (!response.ok) return;
    const details = (await response.json()) as PlaceDetails;
    onValue(details.address ?? suggestion.text);
    onPlace(details);
  };

  return (
    <div className="consumer-place-search">
      <span className="consumer-place-search__input">
        <MapPin aria-hidden size={18} />
        <input
          autoComplete="off"
          id={id}
          onChange={(event) => {
            setSelected(false);
            onValue(event.target.value);
            onPlace({});
          }}
          placeholder="Search a venue or address"
          value={value}
        />
        {loading && <LoaderCircle className="spin" size={16} />}
        {selected && <Check size={16} />}
      </span>
      {suggestions.length > 0 && (
        <span className="consumer-place-search__results">
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
    </div>
  );
}
