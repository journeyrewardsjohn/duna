"use client";

import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { useMemo, useState } from "react";

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

export function DunaDatePicker({
  label,
  min,
  onChange,
  value,
}: {
  readonly label: string;
  readonly min?: string;
  readonly onChange: (value: string) => void;
  readonly value: string;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => {
    const parsed = value ? new Date(`${value}T12:00:00`) : new Date();
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

  return (
    <div className="duna-date-picker">
      <span>{label}</span>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={label}
        className="duna-picker-trigger"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <CalendarDays aria-hidden size={18} />
        {dateLabel(value)}
      </button>
      {open && (
        <div
          className="duna-picker-popover"
          role="dialog"
          aria-label={`${label} calendar`}
        >
          <header>
            <button
              aria-label="Previous month"
              onClick={() =>
                setMonth(
                  (current) =>
                    new Date(current.getFullYear(), current.getMonth() - 1, 1),
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
                    new Date(current.getFullYear(), current.getMonth() + 1, 1),
                )
              }
              type="button"
            >
              <ChevronRight aria-hidden size={18} />
            </button>
          </header>
          <div className="duna-picker-weekdays">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="duna-picker-days">
            {days.map((date, index) => {
              if (!date) return <span key={`blank-${index}`} />;
              const key = dateKey(date);
              const disabled = Boolean(min && key < min);
              return (
                <button
                  aria-pressed={key === value}
                  disabled={disabled}
                  key={key}
                  onClick={() => {
                    onChange(key);
                    setOpen(false);
                  }}
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
                onChange("");
                setOpen(false);
              }}
              type="button"
            >
              Clear
            </button>
            <button
              onClick={() => {
                const today = dateKey(new Date());
                const nextValue = min && today < min ? min : today;
                onChange(nextValue);
                setMonth(new Date(`${nextValue}T12:00:00`));
                setOpen(false);
              }}
              type="button"
            >
              Today
            </button>
          </footer>
        </div>
      )}
    </div>
  );
}

export function DunaTimePicker({
  label,
  onChange,
  value,
}: {
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly value: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="duna-time-picker">
      <span>{label}</span>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={label}
        className="duna-picker-trigger"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <Clock3 aria-hidden size={18} />
        {timeLabel(value)}
      </button>
      {open && (
        <div
          className="duna-time-popover"
          role="dialog"
          aria-label={`${label} time`}
        >
          {timeOptions.map((time) => (
            <button
              aria-pressed={time === value}
              key={time}
              onClick={() => {
                onChange(time);
                setOpen(false);
              }}
              type="button"
            >
              {timeLabel(time)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
