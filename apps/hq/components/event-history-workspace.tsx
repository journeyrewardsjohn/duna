"use client";

import type { OperatorWorkspace } from "@duna/api";
import { formatMoney, formatVenueTime } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import {
  ArrowRight,
  CalendarCheck2,
  CalendarDays,
  Clock3,
  MapPin,
  Search,
  Trophy,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

type EventFilter = "today" | "week" | "month" | "year" | "all";
type ActivityType = "event" | "match" | "court-reservation";

type HistoryItem = {
  readonly id: string;
  readonly type: ActivityType;
  readonly title: string;
  readonly kind: string;
  readonly status: string;
  readonly startsAt: string;
  readonly timezone: string;
  readonly venueName: string;
  readonly courtName?: string;
  readonly participantCount: number;
  readonly capacity: number;
  readonly checkedIn: number;
  readonly cancelledCount: number;
  readonly href: string;
  readonly bookedValue?: {
    readonly amountMinor: number;
    readonly currency: "USD" | "CAD" | "AUD" | "BRL" | "EUR";
  };
};

function dateKeyInTimezone(iso: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function typeLabel(type: ActivityType): string {
  if (type === "match") return "Matches";
  if (type === "court-reservation") return "Court reservations";
  return "Events & sessions";
}

function activityTone(status: string) {
  if (status === "cancelled") return "warning" as const;
  if (status === "completed") return "positive" as const;
  if (status === "live") return "live" as const;
  return "neutral" as const;
}

function isInTimeRange(
  startsAt: string,
  filter: EventFilter,
  now: Date,
): boolean {
  if (filter === "all") return true;
  const start = new Date(startsAt);
  const rangeStart = new Date(now);
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(rangeStart);
  if (filter === "today") rangeEnd.setDate(rangeEnd.getDate() + 1);
  if (filter === "week") rangeEnd.setDate(rangeEnd.getDate() + 7);
  if (filter === "month") {
    rangeStart.setDate(1);
    rangeEnd.setMonth(rangeEnd.getMonth() + 1, 1);
  }
  if (filter === "year") {
    rangeStart.setMonth(0, 1);
    rangeEnd.setFullYear(rangeEnd.getFullYear() + 1, 0, 1);
  }
  return start >= rangeStart && start < rangeEnd;
}

export function EventHistoryWorkspace({
  workspace,
  kinds,
}: {
  readonly workspace: OperatorWorkspace;
  readonly kinds?: readonly string[];
}) {
  const [filter, setFilter] = useState<EventFilter>("month");
  const [query, setQuery] = useState("");
  const now = Date.now();
  const nowDate = new Date(now);
  const includeActivities = !kinds || kinds.some((kind) => kind !== "league");
  const items = useMemo<readonly HistoryItem[]>(() => {
    const sessionItems = workspace.sessions
      .filter((session) => !kinds || kinds.includes(session.kind))
      .map((session): HistoryItem => {
        const registrations = workspace.eventRegistrations.filter(
          (registration) => registration.sessionId === session.id,
        );
        const active = registrations.filter((registration) =>
          ["confirmed", "checked-in"].includes(registration.status),
        );
        return {
          id: session.id,
          type: "event",
          title: session.title,
          kind: session.kind.replaceAll("-", " "),
          status: session.status,
          startsAt: session.startsAt,
          timezone: session.timezone,
          venueName: session.venueName ?? "Location pending",
          courtName: session.courtName,
          participantCount: active.length,
          capacity: session.capacity,
          checkedIn: registrations.filter(
            (registration) => registration.status === "checked-in",
          ).length,
          cancelledCount: registrations.filter((registration) =>
            ["cancelled", "refunded"].includes(registration.status),
          ).length,
          href: `/events/${session.id}`,
          bookedValue: {
            amountMinor: session.priceMinor * active.length,
            currency: session.currency,
          },
        };
      });
    if (!includeActivities) return sessionItems;
    const activityItems = workspace.calendar.entries.flatMap(
      (entry): HistoryItem[] => {
        if (entry.sourceType !== "booking" && entry.sourceType !== "pickup")
          return [];
        const activeStatuses =
          entry.sourceType === "booking"
            ? ["organizer", "accepted", "paid"]
            : ["confirmed", "checked-in"];
        return [
          {
            id: entry.id,
            type:
              entry.sourceType === "booking" ? "court-reservation" : "match",
            title: entry.title,
            kind:
              entry.sourceType === "booking"
                ? "court reservation"
                : "player-hosted match",
            status: entry.status,
            startsAt: entry.startsAt,
            timezone: entry.timezone,
            venueName: entry.venueName ?? "Location pending",
            courtName: entry.courtName,
            participantCount: entry.attendees.filter((attendee) =>
              activeStatuses.includes(attendee.status),
            ).length,
            capacity: entry.capacity,
            checkedIn: entry.attendees.filter(
              (attendee) =>
                attendee.attendanceStatus === "attended" ||
                attendee.status === "checked-in",
            ).length,
            cancelledCount: entry.attendees.filter(
              (attendee) => attendee.attendanceStatus === "cancelled",
            ).length,
            href:
              entry.sourceType === "booking"
                ? `/events/court-bookings/${entry.id}`
                : `/events/matches/${entry.id}`,
          },
        ];
      },
    );
    return [...sessionItems, ...activityItems];
  }, [includeActivities, kinds, workspace]);
  const normalized = query.trim().toLowerCase();
  const filtered = items
    .filter((item) => {
      return isInTimeRange(item.startsAt, filter, nowDate);
    })
    .filter((item) =>
      normalized
        ? [item.title, item.kind, item.venueName, item.courtName, item.status]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(normalized)
        : true,
    );
  const todayKey = dateKeyInTimezone(
    new Date(now).toISOString(),
    workspace.organization.timezone,
  );
  const today = items
    .filter(
      (item) =>
        dateKeyInTimezone(item.startsAt, workspace.organization.timezone) ===
          todayKey && item.status !== "cancelled",
    )
    .toSorted((left, right) => left.startsAt.localeCompare(right.startsAt));
  const upcoming = items.filter(
    (item) => Date.parse(item.startsAt) >= now && item.status !== "cancelled",
  );
  const sectionTypes: readonly ActivityType[] = [
    "event",
    "match",
    "court-reservation",
  ];

  const renderItem = (item: HistoryItem) => {
    const past = Date.parse(item.startsAt) < now && item.status !== "cancelled";
    return (
      <Link href={item.href} key={`${item.type}:${item.id}`}>
        <time>
          <strong>
            {formatVenueTime(item.startsAt, item.timezone, "en-US", {
              month: "short",
              day: "numeric",
            })}
          </strong>
          <small>
            {formatVenueTime(item.startsAt, item.timezone, "en-US", {
              hour: "numeric",
              minute: "2-digit",
            })}
          </small>
        </time>
        <span className="event-history-list__title">
          <span>
            <Badge tone={past ? "neutral" : activityTone(item.status)}>
              {past ? "past" : item.status.replaceAll("-", " ")}
            </Badge>
            <small>{item.kind}</small>
          </span>
          <strong>{item.title}</strong>
          <small>
            {item.venueName}
            {item.courtName ? ` · ${item.courtName}` : ""}
          </small>
        </span>
        <span className="event-history-list__metric">
          <UsersRound aria-hidden size={16} />
          <strong>
            {item.participantCount}/{item.capacity || "open"}
          </strong>
          <small>
            {item.checkedIn} checked in
            {item.cancelledCount ? ` · ${item.cancelledCount} cancelled` : ""}
          </small>
        </span>
        <span className="event-history-list__metric">
          <strong>
            {item.bookedValue
              ? formatMoney(
                  item.bookedValue.amountMinor,
                  item.bookedValue.currency,
                )
              : item.checkedIn
                ? `${item.checkedIn} arrived`
                : "Check-in ready"}
          </strong>
          <small>
            {item.bookedValue
              ? "booked value · open for exact net"
              : "open details"}
          </small>
        </span>
        <ArrowRight aria-hidden size={18} />
      </Link>
    );
  };

  return (
    <section className="hq-card event-history-workspace">
      <header className="event-history-workspace__header">
        <div>
          <span className="hq-eyebrow">
            Every activity · one operations view
          </span>
          <h2>Browse by activity type</h2>
          <p>
            See what is happening today, open any activity, and manage the
            people expected to arrive from one place.
          </p>
        </div>
        <label>
          <Search aria-hidden size={17} />
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find an event, match, court, or player activity…"
            type="search"
            value={query}
          />
        </label>
      </header>

      <section className="event-today" aria-labelledby="event-today-title">
        <header>
          <span>
            <span className="hq-eyebrow">Live operations</span>
            <h3 id="event-today-title">What’s happening today</h3>
          </span>
          <Badge tone={today.length ? "live" : "neutral"}>
            {today.length} {today.length === 1 ? "activity" : "activities"}
          </Badge>
        </header>
        {today.length === 0 ? (
          <div className="hq-empty event-today__empty">
            <CalendarDays aria-hidden size={22} />
            <strong>Nothing is scheduled today.</strong>
            <span>Future events, matches, and reservations are below.</span>
          </div>
        ) : (
          <div className="event-today__grid">
            {today.map((item) => (
              <Link href={item.href} key={`today:${item.type}:${item.id}`}>
                <span>
                  {item.type === "match" ? (
                    <Trophy aria-hidden size={17} />
                  ) : item.type === "court-reservation" ? (
                    <CalendarCheck2 aria-hidden size={17} />
                  ) : (
                    <CalendarDays aria-hidden size={17} />
                  )}
                  {item.kind}
                </span>
                <strong>{item.title}</strong>
                <small>
                  <Clock3 aria-hidden size={14} />
                  {formatVenueTime(item.startsAt, item.timezone, "en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                  <MapPin aria-hidden size={14} /> {item.venueName}
                </small>
                <small>
                  <UsersRound aria-hidden size={14} /> {item.participantCount}/
                  {item.capacity || "open"} expected · {item.checkedIn} here
                </small>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="event-history-workspace__metrics">
        <article>
          <CalendarDays aria-hidden size={18} />
          <span>
            <Numeric>{today.length}</Numeric>
            <small>today</small>
          </span>
        </article>
        <article>
          <Clock3 aria-hidden size={18} />
          <span>
            <Numeric>{upcoming.length}</Numeric>
            <small>upcoming</small>
          </span>
        </article>
        <article>
          <Trophy aria-hidden size={18} />
          <span>
            <Numeric>
              {items.filter((item) => item.type === "match").length}
            </Numeric>
            <small>matches</small>
          </span>
        </article>
        <article>
          <CalendarCheck2 aria-hidden size={18} />
          <span>
            <Numeric>
              {items.filter((item) => item.type === "court-reservation").length}
            </Numeric>
            <small>court reservations</small>
          </span>
        </article>
      </div>
      <div className="event-history-workspace__filters" role="tablist">
        {(
          [
            ["today", "Today"],
            ["week", "This week"],
            ["month", "This month"],
            ["year", "This year"],
            ["all", "All time"],
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
        {!normalized
          ? sectionTypes.map((type) => {
              const section = filtered
                .filter((item) => item.type === type)
                .toSorted((left, right) =>
                  right.startsAt.localeCompare(left.startsAt),
                );
              if (section.length === 0) return null;
              return (
                <section className="event-history-section" key={type}>
                  <header>
                    <strong>{typeLabel(type)}</strong>
                    <small>{section.length}</small>
                  </header>
                  {section.map(renderItem)}
                </section>
              );
            })
          : filtered
              .toSorted((left, right) =>
                right.startsAt.localeCompare(left.startsAt),
              )
              .map(renderItem)}
        {filtered.length === 0 && (
          <div className="hq-empty">
            <Search aria-hidden size={22} />
            <strong>No activity matches this view.</strong>
            <span>Try another filter or search phrase.</span>
          </div>
        )}
      </div>
    </section>
  );
}
