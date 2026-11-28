"use client";

import { Check, LoaderCircle, MapPin } from "lucide-react";
import { Input } from "@duna/ui";
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
  const [notice, setNotice] = useState<string>();
  const requestNumber = useRef(0);
  // One provider session per search: every keystroke and the chosen place.
  const session = useRef<string>("");
  // A value filled in for the person (an edit, a default) is not a search:
  // suggestions are asked for only after they type.
  const typed = useRef(false);

  useEffect(() => {
    if (!typed.current || selected || value.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    const current = ++requestNumber.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      session.current ||= crypto.randomUUID();
      try {
        const response = await fetch(
          `/api/places/autocomplete?q=${encodeURIComponent(value)}&session=${session.current}`,
        );
        const payload = (await response.json()) as {
          readonly suggestions?: readonly PlaceSuggestion[];
          readonly error?: string;
        };
        if (current === requestNumber.current) {
          setSuggestions(payload.suggestions ?? []);
          // Too many searches: say so quietly; typing again retries.
          setNotice(response.status === 429 ? payload.error : undefined);
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
      `/api/places/details?placeId=${encodeURIComponent(suggestion.placeId)}&session=${session.current}`,
    );
    session.current = "";
    if (response.status === 429) {
      setNotice("Lots of searches just now. Try again in a few seconds.");
      return;
    }
    if (!response.ok) return;
    const details = (await response.json()) as PlaceDetails;
    onValue(details.address ?? suggestion.text);
    onPlace(details);
  };

  return (
    <div className="consumer-place-search">
      <Input
        autoComplete="off"
        endAdornment={
          loading ? (
            <LoaderCircle aria-hidden className="spin" size={16} />
          ) : selected ? (
            <Check aria-hidden size={16} />
          ) : undefined
        }
        groupClassName="consumer-place-search__input"
        id={id}
        onChange={(event) => {
          typed.current = true;
          setSelected(false);
          onValue(event.target.value);
          onPlace({});
        }}
        placeholder="Search a venue or address"
        startAdornment={<MapPin aria-hidden size={18} />}
        value={value}
      />
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
      {notice ? <small role="status">{notice}</small> : null}
    </div>
  );
}
