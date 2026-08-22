"use client";

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
import { Badge } from "@duna/ui";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

export interface TransactionTableItem {
  readonly id: string;
  readonly occurredAt: string;
  readonly status: string;
  readonly buyerName: string;
  readonly description: string;
  readonly source: string;
  readonly currency: string;
  readonly grossMinor: number;
  readonly netMinor?: number;
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
const helper = createColumnHelper<typeof features, TransactionTableItem>();

function money(value: number | undefined, currency: string) {
  if (value === undefined) return "Not available";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(value / 100);
}

function tone(status: string) {
  return /failed|declined|overdue|disputed|cancelled/i.test(status)
    ? "danger"
    : /pending|processing|scheduled/i.test(status)
      ? "warning"
      : /paid|succeeded|complete|available|recovered/i.test(status)
        ? "positive"
        : "neutral";
}

function label(value: string) {
  return value
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const columns = helper.columns([
  helper.accessor("buyerName", {
    header: "Customer",
    cell: ({ row }) => (
      <Link
        className="transaction-customer"
        href={`/payments/transactions/${encodeURIComponent(row.original.id)}`}
      >
        <strong>{row.original.buyerName}</strong>
        <small>{row.original.description}</small>
      </Link>
    ),
  }),
  helper.accessor("status", {
    header: "Status",
    cell: ({ getValue }) => (
      <Badge tone={tone(getValue())}>{label(getValue())}</Badge>
    ),
  }),
  helper.accessor("source", {
    header: "Source",
    cell: ({ getValue }) => (
      <span className="transaction-source">{label(getValue())}</span>
    ),
  }),
  helper.accessor("occurredAt", {
    header: "Date",
    cell: ({ getValue }) => (
      <time dateTime={getValue()}>
        {new Date(getValue()).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
        <small>
          {new Date(getValue()).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          })}
        </small>
      </time>
    ),
  }),
  helper.accessor("grossMinor", {
    header: "Gross",
    cell: ({ row, getValue }) => money(getValue(), row.original.currency),
  }),
  helper.accessor("netMinor", {
    header: "Net",
    cell: ({ row, getValue }) => money(getValue(), row.original.currency),
  }),
  helper.display({
    id: "open",
    header: "",
    cell: ({ row }) => (
      <Link
        aria-label={`Open ${row.original.description} transaction`}
        className="transaction-open"
        href={`/payments/transactions/${encodeURIComponent(row.original.id)}`}
      >
        <ArrowRight size={17} />
      </Link>
    ),
    enableSorting: false,
  }),
]);

function SortIcon({
  direction,
}: {
  readonly direction: false | "asc" | "desc";
}) {
  if (direction === "asc") return <ArrowUp aria-hidden size={14} />;
  if (direction === "desc") return <ArrowDown aria-hidden size={14} />;
  return <ArrowUpDown aria-hidden size={14} />;
}

export function TransactionTable({
  transactions,
}: {
  readonly transactions: readonly TransactionTableItem[];
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [period, setPeriod] = useState("all");
  const statuses = useMemo(
    () => [...new Set(transactions.map((item) => item.status))].sort(),
    [transactions],
  );
  const sources = useMemo(
    () => [...new Set(transactions.map((item) => item.source))].sort(),
    [transactions],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const days = period === "all" ? undefined : Number(period);
    const after = days ? Date.now() - days * 86_400_000 : undefined;
    return transactions.filter((item) => {
      const matchesQuery =
        !needle ||
        [item.buyerName, item.description, item.status, item.source, item.id]
          .join(" ")
          .toLocaleLowerCase()
          .includes(needle);
      return (
        matchesQuery &&
        (status === "all" || item.status === status) &&
        (source === "all" || item.source === source) &&
        (!after || new Date(item.occurredAt).getTime() >= after)
      );
    });
  }, [period, query, source, status, transactions]);
  const table = useTable({
    features,
    columns,
    data: filtered,
    initialState: {
      sorting: [{ id: "occurredAt", desc: true }],
      pagination: { pageIndex: 0, pageSize: 25 },
    },
  });
  const hasFilters =
    query || status !== "all" || source !== "all" || period !== "all";
  const reset = () => {
    setQuery("");
    setStatus("all");
    setSource("all");
    setPeriod("all");
    table.firstPage();
  };

  return (
    <section
      className="transaction-explorer"
      aria-labelledby="transaction-explorer-title"
    >
      <header className="transaction-explorer__header">
        <div>
          <span className="hq-eyebrow">Payment activity</span>
          <h2 id="transaction-explorer-title">All transactions</h2>
          <p>
            Search people or purchases, combine filters, and sort any useful
            column.
          </p>
        </div>
        <span className="transaction-count">
          <strong>{filtered.length}</strong>
          <small>
            {filtered.length === transactions.length
              ? "total"
              : `of ${transactions.length}`}
          </small>
        </span>
      </header>

      <div className="transaction-toolbar">
        <label className="transaction-search">
          <Search aria-hidden size={18} />
          <span className="sr-only">Search transactions</span>
          <input
            onChange={(event) => {
              setQuery(event.target.value);
              table.firstPage();
            }}
            placeholder="Search customer, purchase, status, or ID"
            type="search"
            value={query}
          />
        </label>
        <div className="transaction-filters" aria-label="Transaction filters">
          <Filter aria-hidden size={17} />
          <label>
            <span className="sr-only">Status</span>
            <select
              onChange={(event) => {
                setStatus(event.target.value);
                table.firstPage();
              }}
              value={status}
            >
              <option value="all">All statuses</option>
              {statuses.map((value) => (
                <option key={value} value={value}>
                  {label(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Source</span>
            <select
              onChange={(event) => {
                setSource(event.target.value);
                table.firstPage();
              }}
              value={source}
            >
              <option value="all">All sources</option>
              {sources.map((value) => (
                <option key={value} value={value}>
                  {label(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Date range</span>
            <select
              onChange={(event) => {
                setPeriod(event.target.value);
                table.firstPage();
              }}
              value={period}
            >
              <option value="all">Any date</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>
          </label>
          {hasFilters && (
            <button className="transaction-clear" onClick={reset} type="button">
              <X aria-hidden size={15} /> Clear
            </button>
          )}
        </div>
      </div>

      <div className="transaction-table-frame">
        <table className="transaction-table">
          <caption className="sr-only">
            Sortable, filterable organization transactions
          </caption>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const sortable = header.column.getCanSort();
                  const direction = header.column.getIsSorted();
                  return (
                    <th key={header.id} scope="col">
                      {header.isPlaceholder ? null : sortable ? (
                        <button
                          aria-label={`Sort by ${String(header.column.columnDef.header)}`}
                          onClick={header.column.getToggleSortingHandler()}
                          type="button"
                        >
                          <table.FlexRender header={header} />
                          <SortIcon direction={direction} />
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
                {row.getAllCells().map((cell) => (
                  <td key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="transaction-empty">
            <Search aria-hidden size={22} />
            <strong>No transactions match</strong>
            <span>Try a broader search or clear a filter.</span>
            <button onClick={reset} type="button">
              Clear filters
            </button>
          </div>
        )}
      </div>

      {filtered.length > 0 && (
        <footer className="transaction-pagination">
          <span>
            Showing {table.getRowModel().rows.length} on page{" "}
            {table.state.pagination.pageIndex + 1} of{" "}
            {Math.max(table.getPageCount(), 1)}
          </span>
          <div>
            <label>
              <span>Rows</span>
              <select
                onChange={(event) =>
                  table.setPageSize(Number(event.target.value))
                }
                value={table.state.pagination.pageSize}
              >
                {[10, 25, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <button
              aria-label="Previous page"
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
              type="button"
            >
              <ChevronLeft size={17} />
            </button>
            <button
              aria-label="Next page"
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
              type="button"
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </footer>
      )}
    </section>
  );
}
