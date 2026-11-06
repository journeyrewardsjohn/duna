"use client";

import type { OperatorDashboard, OperatorWorkspace } from "@duna/api";
import { formatMoney, formatVenueTime } from "@duna/core";
import { Badge } from "@duna/ui";
import {
  createColumnHelper,
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_alphanumericCaseSensitive,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  sortFn_textCaseSensitive,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { SessionDraftReview } from "./session-draft-manager";

interface EventRow {
  id: string;
  title: string;
  kind: string;
  status: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  venue: string;
  available: number;
  capacity: number;
  price: number;
  currency: OperatorWorkspace["sessions"][number]["currency"];
  manageHref?: string;
  publicHref?: string;
}
const features = tableFeatures({
  rowSortingFeature,
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    alphanumericCaseSensitive: sortFn_alphanumericCaseSensitive,
    basic: sortFn_basic,
    datetime: sortFn_datetime,
    text: sortFn_text,
    textCaseSensitive: sortFn_textCaseSensitive,
  },
  sortedRowModel: createSortedRowModel(),
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
});
const helper = createColumnHelper<typeof features, EventRow>();
const label = (value: string) =>
  value.replaceAll("-", " ").replace(/\b\w/g, (c) => c.toUpperCase());
const statusTone = (status: string) =>
  status === "live"
    ? "live"
    : status === "draft" || status === "weather-hold"
      ? "warning"
      : status === "cancelled"
        ? "danger"
        : "neutral";

function matchesView(row: EventRow, value: string, now: number) {
  return value === "draft"
    ? row.status === "draft"
    : value === "upcoming"
      ? row.status !== "draft" &&
        row.status !== "cancelled" &&
        row.status !== "completed" &&
        Date.parse(row.endsAt) >= now
      : value === "past"
        ? row.status !== "draft" && Date.parse(row.endsAt) < now
        : true;
}

export function EventsTable({
  dashboard,
  workspace,
  kinds,
  focusedDraftId,
  publicWebUrl,
}: {
  readonly dashboard: OperatorDashboard;
  readonly workspace: OperatorWorkspace;
  readonly kinds?: readonly string[];
  readonly focusedDraftId?: string;
  readonly publicWebUrl: string;
}) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [view, setView] = useState("all");
  const [kind, setKind] = useState("all");
  const [status, setStatus] = useState("all");
  const [now] = useState(() => Date.now());
  const rows = useMemo(() => {
    const activeCounts = new Map<string, number>();
    for (const registration of workspace.eventRegistrations) {
      if (["confirmed", "checked-in"].includes(registration.status))
        activeCounts.set(
          registration.sessionId,
          (activeCounts.get(registration.sessionId) ?? 0) + 1,
        );
    }
    const sessions = workspace.sessions.filter((session) =>
      kinds ? kinds.includes(session.kind) : session.kind !== "league",
    );
    const allSessionIds = new Set(
      workspace.sessions.map((session) => session.id),
    );
    const listings = new Map(
      dashboard.events.map((event) => [event.id, event]),
    );
    const result: EventRow[] = sessions.map((session) => ({
      id: session.id,
      title: session.title,
      kind: session.kind,
      status: session.status,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      timezone: session.timezone,
      venue: session.venueName ?? "Location pending",
      capacity: session.capacity,
      available:
        listings.get(session.id)?.spotsRemaining ??
        Math.max(0, session.capacity - (activeCounts.get(session.id) ?? 0)),
      price: session.priceMinor,
      currency: session.currency,
      manageHref:
        session.status === "draft"
          ? `/events/create?draft=${session.id}`
          : `/events/${session.id}`,
      publicHref:
        session.status !== "draft" && listings.has(session.id)
          ? `${publicWebUrl}/events/${listings.get(session.id)!.slug}`
          : undefined,
    }));
    for (const event of dashboard.events) {
      if (
        allSessionIds.has(event.id) ||
        (kinds ? !kinds.includes(event.kind) : event.kind === "league")
      )
        continue;
      result.push({
        id: event.id,
        title: event.title,
        kind: event.kind,
        status: event.live ? "live" : "published",
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        timezone: event.timezone,
        venue: event.venueName,
        available: event.spotsRemaining,
        capacity: event.capacity,
        price: event.price.amountMinor,
        currency: event.price.currency,
        publicHref: `${publicWebUrl}/events/${event.slug}`,
      });
    }
    return result;
  }, [
    dashboard.events,
    workspace.sessions,
    workspace.eventRegistrations,
    kinds,
    publicWebUrl,
  ]);
  const filtered = useMemo(
    () =>
      rows.filter(
        (row) =>
          matchesView(row, view, now) &&
          (kind === "all" || row.kind === kind) &&
          (status === "all" || row.status === status) &&
          `${row.title} ${row.venue}`
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
      ),
    [rows, view, now, kind, status, query],
  );
  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor("title", {
          header: "Event",
          cell: ({ row }) => (
            <div className="events-table__name">
              <Link
                href={
                  row.original.manageHref ?? row.original.publicHref ?? pathname
                }
              >
                {row.original.title}
              </Link>
              <small>{label(row.original.kind)}</small>
            </div>
          ),
        }),
        helper.accessor("status", {
          header: "Status",
          cell: ({ getValue }) => (
            <Badge tone={statusTone(getValue())}>{label(getValue())}</Badge>
          ),
        }),
        helper.accessor("startsAt", {
          header: "Date",
          cell: ({ row }) => (
            <time dateTime={row.original.startsAt}>
              {formatVenueTime(
                row.original.startsAt,
                row.original.timezone,
                "en-US",
                { month: "short", day: "numeric", year: "numeric" },
              )}
              <small>
                {formatVenueTime(
                  row.original.startsAt,
                  row.original.timezone,
                  "en-US",
                  { hour: "numeric", minute: "2-digit", timeZoneName: "short" },
                )}
              </small>
            </time>
          ),
        }),
        helper.accessor("venue", { header: "Location" }),
        helper.accessor("available", {
          header: "Availability",
          cell: ({ row }) =>
            row.original.status === "draft" ? (
              <span>{row.original.capacity} capacity</span>
            ) : (
              <span>
                {row.original.available} spots left
                <small>{row.original.capacity} capacity</small>
              </span>
            ),
        }),
        helper.accessor("price", {
          header: "Entry",
          enableSorting: false,
          cell: ({ row }) =>
            row.original.price
              ? formatMoney(
                  row.original.price,
                  row.original
                    .currency as OperatorWorkspace["sessions"][number]["currency"],
                )
              : "Free",
        }),
        helper.display({
          id: "actions",
          header: "Actions",
          cell: ({ row }) => (
            <div className="events-table__actions">
              {row.original.status === "draft" ? (
                <>
                  <Link
                    href={`${pathname}?draft=${row.original.id}#draft-${row.original.id}`}
                  >
                    Review
                  </Link>
                  <Link href={row.original.manageHref!}>Edit</Link>
                </>
              ) : (
                <>
                  {row.original.manageHref && (
                    <Link href={row.original.manageHref}>Manage</Link>
                  )}
                  {row.original.publicHref && (
                    <a
                      href={row.original.publicHref}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Player page
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  )}
                </>
              )}
            </div>
          ),
        }),
      ]),
    [pathname],
  );
  const table = useTable({
    features,
    columns,
    data: filtered,
    getRowId: (row) => row.id,
    initialState: {
      sorting: [{ id: "startsAt", desc: false }],
      pagination: { pageIndex: 0, pageSize: 25 },
    },
  });
  const reset = () => {
    setQuery("");
    setKind("all");
    setStatus("all");
    setView("all");
    table.firstPage();
  };
  const hasFilters =
    query || kind !== "all" || status !== "all" || view !== "all";
  const review = workspace.sessions.find(
    (session) =>
      session.id === focusedDraftId &&
      session.status === "draft" &&
      (kinds ? kinds.includes(session.kind) : session.kind !== "league"),
  );
  const pageIndex = table.state.pagination.pageIndex;
  const pageSize = table.state.pagination.pageSize;
  return (
    <div className="events-directory">
      {review && (
        <section
          className="events-directory__review"
          aria-label="Draft publication review"
        >
          <header>
            <h2>Review draft</h2>
            <Link className="hq-button" href={pathname}>
              Close review
            </Link>
          </header>
          <SessionDraftReview session={review} workspace={workspace} />
        </section>
      )}
      <section className="events-directory__panel" aria-label="Event directory">
        <div
          className="events-directory__views"
          role="group"
          aria-label="Event views"
        >
          {[
            ["all", "All events"],
            ["upcoming", "Upcoming"],
            ["draft", "Drafts"],
            ["past", "Past"],
          ].map(([value, title]) => (
            <button
              type="button"
              key={value}
              aria-pressed={view === value}
              onClick={() => {
                setView(value);
                table.firstPage();
              }}
            >
              {title}
              <span>
                {rows.filter((row) => matchesView(row, value, now)).length}
              </span>
            </button>
          ))}
        </div>
        <div className="events-directory__toolbar">
          <label className="events-directory__search">
            <Search aria-hidden size={17} />
            <span className="sr-only">Search events</span>
            <input
              type="search"
              placeholder="Search events or locations"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                table.firstPage();
              }}
            />
          </label>
          <select
            aria-label="Event type"
            value={kind}
            onChange={(event) => {
              setKind(event.target.value);
              table.firstPage();
            }}
          >
            <option value="all">All types</option>
            {[...new Set(rows.map((row) => row.kind))].sort().map((value) => (
              <option key={value} value={value}>
                {label(value)}
              </option>
            ))}
          </select>
          <select
            aria-label="Event status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              table.firstPage();
            }}
          >
            <option value="all">All statuses</option>
            {[...new Set(rows.map((row) => row.status))].sort().map((value) => (
              <option key={value} value={value}>
                {label(value)}
              </option>
            ))}
          </select>
          {hasFilters && (
            <button type="button" onClick={reset}>
              Clear filters
            </button>
          )}
        </div>
        <div
          className="hq-data-scroll"
          role="region"
          aria-label="Events table"
          tabIndex={0}
        >
          <table className="hq-data-table events-table">
            <caption className="sr-only">Events</caption>
            <thead>
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>
                  {group.headers.map((header) => {
                    const direction = header.column.getIsSorted();
                    return (
                      <th
                        scope="col"
                        key={header.id}
                        aria-sort={
                          header.column.getCanSort()
                            ? direction === "asc"
                              ? "ascending"
                              : direction === "desc"
                                ? "descending"
                                : "none"
                            : undefined
                        }
                      >
                        {header.column.getCanSort() ? (
                          <button
                            type="button"
                            aria-label={`Sort by ${String(header.column.columnDef.header)}`}
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            <table.FlexRender header={header} />
                            {direction === "asc" ? (
                              <ArrowUp aria-hidden size={14} />
                            ) : direction === "desc" ? (
                              <ArrowDown aria-hidden size={14} />
                            ) : (
                              <ArrowUpDown aria-hidden size={14} />
                            )}
                          </button>
                        ) : (
                          <table.FlexRender header={header} />
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id}>
                  {row.getAllCells().map((cell) =>
                    cell.column.id === "title" ? (
                      <th scope="row" key={cell.id}>
                        <table.FlexRender cell={cell} />
                      </th>
                    ) : (
                      <td key={cell.id}>
                        <table.FlexRender cell={cell} />
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="events-directory__empty">
            <strong>
              {rows.length ? "No matching events" : "No events yet"}
            </strong>
            <span>
              {rows.length
                ? "Clear a filter or try another search."
                : "Create an event with Duna or enter the details yourself."}
            </span>
            {rows.length ? (
              <button type="button" onClick={reset}>
                Clear filters
              </button>
            ) : (
              <Link
                className="hq-button hq-button--primary"
                href={`/events/create${kinds?.[0] ? `?type=${kinds[0]}` : ""}`}
              >
                Create event
              </Link>
            )}
          </div>
        )}
        <footer className="hq-directory-pagination">
          <label>
            Rows per page
            <select
              aria-label="Events per page"
              value={pageSize}
              onChange={(event) => {
                table.setPageSize(Number(event.target.value));
                table.firstPage();
              }}
            >
              {[25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <span role="status">
            {filtered.length
              ? `${pageIndex * pageSize + 1}–${Math.min((pageIndex + 1) * pageSize, filtered.length)} of ${filtered.length}`
              : "0 events"}
          </span>
          <div>
            <button
              type="button"
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
            >
              Previous
            </button>
            <button
              type="button"
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
            >
              Next
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
