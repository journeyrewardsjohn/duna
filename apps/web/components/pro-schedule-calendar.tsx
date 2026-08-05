"use client";

import { CalendarDays, Layers3 } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  CalendarDatePicker,
  type CalendarMarker,
} from "./calendar-date-picker";

export function ProScheduleCalendar({
  markers,
  selectedDate,
  selectedTour,
  trackedEventCount,
}: {
  readonly markers: readonly CalendarMarker[];
  readonly selectedDate?: string;
  readonly selectedTour: "all" | "elite" | "challenger" | "futures" | "avp";
  readonly trackedEventCount: number;
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const href = (date?: string) => {
    const params = new URLSearchParams();
    if (selectedTour !== "all") params.set("tour", selectedTour);
    if (date) params.set("date", date);
    const query = params.toString();
    return query ? `/pro?${query}` : "/pro";
  };
  return (
    <section className="pro-schedule-calendar">
      <header>
        <div>
          <span className="page-eyebrow">Scores and schedule</span>
          <h2>Choose a day on tour.</h2>
        </div>
        <span>
          <CalendarDays aria-hidden size={17} /> {trackedEventCount} events
        </span>
      </header>
      <div className="pro-schedule-calendar__controls">
        <button
          aria-current={!selectedDate ? "page" : undefined}
          className="pro-schedule-calendar__all"
          onClick={() => router.push(href())}
          type="button"
        >
          <Layers3 aria-hidden size={16} />
          <span>All</span>
          <strong>Dates</strong>
        </button>
        <CalendarDatePicker
          calendarTitle="Find a day on tour"
          className="pro-schedule-calendar__picker"
          markers={markers}
          onChange={(nextDate) => router.push(href(nextDate))}
          selectionActive={Boolean(selectedDate)}
          value={selectedDate ?? today}
        />
      </div>
      <footer>
        <span>
          <i data-tone="booking" /> Matches
        </span>
        <span>
          <i data-tone="event" /> Events
        </span>
        <small>More dots mean more play on that date.</small>
      </footer>
    </section>
  );
}
