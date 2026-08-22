"use client";

import { useState } from "react";
import {
  calendarMonthDays,
  calendarMonthFromDate,
  combineLocalDateTime,
  formatLocalDate,
  splitLocalDateTime,
} from "./smart-date-range";

function offsetMonth(
  value: { readonly year: number; readonly month: number },
  offset: number,
) {
  const date = new Date(value.year, value.month + offset, 1, 12);
  return { year: date.getFullYear(), month: date.getMonth() };
}

function monthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month, 1, 12));
}

function displayDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return "Choose a date";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(year, month - 1, day, 12));
}

function displayTime(value: string): string {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(2020, 0, 1, hours, minutes));
}

function timeOptions(value: string): readonly string[] {
  const standard = Array.from({ length: 96 }, (_, index) => {
    const minutes = index * 15;
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(
      minutes % 60,
    ).padStart(2, "0")}`;
  });
  return value && !standard.includes(value)
    ? [...standard, value].sort()
    : standard;
}

export function SmartTimeSelect({
  value,
  onChange,
  label,
  disabled = false,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly label: string;
  readonly disabled?: boolean;
}) {
  return (
    <span className="duna-time-select">
      <span aria-hidden>◷</span>
      <select
        aria-label={label}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {timeOptions(value).map((option) => (
          <option key={option} value={option}>
            {displayTime(option)}
          </option>
        ))}
      </select>
      <i aria-hidden>⌄</i>
    </span>
  );
}

export function SmartDateTimePicker({
  value,
  onChange,
  label,
  minimumDate,
  maximumDate,
  applyLabel = "Set date and time",
  clearLabel = "No cutoff",
  onApply,
  onCancel,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly label: string;
  readonly minimumDate?: string;
  readonly maximumDate?: string;
  readonly applyLabel?: string;
  readonly clearLabel?: string;
  readonly onApply?: () => void;
  readonly onCancel?: () => void;
}) {
  const parts = splitLocalDateTime(value);
  const [today] = useState(() => formatLocalDate(new Date()));
  const [visibleMonth, setVisibleMonth] = useState(() =>
    calendarMonthFromDate(parts.date || today),
  );
  const days = calendarMonthDays(visibleMonth.year, visibleMonth.month);
  const resolvedTime = parts.time || "17:00";

  return (
    <section className="duna-date-time" aria-label={label}>
      <header>
        <span>
          <small>Exact date + time</small>
          <strong>{label}</strong>
        </span>
        <span className="duna-date-time__value">
          <b>{displayDate(parts.date)}</b>
          <SmartTimeSelect
            label={`${label} time`}
            onChange={(time) =>
              onChange(combineLocalDateTime(parts.date || today, time, true))
            }
            value={resolvedTime}
          />
        </span>
      </header>
      <div className="duna-date-time__navigation">
        <button
          aria-label="Previous month"
          onClick={() => setVisibleMonth((current) => offsetMonth(current, -1))}
          type="button"
        >
          ‹
        </button>
        <strong>{monthLabel(visibleMonth.year, visibleMonth.month)}</strong>
        <button
          aria-label="Next month"
          onClick={() => setVisibleMonth((current) => offsetMonth(current, 1))}
          type="button"
        >
          ›
        </button>
      </div>
      <div className="duna-date-time__weekdays" aria-hidden>
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="duna-date-time__days" role="grid">
        {days.map((day) => {
          const disabled = Boolean(
            (minimumDate && day.date < minimumDate) ||
            (maximumDate && day.date > maximumDate),
          );
          return (
            <button
              aria-label={displayDate(day.date)}
              aria-pressed={parts.date === day.date}
              className={[
                parts.date === day.date && "is-selected",
                !day.inMonth && "is-outside",
              ]
                .filter(Boolean)
                .join(" ")}
              disabled={disabled}
              key={day.date}
              onClick={() =>
                onChange(combineLocalDateTime(day.date, resolvedTime, true))
              }
              role="gridcell"
              type="button"
            >
              {day.day}
            </button>
          );
        })}
      </div>
      <footer>
        <button
          onClick={() => {
            onChange("");
            onCancel?.();
          }}
          type="button"
        >
          {clearLabel}
        </button>
        <button
          className="is-primary"
          disabled={!parts.date}
          onClick={onApply}
          type="button"
        >
          {applyLabel}
        </button>
      </footer>
    </section>
  );
}
