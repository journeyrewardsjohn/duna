"use client";

import { CalendarDays, Layers3 } from "lucide-react";
import {
  CalendarDatePicker,
  type CalendarMarker,
} from "./calendar-date-picker";

export function ProScheduleCalendar({
  markers,
  onDateChange,
  onReset,
  selectedDate,
  trackedEventCount,
}: {
  readonly markers: readonly CalendarMarker[];
  readonly onDateChange: (date: string) => void;
  readonly onReset: () => void;
  readonly selectedDate?: string;
  readonly trackedEventCount: number;
}) {
  const today = new Date().toISOString().slice(0, 10);
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
          onClick={onReset}
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
          onChange={onDateChange}
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
