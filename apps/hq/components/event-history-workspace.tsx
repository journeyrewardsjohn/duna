"use client";

import type { OperatorWorkspace } from "@duna/api";
import { formatMoney, formatVenueTime } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import {
  ArrowRight,
  CalendarCheck2,
  CalendarX2,
  Clock3,
  Search,
  TicketCheck,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

type EventFilter = "all" | "upcoming" | "history" | "cancelled";

export function EventHistoryWorkspace({
  workspace,
  kinds,
}: {
  readonly workspace: OperatorWorkspace;
  readonly kinds?: readonly string[];
}) {
  const [filter, setFilter] = useState<EventFilter>("all");
  const [query, setQuery] = useState("");
  const now = Date.now();
  const source = workspace.sessions.filter(
    (session) => !kinds || kinds.includes(session.kind),
  );
  const sessions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return source
      .filter((session) => {
        const startsAt = Date.parse(session.startsAt);
        if (filter === "upcoming")
          return startsAt >= now && session.status !== "cancelled";
        if (filter === "history") return startsAt < now;
        if (filter === "cancelled") return session.status === "cancelled";
        return true;
      })
      .filter((session) =>
        normalized
          ? [session.title, session.kind, session.venueName, session.courtName]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(normalized)
          : true,
      )
      .toSorted((left, right) => right.startsAt.localeCompare(left.startsAt));
  }, [filter, now, query, source]);
  const historical = source.filter(
    (session) => Date.parse(session.startsAt) < now,
  );
  const upcoming = source.filter(
    (session) =>
      Date.parse(session.startsAt) >= now && session.status !== "cancelled",
  );
  const cancellations = source.filter(
    (session) => session.status === "cancelled",
  );

  return (
    <section className="hq-card event-history-workspace">
      <header className="event-history-workspace__header">
        <div>
          <span className="hq-eyebrow">
            Run the session · remember the history
          </span>
          <h2>Event operations</h2>
          <p>
            Open any session for attendance, exact earnings, refunds, coach
            notes, videos, cancellation history, and captured weather.
          </p>
        </div>
        <label>
          <Search aria-hidden size={17} />
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a session…"
            type="search"
            value={query}
          />
        </label>
      </header>
      <div className="event-history-workspace__metrics">
        <article>
          <CalendarCheck2 aria-hidden size={18} />
          <span>
            <Numeric>{upcoming.length}</Numeric>
            <small>upcoming</small>
          </span>
        </article>
        <article>
          <Clock3 aria-hidden size={18} />
          <span>
            <Numeric>{historical.length}</Numeric>
            <small>in history</small>
          </span>
        </article>
        <article>
          <TicketCheck aria-hidden size={18} />
          <span>
            <Numeric>
              {
                workspace.eventRegistrations.filter((registration) =>
                  source.some(
                    (session) => session.id === registration.sessionId,
                  ),
                ).length
              }
            </Numeric>
            <small>registrations</small>
          </span>
        </article>
        <article>
          <CalendarX2 aria-hidden size={18} />
          <span>
            <Numeric>{cancellations.length}</Numeric>
            <small>cancelled</small>
          </span>
        </article>
      </div>
      <div className="event-history-workspace__filters" role="tablist">
        {(
          [
            ["all", "All sessions"],
            ["upcoming", "Upcoming"],
            ["history", "History"],
            ["cancelled", "Cancelled"],
          ] as const
        ).map(([id, label]) => (
          <button
            aria-selected={filter === id}
            className={filter === id ? "active" : undefined}
            key={id}
            onClick={() => setFilter(id)}
            role="tab"
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      <div className="event-history-list">
        {sessions.map((session) => {
          const registrations = workspace.eventRegistrations.filter(
            (registration) => registration.sessionId === session.id,
          );
          const active = registrations.filter((registration) =>
            ["confirmed", "checked-in"].includes(registration.status),
          );
          const cancelledCount = registrations.filter((registration) =>
            ["cancelled", "refunded"].includes(registration.status),
          ).length;
          const checkedIn = registrations.filter(
            (registration) => registration.status === "checked-in",
          ).length;
          return (
            <Link href={`/events/${session.id}`} key={session.id}>
              <time>
                <strong>
                  {formatVenueTime(
                    session.startsAt,
                    session.timezone,
                    "en-US",
                    {
                      month: "short",
                      day: "numeric",
                    },
                  )}
                </strong>
                <small>
                  {formatVenueTime(
                    session.startsAt,
                    session.timezone,
                    "en-US",
                    {
                      hour: "numeric",
                      minute: "2-digit",
                    },
                  )}
                </small>
              </time>
              <span className="event-history-list__title">
                <span>
                  <Badge
                    tone={
                      session.status === "cancelled"
                        ? "warning"
                        : session.status === "completed"
                          ? "positive"
                          : session.status === "live"
                            ? "live"
                            : "neutral"
                    }
                  >
                    {session.status.replaceAll("-", " ")}
                  </Badge>
                  <small>{session.kind.replaceAll("-", " ")}</small>
                </span>
                <strong>{session.title}</strong>
                <small>
                  {session.venueName ?? "Location pending"}
                  {session.courtName ? ` · ${session.courtName}` : ""}
                </small>
              </span>
              <span className="event-history-list__metric">
                <UsersRound aria-hidden size={16} />
                <strong>
                  {active.length}/{session.capacity}
                </strong>
                <small>
                  {checkedIn} checked in · {cancelledCount} cancelled
                </small>
              </span>
              <span className="event-history-list__metric">
                <strong>
                  {formatMoney(
                    session.priceMinor * active.length,
                    session.currency,
                  )}
                </strong>
                <small>booked value · open for exact net</small>
              </span>
              <ArrowRight aria-hidden size={18} />
            </Link>
          );
        })}
        {sessions.length === 0 && (
          <div className="hq-empty">
            <Search aria-hidden size={22} />
            <strong>No sessions match this view.</strong>
            <span>Try another filter or search phrase.</span>
          </div>
        )}
      </div>
    </section>
  );
}
