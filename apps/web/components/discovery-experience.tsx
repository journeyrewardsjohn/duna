"use client";

import {
  discoveryPresetRange,
  discoveryResultSummary,
  discoveryWhatLabel,
  discoveryWhatOptions,
  discoveryWhenLabel,
  runDiscoverySearch,
  type DiscoveryCoordinates,
  type DiscoveryLocation,
  type DiscoveryMapItem,
  type DiscoverySearchCriteria,
  type DiscoveryWhat,
  type DiscoveryWhenPreset,
} from "@duna/api/discovery-search";
import {
  ArrowRight,
  CalendarDays,
  Check,
  LocateFixed,
  Map,
  MapPin,
  Search,
  Sparkles,
  Trophy,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  customDiscoveryRange,
  defaultDiscoveryCriteria,
  discoveryCriteriaToQuery,
} from "@/lib/discovery-query";
import { DiscoveryCard } from "./discovery-card";
import { DiscoveryMap } from "./discovery-map";

type SearchStep = "where" | "when" | "what";

type PlaceSuggestion = {
  readonly placeId: string;
  readonly text: string;
  readonly mainText: string;
  readonly secondaryText: string;
};

type PlaceDetails = {
  readonly name?: string;
  readonly address?: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly error?: string;
};

const whenOptions: readonly {
  readonly value: Exclude<DiscoveryWhenPreset, "custom">;
  readonly label: string;
  readonly detail: string;
}[] = [
  {
    value: "flexible",
    label: "I’m Flexible",
    detail: "Show the best available play",
  },
  { value: "next-7-days", label: "Next 7 Days", detail: "Starting today" },
  {
    value: "this-month",
    label: "This Month",
    detail: "Through the end of this month",
  },
  {
    value: "next-month",
    label: "Next Month",
    detail: "Plan a little further ahead",
  },
  {
    value: "next-3-months",
    label: "Next 3 Months",
    detail: "The season ahead",
  },
];

function dateInputValue(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function Rail({
  eyebrow,
  title,
  items,
  href,
  empty,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly items: readonly DiscoveryMapItem[];
  readonly href: string;
  readonly empty: string;
}) {
  return (
    <section className="discover-v2-rail-section">
      <header className="discover-v2-section-heading">
        <div>
          <span>{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        <Link href={href}>
          View all <ArrowRight aria-hidden size={16} />
        </Link>
      </header>
      {items.length > 0 ? (
        <div className="discover-v2-rail">
          {items.map((item) => (
            <DiscoveryCard item={item} key={item.id} />
          ))}
        </div>
      ) : (
        <div className="discover-v2-empty">{empty}</div>
      )}
    </section>
  );
}

function SearchSelector({
  detail,
  icon,
  label,
  onClick,
  value,
}: {
  readonly detail: string;
  readonly icon: ReactNode;
  readonly label: string;
  readonly onClick: () => void;
  readonly value: string;
}) {
  return (
    <button
      aria-label={`${label}: ${value}`}
      className="discover-search-selector"
      onClick={onClick}
      type="button"
    >
      <span className="discover-search-selector__icon">{icon}</span>
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
        <em>{detail}</em>
      </span>
      <span aria-hidden className="discover-search-selector__arrow">
        ›
      </span>
    </button>
  );
}

function WhereStep({
  currentLocation,
  items,
  locationState,
  onCurrentLocation,
  onSelect,
}: {
  readonly currentLocation?: DiscoveryCoordinates;
  readonly items: readonly DiscoveryMapItem[];
  readonly locationState: "idle" | "locating" | "ready" | "unavailable";
  readonly onCurrentLocation: () => void;
  readonly onSelect: (location: DiscoveryLocation) => void;
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<readonly PlaceSuggestion[]>(
    [],
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const requestId = useRef(0);
  const recommended = useMemo(() => {
    const seen = new Set<string>();
    return items
      .filter(
        (item) =>
          item.latitude !== undefined &&
          item.longitude !== undefined &&
          item.subtitle.trim(),
      )
      .filter((item) => {
        const key = item.subtitle.trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 5);
  }, [items]);

  useEffect(() => {
    if (query.trim().length < 3) {
      setSuggestions([]);
      setError(undefined);
      return;
    }
    const activeRequest = ++requestId.current;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(undefined);
      void fetch(
        `/api/places/autocomplete?q=${encodeURIComponent(query.trim())}`,
        { signal: controller.signal },
      )
        .then(async (response) => {
          const payload = (await response.json()) as {
            readonly suggestions?: readonly PlaceSuggestion[];
            readonly error?: string;
          };
          if (!response.ok) {
            throw new Error(payload.error ?? "Location search is unavailable.");
          }
          return payload.suggestions ?? [];
        })
        .then((next) => {
          if (activeRequest !== requestId.current) return;
          setSuggestions(next);
          if (next.length === 0) {
            setError("No matching places yet. Try a city, beach, or address.");
          }
        })
        .catch((reason: unknown) => {
          if (
            activeRequest === requestId.current &&
            !(reason instanceof Error && reason.name === "AbortError")
          ) {
            setSuggestions([]);
            setError(
              reason instanceof Error
                ? reason.message
                : "Location search is unavailable.",
            );
          }
        })
        .finally(() => {
          if (activeRequest === requestId.current) setLoading(false);
        });
    }, 280);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const selectSuggestion = async (suggestion: PlaceSuggestion) => {
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch(
        `/api/places/details?placeId=${encodeURIComponent(suggestion.placeId)}`,
      );
      const details = (await response.json()) as PlaceDetails;
      if (
        !response.ok ||
        details.latitude === undefined ||
        details.longitude === undefined
      ) {
        throw new Error(details.error ?? "That place could not be mapped.");
      }
      onSelect({
        mode: "place",
        label: details.name ?? suggestion.mainText,
        address: details.address ?? suggestion.text,
        latitude: details.latitude,
        longitude: details.longitude,
      });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "That place could not be mapped.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="discover-search-step">
      <label className="discover-place-search">
        <Search aria-hidden size={20} />
        <input
          autoFocus
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search a city, beach, venue, or address"
          value={query}
        />
        {loading ? <span>Searching…</span> : null}
      </label>
      <div className="discover-place-actions">
        <button onClick={onCurrentLocation} type="button">
          <LocateFixed aria-hidden size={20} />
          <span>
            <strong>
              {locationState === "locating"
                ? "Finding your location…"
                : "Use my current location"}
            </strong>
            <small>
              {currentLocation
                ? "Ready to search nearby"
                : "We’ll expand the radius until at least five results appear"}
            </small>
          </span>
        </button>
        <button
          onClick={() => onSelect({ mode: "anywhere", label: "Anywhere" })}
          type="button"
        >
          <Map aria-hidden size={20} />
          <span>
            <strong>Anywhere</strong>
            <small>Explore every connected Duna market</small>
          </span>
        </button>
      </div>
      {error ? <p className="discover-search-error">{error}</p> : null}
      {suggestions.length > 0 ? (
        <div className="discover-place-results">
          <span>PLACES</span>
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.placeId}
              onClick={() => void selectSuggestion(suggestion)}
              type="button"
            >
              <MapPin aria-hidden size={18} />
              <span>
                <strong>{suggestion.mainText}</strong>
                <small>{suggestion.secondaryText}</small>
              </span>
            </button>
          ))}
        </div>
      ) : query.trim().length < 3 ? (
        <div className="discover-place-results">
          <span>CONNECTED MARKETS</span>
          {recommended.map((item) => (
            <button
              key={item.id}
              onClick={() =>
                onSelect({
                  mode: "place",
                  label: item.subtitle,
                  latitude: item.latitude!,
                  longitude: item.longitude!,
                })
              }
              type="button"
            >
              <MapPin aria-hidden size={18} />
              <span>
                <strong>{item.subtitle}</strong>
                <small>{item.title}</small>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function WhenStep({
  criteria,
  onChange,
}: {
  readonly criteria: DiscoverySearchCriteria;
  readonly onChange: (when: DiscoverySearchCriteria["when"]) => void;
}) {
  const [start, setStart] = useState(dateInputValue(criteria.when.startsAt));
  const [end, setEnd] = useState(dateInputValue(criteria.when.endsAt));
  const minimum = new Date().toISOString().slice(0, 10);
  const custom = customDiscoveryRange(start, end);
  return (
    <div className="discover-search-step">
      <div className="discover-when-options">
        {whenOptions.map((option) => (
          <button
            aria-pressed={criteria.when.preset === option.value}
            key={option.value}
            onClick={() => onChange(discoveryPresetRange(option.value))}
            type="button"
          >
            <CalendarDays aria-hidden size={19} />
            <span>
              <strong>{option.label}</strong>
              <small>{option.detail}</small>
            </span>
            {criteria.when.preset === option.value ? (
              <Check aria-hidden size={18} />
            ) : null}
          </button>
        ))}
      </div>
      <fieldset className="discover-custom-dates">
        <legend>Or choose a date range</legend>
        <label>
          <span>From</span>
          <input
            min={minimum}
            onChange={(event) => setStart(event.target.value)}
            type="date"
            value={start}
          />
        </label>
        <label>
          <span>To</span>
          <input
            min={start || minimum}
            onChange={(event) => setEnd(event.target.value)}
            type="date"
            value={end}
          />
        </label>
        <button
          disabled={!custom}
          onClick={() => custom && onChange(custom)}
          type="button"
        >
          Use these dates
        </button>
      </fieldset>
    </div>
  );
}

function WhatStep({
  criteria,
  onChange,
}: {
  readonly criteria: DiscoverySearchCriteria;
  readonly onChange: (what: readonly DiscoveryWhat[]) => void;
}) {
  const toggle = (value: DiscoveryWhat) => {
    if (value === "for-you") {
      onChange(["for-you"]);
      return;
    }
    const selected = criteria.what.filter((item) => item !== "for-you");
    const next = selected.includes(value)
      ? selected.filter((item) => item !== value)
      : [...selected, value];
    onChange(next.length > 0 ? next : ["for-you"]);
  };
  return (
    <div className="discover-what-options">
      {discoveryWhatOptions.map((option) => {
        const selected = criteria.what.includes(option.value);
        return (
          <button
            aria-pressed={selected}
            key={option.value}
            onClick={() => toggle(option.value)}
            type="button"
          >
            <span>
              <strong>{option.label}</strong>
              <small>{option.detail}</small>
            </span>
            <i>{selected ? <Check aria-hidden size={17} /> : null}</i>
          </button>
        );
      })}
    </div>
  );
}

function SearchDialog({
  criteria,
  currentLocation,
  items,
  locationState,
  onChange,
  onClose,
  onCurrentLocation,
  onSearch,
  step,
}: {
  readonly criteria: DiscoverySearchCriteria;
  readonly currentLocation?: DiscoveryCoordinates;
  readonly items: readonly DiscoveryMapItem[];
  readonly locationState: "idle" | "locating" | "ready" | "unavailable";
  readonly onChange: (criteria: DiscoverySearchCriteria) => void;
  readonly onClose: () => void;
  readonly onCurrentLocation: () => void;
  readonly onSearch: () => void;
  readonly step: SearchStep;
}) {
  const title =
    step === "where"
      ? "Where do you want to play?"
      : step === "when"
        ? "When works for you?"
        : "What are you looking for?";
  const reset = () => {
    if (step === "where") {
      onChange({
        ...criteria,
        location: { mode: "anywhere", label: "Anywhere" },
      });
    } else if (step === "when") {
      onChange({ ...criteria, when: { preset: "flexible" } });
    } else {
      onChange({ ...criteria, what: ["for-you"] });
    }
  };
  const result = runDiscoverySearch(items, criteria);
  return (
    <div className="discover-search-backdrop" role="presentation">
      <section
        aria-labelledby="discover-search-dialog-title"
        aria-modal="true"
        className="discover-search-dialog"
        role="dialog"
      >
        <header>
          <div>
            <span>{step.toUpperCase()}</span>
            <h2 id="discover-search-dialog-title">{title}</h2>
          </div>
          <button aria-label="Close search" onClick={onClose} type="button">
            <X aria-hidden size={22} />
          </button>
        </header>
        <div className="discover-search-dialog__body">
          {step === "where" ? (
            <WhereStep
              currentLocation={currentLocation}
              items={items}
              locationState={locationState}
              onCurrentLocation={onCurrentLocation}
              onSelect={(location) => onChange({ ...criteria, location })}
            />
          ) : step === "when" ? (
            <WhenStep
              criteria={criteria}
              onChange={(when) => onChange({ ...criteria, when })}
            />
          ) : (
            <WhatStep
              criteria={criteria}
              onChange={(what) => onChange({ ...criteria, what })}
            />
          )}
        </div>
        <footer>
          <button onClick={reset} type="button">
            Clear
          </button>
          <button onClick={onSearch} type="button">
            Show {result.items.length} results{" "}
            <ArrowRight aria-hidden size={17} />
          </button>
        </footer>
      </section>
    </div>
  );
}

export function DiscoveryExperience({
  items,
  market,
}: {
  readonly items: readonly DiscoveryMapItem[];
  readonly market: string;
}) {
  const router = useRouter();
  const [criteria, setCriteria] = useState<DiscoverySearchCriteria>(() =>
    defaultDiscoveryCriteria(),
  );
  const [step, setStep] = useState<SearchStep>();
  const [currentLocation, setCurrentLocation] =
    useState<DiscoveryCoordinates>();
  const [locationState, setLocationState] = useState<
    "idle" | "locating" | "ready" | "unavailable"
  >("idle");
  const locationTouched = useRef(false);
  const result = useMemo(
    () => runDiscoverySearch(items, criteria),
    [criteria, items],
  );
  const query = discoveryCriteriaToQuery(criteria);

  const requestLocation = (userInitiated = true) => {
    if (userInitiated) locationTouched.current = true;
    if (!navigator.geolocation) {
      setLocationState("unavailable");
      return;
    }
    setLocationState("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coordinates = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setCurrentLocation(coordinates);
        setLocationState("ready");
        if (userInitiated || !locationTouched.current) {
          setCriteria((current) => ({
            ...current,
            location: {
              mode: "current",
              label: "Current location",
              ...coordinates,
            },
          }));
        }
      },
      () => setLocationState("unavailable"),
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 8_000 },
    );
  };

  useEffect(() => {
    requestLocation(false);
  }, []);

  useEffect(() => {
    if (!step) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setStep(undefined);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [step]);

  const openResults = () => {
    setStep(undefined);
    router.push(`/discover/map?${discoveryCriteriaToQuery(criteria)}`);
  };
  const setSearchCriteria = (next: DiscoverySearchCriteria) => {
    if (next.location !== criteria.location) locationTouched.current = true;
    setCriteria(next);
  };
  const courts = result.items.filter((item) => item.entityType === "venue");
  const tournaments = result.items.filter(
    (item) =>
      item.entityType === "pro-tour" ||
      (item.entityType === "event" && item.kind === "tournament"),
  );
  const training = result.items.filter(
    (item) =>
      item.entityType === "coach" ||
      ["clinic", "private-lesson", "lesson", "training"].includes(item.kind),
  );
  const matches = result.items.filter((item) => item.entityType === "match");
  const organizations = result.items.filter(
    (item) => item.entityType === "organization",
  );

  return (
    <main className="discover-v2 discover-public">
      <section className="discover-v2-hero discover-search-hero">
        <div className="discover-v2-hero__copy">
          <span className="discover-v2-eyebrow">
            <i /> DISCOVER · {market.toUpperCase()}
          </span>
          <h1>Find your game.</h1>
          <p>
            Search every public court, event, tournament, league, coach, and
            match on Duna. Browse freely; sign in only when you are ready to
            book or join.
          </p>
        </div>
        <Link
          className="discover-v2-map-button"
          href={`/discover/map?${query}`}
        >
          <Map aria-hidden size={18} /> Open map
        </Link>
        <div className="discover-search-bar" aria-label="Search Duna">
          <SearchSelector
            detail={
              criteria.location.mode === "anywhere"
                ? "Every Duna market"
                : "Radius expands until play appears"
            }
            icon={<MapPin aria-hidden size={20} />}
            label="WHERE"
            onClick={() => setStep("where")}
            value={criteria.location.label}
          />
          <SearchSelector
            detail="A quick window or exact dates"
            icon={<CalendarDays aria-hidden size={20} />}
            label="WHEN"
            onClick={() => setStep("when")}
            value={discoveryWhenLabel(criteria.when)}
          />
          <SearchSelector
            detail="Play, train, watch, or rent"
            icon={<Sparkles aria-hidden size={20} />}
            label="WHAT"
            onClick={() => setStep("what")}
            value={discoveryWhatLabel(criteria.what)}
          />
          <button
            aria-label="Show search results on the map"
            className="discover-search-bar__submit"
            onClick={openResults}
            type="button"
          >
            <Search aria-hidden size={20} />
            <span>Search</span>
          </button>
        </div>
        <div className="discover-search-summary">
          <span>{discoveryResultSummary(result)}</span>
          {locationState === "locating" ? (
            <span>Finding your location…</span>
          ) : null}
          {locationState === "unavailable" ? (
            <button onClick={() => requestLocation()} type="button">
              <LocateFixed aria-hidden size={14} /> Try my location again
            </button>
          ) : null}
        </div>
      </section>

      <Link className="discover-pro-callout" href="/pro">
        <div>
          <span>
            <Trophy aria-hidden size={15} /> WATCH + FOLLOW
          </span>
          <strong>Pro Tour</strong>
          <small>Pools, real brackets, scores, and predictions</small>
        </div>
        <div
          className="discover-pro-callout__marks"
          aria-label="Featured tours"
        >
          <img alt="Beach Pro Tour" src="/media/tours/beach-pro-tour.svg" />
          <img alt="AVP" src="/media/tours/avp.svg" />
        </div>
        <ArrowRight aria-hidden size={18} />
      </Link>

      <DiscoveryMap
        items={result.items}
        resultsHref={`/discover/map?${query}`}
      />

      <Rail
        empty="No bookable courts match these choices yet."
        eyebrow="LIVE INVENTORY"
        href={`/discover/results?${query}&focus=courts`}
        items={courts.slice(0, 10)}
        title="Book a court."
      />
      <Rail
        empty="No upcoming tournaments match these choices."
        eyebrow="NEXT ON THE SAND"
        href={`/discover/results?${query}&focus=tournaments`}
        items={tournaments.slice(0, 10)}
        title="Tournaments coming up."
      />
      <Rail
        empty="No training or coaches match these choices yet."
        eyebrow="GET BETTER"
        href={`/discover/results?${query}&focus=training`}
        items={training.slice(0, 10)}
        title="Training built around you."
      />
      {matches.length > 0 ? (
        <Rail
          empty="No live or scheduled matches match these choices."
          eyebrow="WATCH + PLAY"
          href={`/discover/results?${query}&focus=matches`}
          items={matches.slice(0, 10)}
          title="Matches in motion."
        />
      ) : null}
      {organizations.length > 0 ? (
        <Rail
          empty="Public clubs will appear here as they connect."
          eyebrow="LOCAL NETWORK"
          href={`/discover/results?${query}&focus=clubs`}
          items={organizations.slice(0, 10)}
          title="Clubs to know."
        />
      ) : null}

      {step ? (
        <SearchDialog
          criteria={criteria}
          currentLocation={currentLocation}
          items={items}
          locationState={locationState}
          onChange={setSearchCriteria}
          onClose={() => setStep(undefined)}
          onCurrentLocation={() => requestLocation()}
          onSearch={openResults}
          step={step}
        />
      ) : null}
    </main>
  );
}
