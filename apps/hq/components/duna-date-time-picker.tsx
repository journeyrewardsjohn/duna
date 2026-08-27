"use client";

import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateLabel(value: string): string {
  if (!value) return "Select date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function timeLabel(value: string): string {
  if (!value) return "Select time";
  const [hours, minutes] = value.split(":").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(2026, 0, 1, hours, minutes));
}

const timeOptions = [
  ...Array.from({ length: 48 }, (_, index) => {
    const hours = Math.floor(index / 2);
    const minutes = (index % 2) * 30;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }),
  "23:59",
];

export interface DateTimeValue {
  readonly date: string;
  readonly time: string;
}

/**
 * A composed date-and-time field for schedule exceptions. It deliberately
 * keeps date and time in one popover, matching the actual decision someone is
 * making instead of splitting it across two browser-style pickers.
 */
export function DunaDateTimePicker({
  label,
  minDate,
  minTime,
  dateOnly = false,
  onChange,
  value,
}: {
  readonly label: string;
  readonly minDate?: string;
  readonly minTime?: string;
  readonly dateOnly?: boolean;
  readonly onChange: (value: DateTimeValue) => void;
  readonly value: DateTimeValue;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [month, setMonth] = useState(() => {
    const parsed = value.date ? new Date(`${value.date}T12:00:00`) : new Date();
    return new Date(parsed.getFullYear(), parsed.getMonth(), 1);
  });
  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    return [
      ...Array.from(
        { length: first.getDay() },
        () => undefined as Date | undefined,
      ),
      ...Array.from(
        { length: last.getDate() },
        (_, index) =>
          new Date(month.getFullYear(), month.getMonth(), index + 1),
      ),
    ];
  }, [month]);

  useEffect(() => {
    if (!open) return;
    function close(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function chooseDate(date: string) {
    onChange({ ...value, date });
    if (dateOnly) setOpen(false);
  }

  function chooseTime(time: string) {
    onChange({ ...value, time });
    setOpen(false);
  }

  return (
    <div
      className={`duna-date-time-picker${dateOnly ? " duna-date-time-picker--date-only" : ""}`}
      ref={rootRef}
    >
      <span className="duna-date-time-picker__label">{label}</span>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={label}
        className="duna-date-time-picker__trigger"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span>
          <CalendarDays aria-hidden size={17} />
          {dateLabel(value.date)}
        </span>
        {!dateOnly && <i aria-hidden />}
        {!dateOnly && (
          <span>
            <Clock3 aria-hidden size={17} />
            {timeLabel(value.time)}
          </span>
        )}
      </button>
      {open && (
        <div
          aria-label={`${label} ${dateOnly ? "date" : "date and time"}`}
          className="duna-date-time-picker__popover"
          role="dialog"
        >
          <section className="duna-date-time-picker__calendar">
            <header>
              <button
                aria-label="Previous month"
                onClick={() =>
                  setMonth(
                    (current) =>
                      new Date(
                        current.getFullYear(),
                        current.getMonth() - 1,
                        1,
                      ),
                  )
                }
                type="button"
              >
                <ChevronLeft aria-hidden size={18} />
              </button>
              <strong>
                {new Intl.DateTimeFormat("en-US", {
                  month: "long",
                  year: "numeric",
                }).format(month)}
              </strong>
              <button
                aria-label="Next month"
                onClick={() =>
                  setMonth(
                    (current) =>
                      new Date(
                        current.getFullYear(),
                        current.getMonth() + 1,
                        1,
                      ),
                  )
                }
                type="button"
              >
                <ChevronRight aria-hidden size={18} />
              </button>
            </header>
            <div className="duna-date-time-picker__weekdays">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="duna-date-time-picker__days">
              {days.map((date, index) => {
                if (!date) return <span key={`blank-${index}`} />;
                const nextDate = dateKey(date);
                const disabled = Boolean(minDate && nextDate < minDate);
                return (
                  <button
                    aria-pressed={nextDate === value.date}
                    disabled={disabled}
                    key={nextDate}
                    onClick={() => chooseDate(nextDate)}
                    type="button"
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>
            <footer>
              <button
                onClick={() => {
                  onChange({ ...value, date: "" });
                  setOpen(false);
                }}
                type="button"
              >
                Clear
              </button>
              <button
                onClick={() => {
                  const today = dateKey(new Date());
                  const nextDate = minDate && today < minDate ? minDate : today;
                  chooseDate(nextDate);
                  setMonth(new Date(`${nextDate}T12:00:00`));
                }}
                type="button"
              >
                Today
              </button>
            </footer>
          </section>
          {!dateOnly && (
            <section className="duna-date-time-picker__times">
              <span>Time</span>
              <div>
                {timeOptions.map((time) => {
                  const disabled = Boolean(
                    minTime && value.date === minDate && time <= minTime,
                  );
                  return (
                    <button
                      aria-pressed={time === value.time}
                      disabled={disabled}
                      key={time}
                      onClick={() => chooseTime(time)}
                      type="button"
                    >
                      {timeLabel(time)}
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
