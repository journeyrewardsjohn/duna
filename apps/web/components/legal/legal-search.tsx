"use client";

import {
  EmptyResults,
  SearchField,
  useDebouncedValue,
} from "@duna/ui/tideline";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { LegalSearchEntry } from "./legal-library";

const LIMIT = 12;

/** Ranks documents above headings, and exact title starts above the rest. */
export function searchLegal(
  entries: readonly LegalSearchEntry[],
  query: string,
): LegalSearchEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  const score = (entry: LegalSearchEntry) =>
    (entry.kind === "document" ? 0 : 2) +
    (entry.title.toLowerCase().includes(terms.join(" ")) ? 0 : 1);
  return entries
    .filter((entry) => terms.every((term) => entry.haystack.includes(term)))
    .sort((a, b) => score(a) - score(b));
}

/** Search across every document's title, summary and headings (no network). */
export function LegalSearch({
  entries,
  label = "Search terms and policies",
}: {
  readonly entries: readonly LegalSearchEntry[];
  readonly label?: string;
}) {
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query);
  const results = useMemo(
    () => searchLegal(entries, debounced),
    [entries, debounced],
  );
  const active = debounced.trim().length > 0;
  const status = !active ? "idle" : results.length ? "success" : "empty";

  return (
    <div className="lc-search" role="search">
      <SearchField
        label={label}
        messages={{
          success: (count) =>
            `${count} ${count === 1 ? "match" : "matches"}${
              (count ?? 0) > LIMIT ? `, showing the first ${LIMIT}` : ""
            }.`,
        }}
        onValueChange={setQuery}
        placeholder="Search, for example “refund” or “cookies”"
        resultCount={results.length}
        stale={query !== debounced}
        status={status}
        value={query}
      >
        {status === "empty" ? (
          <EmptyResults onClear={() => setQuery("")} query={debounced.trim()} />
        ) : (
          <ul className="lc-search__results">
            {results.slice(0, LIMIT).map((entry) => (
              <li key={entry.id}>
                <Link className="lc-search__result" href={entry.href}>
                  <span className="lc-search__title">{entry.title}</span>
                  <span className="lc-search__context">
                    {entry.kind === "document"
                      ? entry.status === "draft"
                        ? "Document · Draft for review"
                        : "Document · In effect"
                      : `Section of ${entry.documentTitle}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SearchField>
    </div>
  );
}
