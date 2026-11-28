"use client";

import {
  Chip,
  EmptyResults,
  FilterChip,
  SearchField,
  useDebouncedValue,
} from "@duna/ui/tideline";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  matchesSaleFilter,
  matchesSearch,
  saleFilters,
  type SaleFilter,
} from "./money-model";
import type { SaleRow } from "./sales";

type SortKey = "date" | "amount";

/**
 * Every sale, searchable (debounced) and filterable by what happened to the
 * money, sortable by date or amount. A real table on wide screens; each row
 * stacks into a card on a phone.
 */
export function SalesTable({
  rows,
  initialFilter = "all",
  initialQuery = "",
}: {
  readonly rows: readonly SaleRow[];
  readonly initialFilter?: SaleFilter;
  readonly initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState<SaleFilter>(initialFilter);
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({
    key: "date",
    descending: true,
  });
  const debounced = useDebouncedValue(query);
  const shown = useMemo(() => {
    const filtered = rows.filter(
      (row) =>
        matchesSaleFilter(row.status, filter) &&
        matchesSearch(debounced, [
          row.title,
          row.buyer,
          row.state.label,
          row.gross,
        ]),
    );
    const direction = sort.descending ? -1 : 1;
    return [...filtered].sort((a, b) =>
      sort.key === "amount"
        ? direction * (a.grossMinor - b.grossMinor)
        : direction * (a.occurredAt ?? "").localeCompare(b.occurredAt ?? ""),
    );
  }, [rows, filter, debounced, sort]);

  const sortButton = (key: SortKey, label: string) => {
    const active = sort.key === key;
    return (
      <button
        className="money-sort"
        onClick={() =>
          setSort((current) => ({
            key,
            descending: current.key === key ? !current.descending : true,
          }))
        }
        type="button"
      >
        {label}
        <span aria-hidden="true" className="money-sort__mark">
          {active ? (sort.descending ? "↓" : "↑") : ""}
        </span>
        <span className="td-sr">
          {active
            ? `, sorted ${sort.descending ? "newest or largest first" : "oldest or smallest first"}`
            : ", sort"}
        </span>
      </button>
    );
  };

  return (
    <div className="money-sales">
      <div className="money-sales__tools">
        <SearchField
          label="Search transactions"
          onValueChange={setQuery}
          placeholder="Search by item, person or state"
          resultCount={shown.length}
          status={debounced !== query ? "loading" : "idle"}
          value={query}
        />
        <div aria-label="Show" className="money-filters" role="group">
          {saleFilters.map((option) => (
            <FilterChip
              key={option.value}
              onPressedChange={(pressed) =>
                setFilter(pressed ? option.value : "all")
              }
              pressed={filter === option.value}
            >
              {option.label}
            </FilterChip>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <EmptyResults
          clearLabel="Show every sale"
          onClear={() => {
            setQuery("");
            setFilter("all");
          }}
          query={debounced || undefined}
        />
      ) : (
        <table aria-label="Sales and payments" className="money-table">
          <thead>
            <tr>
              <th
                aria-sort={
                  sort.key === "date"
                    ? sort.descending
                      ? "descending"
                      : "ascending"
                    : "none"
                }
                scope="col"
              >
                {sortButton("date", "Date")}
              </th>
              <th scope="col">Sale</th>
              <th
                aria-sort={
                  sort.key === "amount"
                    ? sort.descending
                      ? "descending"
                      : "ascending"
                    : "none"
                }
                className="money-table__num"
                scope="col"
              >
                {sortButton("amount", "Paid")}
              </th>
              <th className="money-table__num" scope="col">
                Duna fees
              </th>
              <th className="money-table__num" scope="col">
                You receive
              </th>
              <th scope="col">Session</th>
              <th scope="col">Payout</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.id}>
                <td className="money-table__date" data-label="Date">
                  {row.date ?? "Not yet"}
                </td>
                <td className="money-table__salecell" data-label="Sale">
                  <div className="money-table__sale">
                    <Link
                      aria-label={`Open ${row.title}${row.buyer ? ` for ${row.buyer}` : ""} transaction`}
                      className="money-table__title"
                      href={row.href}
                    >
                      {row.title}
                    </Link>
                    <span className="money-table__meta">
                      {[
                        row.buyer,
                        row.paidWith
                          ? `Paid by ${row.paidWith.toLowerCase()}`
                          : undefined,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    <Chip tone={row.state.tone}>{row.state.label}</Chip>
                  </div>
                </td>
                <td className="money-table__num" data-label="Paid">
                  <span className="money-amount">{row.gross}</span>
                  {row.refunded ? (
                    <span className="money-table__meta money-amount">
                      −{row.refunded} refunded
                    </span>
                  ) : null}
                </td>
                <td className="money-table__num" data-label="Duna fees">
                  <span className="money-amount" data-tone="muted">
                    {row.fees ?? "Not shown"}
                  </span>
                </td>
                <td className="money-table__num" data-label="You receive">
                  <span className="money-amount">{row.net ?? "Pending"}</span>
                </td>
                <td data-label="Session">
                  {row.delivery ? (
                    <span className="money-table__meta">
                      {row.delivery.label}
                    </span>
                  ) : (
                    <span className="money-table__meta">Not tracked</span>
                  )}
                </td>
                <td data-label="Payout">
                  <span className="money-table__meta">
                    {row.release ?? "See the payment"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
