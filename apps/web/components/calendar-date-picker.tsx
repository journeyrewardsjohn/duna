"use client";

import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

export type CalendarMarker = {
  readonly date: string;
  readonly id: string;
  readonly label: string;
  readonly tone: "booking" | "event";
};

export function addIsoDays(value: string, amount: number): string {
  const date = parseIsoDate(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, 12));
}

function startOfMonth(value: string): string {
  const date = parseIsoDate(value);
  date.setUTCDate(1);
  return date.toISOString().slice(0, 10);
}

function addIsoMonths(value: string, amount: number): string {
  const date = parseIsoDate(startOfMonth(value));
  date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 10);
}

function endOfMonth(value: string): string {
  return addIsoDays(addIsoMonths(value, 1), -1);
}

function monthDates(value: string): readonly string[] {
  const start = parseIsoDate(startOfMonth(value));
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth();
  const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Array.from({ length: count }, (_, index) =>
    addIsoDays(start.toISOString().slice(0, 10), index),
  );
}

function dateParts(value: string) {
  const date = parseIsoDate(value);
  const weekday = date.getUTCDay();
  return {
    day: ["Sun", "Mon", "Tues", "Wed", "Thu", "Fri", "Sat"][weekday],
    date: String(date.getUTCDate()),
    month: new Intl.DateTimeFormat("en-US", {
      month: "short",
      timeZone: "UTC",
    }).format(date),
  };
}

function fullDateLabel(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(parseIsoDate(value));
}

function monthLabel(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parseIsoDate(value));
}

function datesBetween(start: string, end: string): readonly string[] {
  const days = Math.max(
    0,
    Math.round(
      (parseIsoDate(end).getTime() - parseIsoDate(start).getTime()) /
        86_400_000,
    ),
  );
  return Array.from({ length: days + 1 }, (_, index) =>
    addIsoDays(start, index),
  );
}

function CalendarMonth({
  markersByDate,
  maxDate,
  minDate,
  month,
  onSelect,
  selectedDate,
  today,
}: {
  readonly markersByDate: ReadonlyMap<string, readonly CalendarMarker[]>;
  readonly maxDate: string;
  readonly minDate: string;
  readonly month: string;
  readonly onSelect: (date: string) => void;
  readonly selectedDate: string;
  readonly today: string;
}) {
  const days = monthDates(month);
  const leadingDays = parseIsoDate(days[0] ?? month).getUTCDay();

  return (
    <section className="calendar-month" aria-label={monthLabel(month)}>
      <h3>{monthLabel(month)}</h3>
      <div className="calendar-month__weekdays" aria-hidden>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>
      <div className="calendar-month__grid">
        {Array.from({ length: leadingDays }, (_, index) => (
          <span aria-hidden className="calendar-month__blank" key={index} />
        ))}
        {days.map((date) => {
          const markers = markersByDate.get(date) ?? [];
          const disabled = date < minDate || date > maxDate;
          return (
            <button
              aria-current={date === selectedDate ? "date" : undefined}
              aria-label={`${fullDateLabel(date)}${markers.length ? `, ${markers.length} scheduled` : ""}`}
              className={date === today ? "is-today" : undefined}
              disabled={disabled}
              key={date}
              onClick={() => onSelect(date)}
              type="button"
            >
              <span className="calendar-month__day-number">
                {parseIsoDate(date).getUTCDate()}
              </span>
              <span className="calendar-month__markers" aria-hidden>
                {markers.slice(0, 2).map((marker) => (
                  <span data-tone={marker.tone} key={marker.id}>
                    <i />
                    <b>{marker.label}</b>
                  </span>
                ))}
                {markers.length > 2 ? (
                  <small>+{markers.length - 2}</small>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function CalendarDatePicker({
  calendarTitle = "Choose a date",
  className,
  markers = [],
  maxDate,
  minDate,
  onChange,
  value,
}: {
  readonly calendarTitle?: string;
  readonly className?: string;
  readonly markers?: readonly CalendarMarker[];
  readonly maxDate?: string;
  readonly minDate?: string;
  readonly onChange: (value: string) => void;
  readonly value: string;
}) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const earliestDate = minDate ?? addIsoDays(today, -30);
  const [loadedThrough, setLoadedThrough] = useState(() => {
    const initialEnd =
      value > addIsoDays(today, 90) ? value : addIsoDays(today, 90);
    return maxDate && initialEnd > maxDate ? maxDate : initialEnd;
  });
  const latestDate =
    maxDate && loadedThrough > maxDate ? maxDate : loadedThrough;
  const railStart =
    value < earliestDate ? addIsoDays(value, -14) : earliestDate;
  const railEnd = value > latestDate ? addIsoDays(value, 45) : latestDate;
  const dates = useMemo(
    () => datesBetween(railStart, railEnd),
    [railEnd, railStart],
  );
  const markersByDate = useMemo(() => {
    const next = new Map<string, CalendarMarker[]>();
    for (const marker of markers) {
      next.set(marker.date, [...(next.get(marker.date) ?? []), marker]);
    }
    return next;
  }, [markers]);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(value));
  const railRef = useRef<HTMLDivElement>(null);
  const dateRefs = useRef(new Map<string, HTMLButtonElement>());
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const positionedRef = useRef(false);
  const titleId = useId();

  useEffect(() => {
    if (positionedRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      const rail = railRef.current;
      const selected = dateRefs.current.get(value);
      if (!rail || !selected) return;
      const railBounds = rail.getBoundingClientRect();
      const selectedBounds = selected.getBoundingClientRect();
      const selectedLeft =
        selectedBounds.left - railBounds.left + rail.scrollLeft;
      const left = selectedLeft - (rail.clientWidth - selected.clientWidth) / 2;
      rail.scrollTo({
        behavior: "instant" as ScrollBehavior,
        left: Math.max(0, left),
      });
      positionedRef.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [value]);

  useEffect(() => {
    if (value <= loadedThrough || (maxDate && loadedThrough >= maxDate)) return;
    setLoadedThrough(maxDate && value > maxDate ? maxDate : value);
  }, [loadedThrough, maxDate, value]);

  useEffect(() => {
    if (!calendarOpen) return;
    const previousOverflow = document.body.style.overflow;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCalendarOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.requestAnimationFrame(() => closeRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [calendarOpen]);

  const openCalendar = () => {
    setVisibleMonth(startOfMonth(value));
    setCalendarOpen(true);
  };

  const chooseDate = (date: string) => {
    onChange(date);
    setCalendarOpen(false);
  };

  const extendRange = (requiredEnd?: string) => {
    setLoadedThrough((current) => {
      if (maxDate && current >= maxDate) return current;
      if (requiredEnd && requiredEnd <= current) return current;
      let next = addIsoDays(current, 90);
      while (requiredEnd && next < requiredEnd) next = addIsoDays(next, 90);
      if (maxDate && next > maxDate) return maxDate;
      return next;
    });
  };

  const maybeExtendRail = (rail: HTMLDivElement) => {
    if (
      rail.scrollLeft + rail.clientWidth >=
      rail.scrollWidth - rail.clientWidth
    ) {
      extendRange();
    }
  };

  const moveRail = (direction: -1 | 1) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({
      behavior: "smooth",
      left: direction * Math.max(240, rail.clientWidth * 0.72),
    });
    if (direction === 1) maybeExtendRail(rail);
  };

  return (
    <div className={`calendar-picker${className ? ` ${className}` : ""}`}>
      <div className="calendar-picker__rail-shell">
        <button
          aria-label="Show earlier dates"
          className="calendar-picker__arrow"
          onClick={() => moveRail(-1)}
          type="button"
        >
          <ChevronLeft aria-hidden size={19} />
        </button>
        <div
          aria-label="Choose a day"
          className="calendar-picker__rail"
          onScroll={(event) => maybeExtendRail(event.currentTarget)}
          ref={railRef}
          role="group"
        >
          {dates.map((date) => {
            const parts = dateParts(date);
            const dateMarkers = markersByDate.get(date) ?? [];
            return (
              <button
                aria-current={date === value ? "date" : undefined}
                aria-label={`${fullDateLabel(date)}${dateMarkers.length ? `, ${dateMarkers.length} scheduled` : ""}`}
                className="calendar-picker__pill"
                key={date}
                onClick={() => onChange(date)}
                ref={(node) => {
                  if (node) dateRefs.current.set(date, node);
                  else dateRefs.current.delete(date);
                }}
                type="button"
              >
                <span>{parts.day}</span>
                <strong>{parts.date}</strong>
                <small>{parts.month}</small>
                <i className="calendar-picker__dots" aria-hidden>
                  {dateMarkers.slice(0, 3).map((marker) => (
                    <i data-tone={marker.tone} key={marker.id} />
                  ))}
                </i>
              </button>
            );
          })}
        </div>
        <button
          aria-label="Show later dates"
          className="calendar-picker__arrow"
          onClick={() => moveRail(1)}
          type="button"
        >
          <ChevronRight aria-hidden size={19} />
        </button>
        <button
          className="calendar-picker__open"
          onClick={openCalendar}
          type="button"
        >
          <CalendarDays aria-hidden size={18} />
          <span>Full calendar</span>
        </button>
      </div>

      {calendarOpen ? (
        <div
          className="calendar-dialog__backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setCalendarOpen(false);
          }}
        >
          <section
            aria-labelledby={titleId}
            aria-modal="true"
            className="calendar-dialog"
            role="dialog"
          >
            <header className="calendar-dialog__header">
              <div>
                <span className="page-eyebrow">Two-month view</span>
                <h2 id={titleId}>{calendarTitle}</h2>
                <p>See your plans at a glance, then choose any open day.</p>
              </div>
              <button
                aria-label="Close full calendar"
                onClick={() => setCalendarOpen(false)}
                ref={closeRef}
                type="button"
              >
                <X aria-hidden size={20} />
              </button>
            </header>
            <div className="calendar-dialog__toolbar">
              <button
                aria-label="Previous month"
                disabled={visibleMonth <= startOfMonth(earliestDate)}
                onClick={() =>
                  setVisibleMonth((current) => addIsoMonths(current, -1))
                }
                type="button"
              >
                <ChevronLeft aria-hidden size={18} />
              </button>
              <strong>
                {monthLabel(visibleMonth)} —{" "}
                {monthLabel(addIsoMonths(visibleMonth, 1))}
              </strong>
              <button
                aria-label="Next month"
                disabled={Boolean(
                  maxDate &&
                  addIsoMonths(visibleMonth, 1) >= startOfMonth(maxDate),
                )}
                onClick={() => {
                  const nextMonth = addIsoMonths(visibleMonth, 1);
                  extendRange(endOfMonth(addIsoMonths(nextMonth, 1)));
                  setVisibleMonth(nextMonth);
                }}
                type="button"
              >
                <ChevronRight aria-hidden size={18} />
              </button>
            </div>
            <div className="calendar-dialog__months">
              {[visibleMonth, addIsoMonths(visibleMonth, 1)].map((month) => (
                <CalendarMonth
                  key={month}
                  markersByDate={markersByDate}
                  maxDate={latestDate}
                  minDate={earliestDate}
                  month={month}
                  onSelect={chooseDate}
                  selectedDate={value}
                  today={today}
                />
              ))}
            </div>
            {markers.length ? (
              <footer className="calendar-dialog__legend">
                <span>
                  <i data-tone="booking" /> Your plans
                </span>
                <span>
                  <i data-tone="event" /> Events to explore
                </span>
              </footer>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}
