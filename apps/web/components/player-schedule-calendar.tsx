"use client";

import type { BookingSummary, EventSummary } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import { ArrowRight, CalendarDays, MapPin, Sparkles } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  addIsoDays,
  CalendarDatePicker,
  type CalendarMarker,
} from "./calendar-date-picker";

function instantIsoDay(instant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(new Date(instant));
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${value.year}-${value.month}-${value.day}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function formatTime(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(instant));
}

function relativeDateLabel(value: string, today: string): string {
  if (value === today) return "Today";
  if (value === addIsoDays(today, 1)) return "Tomorrow";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

export function PlayerScheduleCalendar({
  bookings,
  events,
  initialDate,
}: {
  readonly bookings: readonly BookingSummary[];
  readonly events: readonly EventSummary[];
  readonly initialDate: string;
}) {
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const activeEvents = useMemo(
    () => events.filter((event) => event.lifecycleStatus !== "cancelled"),
    [events],
  );
  const markers = useMemo<readonly CalendarMarker[]>(
    () => [
      ...bookings.map((booking) => ({
        date: instantIsoDay(booking.startsAt, "America/Los_Angeles"),
        id: `booking-${booking.id}`,
        label: booking.title,
        tone: "booking" as const,
      })),
      ...activeEvents
        .filter(
          (event) =>
            !bookings.some(
              (booking) =>
                booking.title === event.title &&
                booking.startsAt === event.startsAt,
            ),
        )
        .map((event) => ({
          date: instantIsoDay(event.startsAt, event.timezone),
          id: `event-${event.id}`,
          label: event.title,
          tone: "event" as const,
        })),
    ],
    [activeEvents, bookings],
  );
  const selectedBookings = bookings.filter(
    (booking) =>
      instantIsoDay(booking.startsAt, "America/Los_Angeles") === selectedDate,
  );
  const selectedEvents = activeEvents.filter(
    (event) =>
      instantIsoDay(event.startsAt, event.timezone) === selectedDate &&
      !selectedBookings.some(
        (booking) =>
          booking.title === event.title && booking.startsAt === event.startsAt,
      ),
  );
  const planCount = selectedBookings.length + selectedEvents.length;

  return (
    <>
      <div className="play-agenda__heading">
        <div>
          <span className="page-eyebrow">Your calendar</span>
          <h2>When do you want to play?</h2>
        </div>
        <span className="play-agenda__count">
          <CalendarDays aria-hidden size={17} />
          {bookings.length} scheduled
        </span>
      </div>

      <CalendarDatePicker
        calendarTitle="When do you want to play?"
        className="play-calendar-picker"
        markers={markers}
        minDate={addIsoDays(today, -30)}
        onChange={setSelectedDate}
        value={selectedDate}
      />

      <div className="play-day">
        <div className="play-day__header">
          <div>
            <strong>{relativeDateLabel(selectedDate, today)}</strong>
            <span>{formatDate(selectedDate)}</span>
          </div>
          <span className="play-day__plan-count">
            {planCount
              ? `${planCount} ${planCount === 1 ? "plan" : "plans"}`
              : "Open day"}
          </span>
        </div>

        {planCount ? (
          <div className="play-day__agenda">
            {selectedBookings.map((booking) => (
              <article className="play-day__booking" key={booking.id}>
                <span className="play-day__time">
                  <Numeric tier="table">
                    {formatTime(booking.startsAt, "America/Los_Angeles")}
                  </Numeric>
                  <small>
                    {formatTime(booking.endsAt, "America/Los_Angeles")}
                  </small>
                </span>
                <span className="play-day__booking-copy">
                  <Badge tone="positive">{booking.status}</Badge>
                  <strong>{booking.title}</strong>
                  <small>
                    <MapPin aria-hidden size={13} /> {booking.venueName}
                  </small>
                </span>
                <CalendarDays aria-hidden size={19} />
              </article>
            ))}
            {selectedEvents.map((event) => (
              <Link
                className="play-day__booking play-day__booking--event"
                href={`/events/${event.slug}`}
                key={event.id}
              >
                <span className="play-day__time">
                  <Numeric tier="table">
                    {formatTime(event.startsAt, event.timezone)}
                  </Numeric>
                  <small>{formatTime(event.endsAt, event.timezone)}</small>
                </span>
                <span className="play-day__booking-copy">
                  <Badge tone={event.live ? "live" : "neutral"}>
                    {event.kind.replace("-", " ")}
                  </Badge>
                  <strong>{event.title}</strong>
                  <small>
                    <MapPin aria-hidden size={13} /> {event.venueName}
                  </small>
                </span>
                <ArrowRight aria-hidden size={19} />
              </Link>
            ))}
          </div>
        ) : (
          <div className="play-day__empty">
            <span>
              <Sparkles aria-hidden size={22} />
            </span>
            <div>
              <strong>Your day is open.</strong>
              <p>Reserve a court or host a match for nearby players.</p>
            </div>
            <Link href="/app/discover">See what’s available</Link>
          </div>
        )}
      </div>
    </>
  );
}
