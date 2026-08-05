"use client";

import type { DiscoveryEntityType, DiscoveryMapItem } from "@duna/api";
import { ArrowLeft, Map, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { DiscoveryCard } from "./discovery-card";

const resultTypes: readonly {
  value: "all" | DiscoveryEntityType;
  label: string;
}[] = [
  { value: "all", label: "All" },
  { value: "event", label: "Events" },
  { value: "venue", label: "Courts" },
  { value: "coach", label: "Coaches" },
  { value: "pro-tour", label: "Pro tour" },
];

function validType(value?: string): "all" | DiscoveryEntityType {
  return resultTypes.some((type) => type.value === value)
    ? (value as "all" | DiscoveryEntityType)
    : "all";
}

function distanceMiles(
  location:
    { readonly latitude: number; readonly longitude: number } | undefined,
  item: DiscoveryMapItem,
) {
  if (
    !location ||
    item.latitude === undefined ||
    item.longitude === undefined
  ) {
    return Number.POSITIVE_INFINITY;
  }
  const radians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = radians(item.latitude - location.latitude);
  const longitudeDelta = radians(item.longitude - location.longitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(location.latitude)) *
      Math.cos(radians(item.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function DiscoveryResults({
  items,
  initialQuery,
  initialType,
  initialKind,
  initialScope,
}: {
  readonly items: readonly DiscoveryMapItem[];
  readonly initialQuery: string;
  readonly initialType?: string;
  readonly initialKind?: string;
  readonly initialScope?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [committedQuery, setCommittedQuery] = useState(initialQuery);
  const [type, setType] = useState(validType(initialType));
  const [location, setLocation] = useState<{
    readonly latitude: number;
    readonly longitude: number;
  }>();
  useEffect(() => {
    if (initialScope !== "nearby" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) =>
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
      () => undefined,
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 8_000 },
    );
  }, [initialScope]);
  const results = useMemo(() => {
    const normalized = committedQuery.trim().toLowerCase();
    const now = Date.now();
    return items
      .filter((item) => {
        if (!item.endsAt) return true;
        const timestamp = Date.parse(item.endsAt);
        return Number.isNaN(timestamp) || timestamp >= now;
      })
      .filter((item) => type === "all" || item.entityType === type)
      .filter(
        (item) =>
          !initialKind ||
          (initialKind === "tournament"
            ? (item.entityType === "pro-tour" || item.kind === "tournament") &&
              new Date(item.endsAt ?? item.startsAt ?? 0).getTime() >=
                new Date().setHours(0, 0, 0, 0)
            : item.kind === initialKind),
      )
      .filter((item) =>
        normalized
          ? [item.title, item.subtitle, item.kind, ...item.tags]
              .join(" ")
              .toLowerCase()
              .includes(normalized)
          : true,
      )
      .sort((left, right) =>
        initialScope === "nearby"
          ? distanceMiles(location, left) - distanceMiles(location, right)
          : (left.startsAt ?? "9999").localeCompare(right.startsAt ?? "9999"),
      );
  }, [committedQuery, initialKind, initialScope, items, location, type]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setCommittedQuery(query);
  };
  return (
    <main className="discover-v2-results-page">
      <header>
        <Link href="/app/discover">
          <ArrowLeft aria-hidden size={17} /> Discover
        </Link>
        <div>
          <span>
            {initialScope === "nearby" ? "AROUND YOU" : "SEARCH DUNA"}
          </span>
          <h1>
            {initialKind === "tournament"
              ? "Tournaments coming up."
              : "Find exactly your kind of play."}
          </h1>
        </div>
        <Link className="discover-v2-map-button" href="/app/discover/map">
          <Map aria-hidden size={17} /> Map
        </Link>
      </header>
      <form onSubmit={submit}>
        <Search aria-hidden size={18} />
        <input
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search these results"
          value={query}
        />
        <button type="submit">Search</button>
      </form>
      <nav aria-label="Result type">
        {resultTypes.map((resultType) => (
          <button
            aria-pressed={type === resultType.value}
            key={resultType.value}
            onClick={() => setType(resultType.value)}
            type="button"
          >
            {resultType.label}
          </button>
        ))}
      </nav>
      <div className="discover-v2-results-page__count">
        {results.length} {results.length === 1 ? "match" : "matches"}
      </div>
      <section className="discover-v2-results-grid">
        {results.map((item) => (
          <DiscoveryCard item={item} key={item.id} />
        ))}
        {results.length === 0 ? (
          <div className="discover-v2-empty">
            No results yet. Try a broader place, person, or play type.
          </div>
        ) : null}
      </section>
    </main>
  );
}
