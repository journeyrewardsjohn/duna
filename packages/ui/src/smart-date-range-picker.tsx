"use client";

import { useMemo, useState } from "react";
import {
  calendarMonthDays,
  combineLocalDateTime,
  formatLocalDate,
  normalizeDateRange,
  quickDateRange,
  splitLocalDateTime,
  type SmartDatePreset,
  type SmartDateRangeValue,
} from "./smart-date-range";

const presets: readonly {
  readonly key: SmartDatePreset;
  readonly label: string;
}[] = [
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "this-weekend", label: "This weekend" },
  { key: "next-7-days", label: "Next 7 days" },
  { key: "next-30-days", label: "Next 30 days" },
  { key: "this-month", label: "This month" },
  { key: "next-month", label: "Next month" },
  { key: "this-quarter", label: "This quarter" },
];

function monthFromDate(value: string): {
  readonly year: number;
  readonly month: number;
} {
  const [year, month] = value.split("-").map(Number);
  const now = new Date();
  return {
    year: Number.isFinite(year) ? year! : now.getFullYear(),
    month: Number.isFinite(month) ? month! - 1 : now.getMonth(),
  };
}

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
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(year, month - 1, day, 12));
}

export function SmartDateRangePicker({
  value,
  onChange,
  label = "Date range",
  timeMode = "optional",
  timeEnabled,
  onTimeEnabledChange,
  minimumDate,
  exclusions = [],
  onExclusionsChange,
  allowExclusions = false,
  onApply,
  onCancel,
  applyLabel = "Apply",
}: {
  readonly value: SmartDateRangeValue;
  readonly onChange: (value: SmartDateRangeValue) => void;
  readonly label?: string;
  readonly timeMode?: "hidden" | "optional" | "required";
  readonly timeEnabled?: boolean;
  readonly onTimeEnabledChange?: (enabled: boolean) => void;
  readonly minimumDate?: string;
  readonly exclusions?: readonly SmartDateRangeValue[];
  readonly onExclusionsChange?: (value: readonly SmartDateRangeValue[]) => void;
  readonly allowExclusions?: boolean;
  readonly onApply?: () => void;
  readonly onCancel?: () => void;
  readonly applyLabel?: string;
}) {
  const start = splitLocalDateTime(value.start);
  const end = splitLocalDateTime(value.end);
  const resolvedTimeEnabled =
    timeMode === "required" ||
    (timeMode === "optional" &&
      (timeEnabled ?? Boolean(start.time || end.time)));
  const [visibleMonth, setVisibleMonth] = useState(() =>
    monthFromDate(start.date),
  );
  const [selectionPhase, setSelectionPhase] = useState<"start" | "end">(
    "start",
  );
  const [exclusionMode, setExclusionMode] = useState(false);
  const [exclusionStart, setExclusionStart] = useState<string>();
  const [today] = useState(() => formatLocalDate(new Date()));
  const secondMonth = offsetMonth(visibleMonth, 1);
  const excludedDates = useMemo(() => {
    const dates = new Set<string>();
    for (const exclusion of exclusions) {
      const from = splitLocalDateTime(exclusion.start).date;
      const to = splitLocalDateTime(exclusion.end).date;
      if (!from || !to) continue;
      let cursor = from;
      while (cursor <= to) {
        dates.add(cursor);
        const date = new Date(`${cursor}T12:00:00`);
        date.setDate(date.getDate() + 1);
        cursor = formatLocalDate(date);
      }
    }
    return dates;
  }, [exclusions]);

  function updateRange(nextStart: string, nextEnd: string) {
    onChange({
      start: combineLocalDateTime(
        nextStart,
        start.time || "09:00",
        resolvedTimeEnabled,
      ),
      end: combineLocalDateTime(
        nextEnd,
        end.time || "10:00",
        resolvedTimeEnabled,
      ),
    });
  }

  function selectDay(date: string) {
    if (minimumDate && date < minimumDate) return;
    if (exclusionMode) {
      if (!exclusionStart) {
        setExclusionStart(date);
        return;
      }
      const range = normalizeDateRange(exclusionStart, date);
      onExclusionsChange?.([
        ...exclusions,
        {
          start: combineLocalDateTime(
            range.start,
            start.time || "09:00",
            resolvedTimeEnabled,
          ),
          end: combineLocalDateTime(
            range.end,
            end.time || "10:00",
            resolvedTimeEnabled,
          ),
        },
      ]);
      setExclusionStart(undefined);
      setExclusionMode(false);
      return;
    }
    if (selectionPhase === "start") {
      updateRange(date, date);
      setSelectionPhase("end");
      return;
    }
    const range = normalizeDateRange(start.date, date);
    updateRange(range.start, range.end);
    setSelectionPhase("start");
  }

  function applyPreset(preset: SmartDatePreset) {
    const range = quickDateRange(preset, today);
    updateRange(range.start, range.end);
    setVisibleMonth(monthFromDate(range.start));
    setSelectionPhase("start");
    setExclusionMode(false);
    setExclusionStart(undefined);
  }

  function setTimeEnabled(enabled: boolean) {
    onTimeEnabledChange?.(enabled);
    onChange({
      start: combineLocalDateTime(start.date, start.time || "09:00", enabled),
      end: combineLocalDateTime(end.date, end.time || "10:00", enabled),
    });
  }

  function renderMonth(
    month: { readonly year: number; readonly month: number },
    secondary = false,
  ) {
    const days = calendarMonthDays(month.year, month.month);
    return (
      <section
        className={
          secondary
            ? "duna-date-range__month is-secondary"
            : "duna-date-range__month"
        }
        key={`${month.year}-${month.month}`}
      >
        <h3>{monthLabel(month.year, month.month)}</h3>
        <div className="duna-date-range__weekdays" aria-hidden>
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="duna-date-range__days" role="grid">
          {days.map((day) => {
            const inRange =
              Boolean(start.date && end.date) &&
              day.date >= start.date &&
              day.date <= end.date;
            const selected = day.date === start.date || day.date === end.date;
            const disabled = Boolean(minimumDate && day.date < minimumDate);
            const isExclusionDraft =
              exclusionMode && day.date === exclusionStart;
            return (
              <button
                aria-label={displayDate(day.date)}
                aria-pressed={selected}
                className={[
                  inRange && "is-in-range",
                  selected && "is-selected",
                  !day.inMonth && "is-outside",
                  excludedDates.has(day.date) && "is-excluded",
                  isExclusionDraft && "is-exclusion-draft",
                ]
                  .filter(Boolean)
                  .join(" ")}
                disabled={disabled}
                key={day.date}
                onClick={() => selectDay(day.date)}
                role="gridcell"
                type="button"
              >
                {day.day}
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <section className="duna-date-range" aria-label={label}>
      <header className="duna-date-range__heading">
        <span>
          <small>Smart schedule</small>
          <strong>{label}</strong>
        </span>
        {allowExclusions && (
          <button
            className={exclusionMode ? "is-active" : undefined}
            onClick={() => {
              setExclusionMode((current) => !current);
              setExclusionStart(undefined);
            }}
            type="button"
          >
            {exclusionMode ? "Cancel exclusion" : "+ Add exclusion"}
          </button>
        )}
      </header>

      <div className="duna-date-range__inputs">
        <label>
          <span>Starts</span>
          <input
            min={minimumDate}
            onChange={(event) => updateRange(event.target.value, end.date)}
            type="date"
            value={start.date}
          />
          {resolvedTimeEnabled && (
            <input
              aria-label="Start time"
              onChange={(event) =>
                onChange({
                  ...value,
                  start: combineLocalDateTime(
                    start.date,
                    event.target.value,
                    true,
                  ),
                })
              }
              type="time"
              value={start.time || "09:00"}
            />
          )}
        </label>
        <span aria-hidden>to</span>
        <label>
          <span>Ends</span>
          <input
            min={start.date || minimumDate}
            onChange={(event) => updateRange(start.date, event.target.value)}
            type="date"
            value={end.date}
          />
          {resolvedTimeEnabled && (
            <input
              aria-label="End time"
              onChange={(event) =>
                onChange({
                  ...value,
                  end: combineLocalDateTime(end.date, event.target.value, true),
                })
              }
              type="time"
              value={end.time || "10:00"}
            />
          )}
        </label>
      </div>

      {exclusionMode && (
        <p className="duna-date-range__instruction" role="status">
          {exclusionStart
            ? "Now choose the last unavailable day."
            : "Choose the first unavailable day."}
        </p>
      )}

      <div className="duna-date-range__body">
        <nav
          aria-label="Quick date ranges"
          className="duna-date-range__presets"
        >
          {presets.map((preset) => (
            <button
              key={preset.key}
              onClick={() => applyPreset(preset.key)}
              type="button"
            >
              {preset.label}
            </button>
          ))}
        </nav>
        <div className="duna-date-range__calendar">
          <div className="duna-date-range__navigation">
            <button
              aria-label="Previous month"
              onClick={() =>
                setVisibleMonth((current) => offsetMonth(current, -1))
              }
              type="button"
            >
              ‹
            </button>
            <span>
              {selectionPhase === "start" ? "Choose start" : "Choose end"}
            </span>
            <button
              aria-label="Next month"
              onClick={() =>
                setVisibleMonth((current) => offsetMonth(current, 1))
              }
              type="button"
            >
              ›
            </button>
          </div>
          <div className="duna-date-range__months">
            {renderMonth(visibleMonth)}
            {renderMonth(secondMonth, true)}
          </div>
        </div>
      </div>

      {exclusions.length > 0 && (
        <div
          className="duna-date-range__exclusions"
          aria-label="Excluded ranges"
        >
          {exclusions.map((exclusion, index) => (
            <span key={`${exclusion.start}:${exclusion.end}:${index}`}>
              {displayDate(splitLocalDateTime(exclusion.start).date)} –{" "}
              {displayDate(splitLocalDateTime(exclusion.end).date)}
              <button
                aria-label={`Remove exclusion ${index + 1}`}
                onClick={() =>
                  onExclusionsChange?.(
                    exclusions.filter((_, candidate) => candidate !== index),
                  )
                }
                type="button"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <footer className="duna-date-range__footer">
        {timeMode === "optional" ? (
          <label className="duna-date-range__time-toggle">
            <input
              checked={resolvedTimeEnabled}
              onChange={(event) => setTimeEnabled(event.target.checked)}
              type="checkbox"
            />
            <span aria-hidden />
            Set time
          </label>
        ) : (
          <span className="duna-date-range__time-state">
            {timeMode === "required" ? "Time required" : "All day"}
          </span>
        )}
        <div>
          <button
            onClick={() => {
              setSelectionPhase("start");
              setExclusionMode(false);
              setExclusionStart(undefined);
              onCancel?.();
            }}
            type="button"
          >
            Cancel
          </button>
          <button
            className="is-primary"
            onClick={() => {
              setSelectionPhase("start");
              onApply?.();
            }}
            type="button"
          >
            {applyLabel}
          </button>
        </div>
      </footer>
    </section>
  );
}
