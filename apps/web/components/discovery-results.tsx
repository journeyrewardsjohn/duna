"use client";

import {
  discoveryResultSummary,
  discoveryWhatLabel,
  discoveryWhenLabel,
  runDiscoverySearch,
  type DiscoveryMapItem,
  type DiscoverySearchCriteria,
} from "@duna/api/discovery-search";
import { ArrowLeft, Map, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { discoveryCriteriaToQuery } from "@/lib/discovery-query";
import { DiscoveryCard } from "./discovery-card";

const focusOptions = [
  { value: "all", label: "All" },
  { value: "events", label: "Events" },
  { value: "tournaments", label: "Tournaments" },
  { value: "leagues", label: "Leagues" },
  { value: "training", label: "Training" },
  { value: "matches", label: "Matches" },
  { value: "courts", label: "Court rentals" },
  { value: "clubs", label: "Clubs" },
] as const;

type Focus = (typeof focusOptions)[number]["value"];

function validFocus(value?: string): Focus {
  return focusOptions.some((option) => option.value === value)
    ? (value as Focus)
    : "all";
}

function matchesFocus(item: DiscoveryMapItem, focus: Focus) {
  if (focus === "all") return true;
  if (focus === "events") return item.entityType === "event";
  if (focus === "tournaments") {
    return item.entityType === "pro-tour" || item.kind === "tournament";
  }
  if (focus === "leagues") return item.kind === "league";
  if (focus === "training") {
    return (
      item.entityType === "coach" ||
      ["clinic", "private-lesson", "lesson", "training"].includes(item.kind)
    );
  }
  if (focus === "matches") return item.entityType === "match";
  if (focus === "courts") return item.entityType === "venue";
  return item.entityType === "organization";
}

export function DiscoveryResults({
  items,
  initialCriteria,
  focus,
}: {
  readonly items: readonly DiscoveryMapItem[];
  readonly initialCriteria: DiscoverySearchCriteria;
  readonly focus?: string;
}) {
  const [activeFocus, setActiveFocus] = useState<Focus>(validFocus(focus));
  const [query, setQuery] = useState("");
  const result = useMemo(
    () => runDiscoverySearch(items, initialCriteria),
    [initialCriteria, items],
  );
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return result.items
      .filter((item) => matchesFocus(item, activeFocus))
      .filter((item) =>
        normalized
          ? [item.title, item.subtitle, item.kind, ...item.tags]
              .join(" ")
              .toLowerCase()
              .includes(normalized)
          : true,
      );
  }, [activeFocus, query, result.items]);
  const serialized = discoveryCriteriaToQuery(initialCriteria);
  return (
    <main className="discover-v2-results-page discover-public">
      <header>
        <Link href="/discover">
          <ArrowLeft aria-hidden size={17} /> Edit search
        </Link>
        <div>
          <span>PUBLIC DISCOVERY</span>
          <h1>Find exactly your kind of play.</h1>
          <p>
            {initialCriteria.location.label} ·{" "}
            {discoveryWhenLabel(initialCriteria.when)} ·{" "}
            {discoveryWhatLabel(initialCriteria.what)}
          </p>
        </div>
        <Link
          className="discover-v2-map-button"
          href={`/discover/map?${serialized}`}
        >
          <Map aria-hidden size={17} /> Map
        </Link>
      </header>
      <label className="discover-results-search">
        <Search aria-hidden size={18} />
        <input
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search within these results"
          value={query}
        />
      </label>
      <nav aria-label="Result type">
        {focusOptions.map((option) => (
          <button
            aria-pressed={activeFocus === option.value}
            key={option.value}
            onClick={() => setActiveFocus(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </nav>
      <div className="discover-v2-results-page__count">
        {filtered.length === result.items.length
          ? discoveryResultSummary(result)
          : `${filtered.length} of ${result.items.length} results`}
      </div>
      <section className="discover-v2-results-grid">
        {filtered.map((item) => (
          <DiscoveryCard item={item} key={item.id} />
        ))}
        {filtered.length === 0 ? (
          <div className="discover-v2-empty">
            Nothing matches this view yet. Clear the text filter, choose All, or
            broaden Where and When.
          </div>
        ) : null}
      </section>
    </main>
  );
}
