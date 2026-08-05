"use client";

import type { DiscoveryEntityType, DiscoveryMapItem } from "@duna/api";
import {
  ArrowRight,
  LocateFixed,
  Map,
  Search,
  Sparkles,
  Trophy,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { DiscoveryCard } from "./discovery-card";
import { DiscoveryMap } from "./discovery-map";

type Coordinates = { readonly latitude: number; readonly longitude: number };
type EntityFilter = "all" | DiscoveryEntityType;

const entityFilters: readonly { value: EntityFilter; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "event", label: "Play & events" },
  { value: "venue", label: "Courts" },
  { value: "coach", label: "Coaches" },
  { value: "pro-tour", label: "Pro tour" },
];

function distanceMiles(
  origin: Coordinates | undefined,
  item: DiscoveryMapItem,
) {
  if (!origin || item.latitude === undefined || item.longitude === undefined) {
    return Number.POSITIVE_INFINITY;
  }
  const radius = 3958.8;
  const radians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = radians(item.latitude - origin.latitude);
  const longitudeDelta = radians(item.longitude - origin.longitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(origin.latitude)) *
      Math.cos(radians(item.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function matchesQuery(item: DiscoveryMapItem, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [item.title, item.subtitle, item.kind, item.entityType, ...item.tags]
    .join(" ")
    .toLowerCase()
    .includes(normalized);
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

export function DiscoveryExperience({
  items,
  homeOrganizationIds,
  market,
}: {
  readonly items: readonly DiscoveryMapItem[];
  readonly homeOrganizationIds: readonly string[];
  readonly market: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [entityFilter, setEntityFilter] = useState<EntityFilter>("all");
  const [location, setLocation] = useState<Coordinates>();
  const [locationState, setLocationState] = useState<
    "idle" | "locating" | "ready" | "unavailable"
  >("idle");
  const discoverableItems = useMemo(() => {
    const now = Date.now();
    return items.filter((item) => {
      if (!item.endsAt) return true;
      const timestamp = Date.parse(item.endsAt);
      return Number.isNaN(timestamp) || timestamp >= now;
    });
  }, [items]);

  const filtered = useMemo(
    () =>
      discoverableItems.filter(
        (item) =>
          (entityFilter === "all" || item.entityType === entityFilter) &&
          matchesQuery(item, query),
      ),
    [discoverableItems, entityFilter, query],
  );
  const sortedNearby = useMemo(
    () =>
      [...filtered].sort(
        (left, right) =>
          distanceMiles(location, left) - distanceMiles(location, right),
      ),
    [filtered, location],
  );
  const suggestions = useMemo(
    () => (query.trim() ? sortedNearby.slice(0, 6) : []),
    [query, sortedNearby],
  );
  const courts = sortedNearby.filter((item) => item.entityType === "venue");
  const tournaments = filtered
    .filter(
      (item) =>
        (item.entityType === "pro-tour" ||
          (item.entityType === "event" && item.kind === "tournament")) &&
        new Date(item.endsAt ?? item.startsAt ?? 0).getTime() >=
          new Date().setHours(0, 0, 0, 0),
    )
    .sort((left, right) =>
      (left.startsAt ?? "9999").localeCompare(right.startsAt ?? "9999"),
    );
  const aroundYou = sortedNearby.filter(
    (item) => item.entityType !== "pro-tour",
  );
  const proEvents = filtered.filter((item) => item.entityType === "pro-tour");
  const homeItems = filtered.filter(
    (item) =>
      item.organizationId && homeOrganizationIds.includes(item.organizationId),
  );

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationState("unavailable");
      return;
    }
    setLocationState("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocationState("ready");
      },
      () => setLocationState("unavailable"),
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 8_000 },
    );
  };

  useEffect(() => {
    requestLocation();
  }, []);

  useEffect(() => setActiveSuggestion(0), [query]);

  const openResults = (event?: FormEvent) => {
    event?.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (entityFilter !== "all") params.set("type", entityFilter);
    router.push(`/app/discover/results?${params.toString()}`);
  };

  const handleSearchKeys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && suggestions.length > 0) {
      event.preventDefault();
      setActiveSuggestion((value) => (value + 1) % suggestions.length);
    } else if (event.key === "ArrowUp" && suggestions.length > 0) {
      event.preventDefault();
      setActiveSuggestion(
        (value) => (value - 1 + suggestions.length) % suggestions.length,
      );
    } else if (event.key === "Enter" && suggestions[activeSuggestion]) {
      event.preventDefault();
      router.push(suggestions[activeSuggestion].href);
    } else if (event.key === "Escape") {
      setSearchOpen(false);
    }
  };

  return (
    <main className="discover-v2">
      <section className="discover-v2-hero">
        <div className="discover-v2-hero__copy">
          <span className="discover-v2-eyebrow">
            <i /> DISCOVER · {market.toUpperCase()}
          </span>
          <h1>The whole world of sand.</h1>
          <p>
            Courts, tournaments, coaches, and the pro tour—one intelligent map
            built around where you want to play.
          </p>
        </div>
        <Link className="discover-v2-map-button" href="/app/discover/map">
          <Map aria-hidden size={18} /> Open globe
        </Link>
        <form className="discover-v2-search" onSubmit={openResults}>
          <Search aria-hidden size={20} />
          <input
            aria-label="Search Duna"
            aria-autocomplete="list"
            aria-controls="discover-search-suggestions"
            aria-expanded={searchOpen && suggestions.length > 0}
            onChange={(event) => {
              setQuery(event.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={handleSearchKeys}
            placeholder="Try “open play,” a coach, city, or tournament"
            value={query}
          />
          {query ? (
            <button
              aria-label="Clear search"
              className="discover-v2-search__clear"
              onClick={() => setQuery("")}
              type="button"
            >
              <X aria-hidden size={17} />
            </button>
          ) : null}
          <button className="discover-v2-search__submit" type="submit">
            Search
          </button>
          {searchOpen && suggestions.length > 0 ? (
            <div
              className="discover-v2-suggestions"
              id="discover-search-suggestions"
              role="listbox"
            >
              <div className="discover-v2-suggestions__label">
                <Sparkles aria-hidden size={14} /> Best matches
              </div>
              {suggestions.map((item, index) => (
                <Link
                  aria-selected={activeSuggestion === index}
                  className={
                    activeSuggestion === index ? "is-active" : undefined
                  }
                  href={item.href}
                  key={item.id}
                  role="option"
                >
                  <span className={`discover-v2-dot is-${item.entityType}`} />
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.subtitle}</small>
                  </span>
                  <em>{item.entityType.replace("-", " ")}</em>
                </Link>
              ))}
              <button onClick={() => openResults()} type="button">
                See all {filtered.length} results{" "}
                <ArrowRight aria-hidden size={15} />
              </button>
            </div>
          ) : null}
        </form>
        <div className="discover-v2-filter-bar">
          <span>{filtered.length} matches</span>
          <div aria-label="Discovery filters">
            {entityFilters.map((filter) => (
              <button
                aria-pressed={entityFilter === filter.value}
                key={filter.value}
                onClick={() => setEntityFilter(filter.value)}
                type="button"
              >
                {filter.label}
              </button>
            ))}
          </div>
          <button
            className="discover-v2-location-button"
            onClick={requestLocation}
            type="button"
          >
            <LocateFixed aria-hidden size={15} />
            {locationState === "locating"
              ? "Finding you…"
              : locationState === "ready"
                ? "Using your location"
                : "Use my location"}
          </button>
        </div>
      </section>

      {proEvents[0] ? (
        <Link className="discover-v2-pro-feature" href={proEvents[0].href}>
          <div>
            <span>
              <Trophy aria-hidden size={15} />
              {proEvents[0].live ? "LIVE PRO TOUR" : "PRO TOUR SPOTLIGHT"}
            </span>
            <h2>{proEvents[0].title}</h2>
            <p>{proEvents[0].subtitle}</p>
          </div>
          <strong>
            Follow the action <ArrowRight aria-hidden size={17} />
          </strong>
        </Link>
      ) : null}

      <DiscoveryMap items={filtered} />

      {homeItems.length > 0 ? (
        <Rail
          empty="Your club’s next sessions will land here."
          eyebrow="YOUR CLUB"
          href="/app/discover/results?scope=club"
          items={homeItems.slice(0, 8)}
          title="Start where you already belong."
        />
      ) : null}
      <Rail
        empty="No bookable courts match this filter yet."
        eyebrow="LIVE INVENTORY · NEARBY"
        href="/app/discover/results?type=venue&scope=nearby"
        items={courts.slice(0, 10)}
        title="Book a court."
      />
      <Rail
        empty="No upcoming tournaments match this filter."
        eyebrow="NEXT ON THE SAND"
        href="/app/discover/results?kind=tournament"
        items={tournaments.slice(0, 10)}
        title="Tournaments coming up."
      />
      <Rail
        empty="Nothing nearby matches yet—try Everything."
        eyebrow={
          locationState === "ready"
            ? "SORTED FROM YOUR LOCATION"
            : "CONNECTED NEARBY"
        }
        href="/app/discover/results?scope=nearby"
        items={aroundYou.slice(0, 12)}
        title="Around you."
      />
    </main>
  );
}
