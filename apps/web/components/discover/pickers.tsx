"use client";

import { DateRangePicker, DayStrip, isoDateOf } from "@duna/ui/tideline";
import type { ReactNode } from "react";
import {
  DAYPARTS,
  type Daypart,
  type DiscoverWhen,
  SURFACE_OPTIONS,
  type SurfaceId,
  WHAT_OPTIONS,
  type WhatId,
  WHEN_PRESETS,
} from "./search-state";

function Choice({
  pressed,
  onPress,
  children,
}: {
  readonly pressed: boolean;
  readonly onPress: () => void;
  readonly children: ReactNode;
}) {
  return (
    <button
      aria-pressed={pressed}
      className="site-choice"
      onClick={onPress}
      type="button"
    >
      {children}
    </button>
  );
}

/**
 * When: today, tomorrow, tonight, this weekend, this week or any time; one
 * day from the strip or a range from the calendar; and the part of the day.
 */
export function DiscoverWhenPicker({
  when,
  time,
  onWhen,
  onTime,
}: {
  readonly when: DiscoverWhen;
  readonly time: Daypart | null;
  readonly onWhen: (next: DiscoverWhen) => void;
  readonly onTime: (next: Daypart | null) => void;
}) {
  const today = isoDateOf(new Date());
  const day = when.kind === "dates" && when.from === when.to ? when.from : "";
  return (
    <div className="site-picker">
      <div aria-label="When" className="site-choices" role="group">
        {WHEN_PRESETS.map((preset) => (
          <Choice
            key={preset.id}
            onPress={() => onWhen({ kind: "preset", preset: preset.id })}
            pressed={when.kind === "preset" && when.preset === preset.id}
          >
            {preset.label}
          </Choice>
        ))}
      </div>
      <p className="site-label site-picker__label">Or pick a day</p>
      <DayStrip
        aria-label="Pick a day"
        count={7}
        onValueChange={(next) => {
          if (typeof next === "string") {
            onWhen({ kind: "dates", from: next, to: next });
          }
        }}
        start={today}
        today={today}
        value={day}
      />
      <p className="site-label site-picker__label">Or choose dates</p>
      <DateRangePicker
        endLabel="To"
        onValueChange={(range) => {
          if (range) onWhen({ kind: "dates", from: range[0], to: range[1] });
        }}
        startLabel="From"
        value={
          when.kind === "dates" && when.from !== when.to
            ? [when.from, when.to]
            : null
        }
      />
      <p className="site-label site-picker__label" id="dv-daypart">
        Time of day
      </p>
      <div aria-labelledby="dv-daypart" className="site-choices" role="group">
        <Choice onPress={() => onTime(null)} pressed={time === null}>
          Any time of day
        </Choice>
        {DAYPARTS.map((part) => (
          <Choice
            key={part.id}
            onPress={() => onTime(time === part.id ? null : part.id)}
            pressed={time === part.id}
          >
            {part.label}
          </Choice>
        ))}
      </div>
    </div>
  );
}

/** What: the kinds of play (several at once) and the surface. */
export function DiscoverWhatPicker({
  what,
  surface,
  onWhat,
  onSurface,
}: {
  readonly what: readonly WhatId[];
  readonly surface: SurfaceId;
  readonly onWhat: (next: WhatId[]) => void;
  readonly onSurface: (next: SurfaceId) => void;
}) {
  return (
    <div className="site-picker">
      <p className="site-label site-picker__label" id="dv-what-kinds">
        What
      </p>
      <div
        aria-labelledby="dv-what-kinds"
        className="site-choices"
        role="group"
      >
        {WHAT_OPTIONS.map((option) => {
          const on = what.includes(option.id);
          return (
            <Choice
              key={option.id}
              onPress={() =>
                onWhat(
                  on
                    ? what.filter((id) => id !== option.id)
                    : WHAT_OPTIONS.map((item) => item.id).filter(
                        (id) => id === option.id || what.includes(id),
                      ),
                )
              }
              pressed={on}
            >
              {option.label}
            </Choice>
          );
        })}
      </div>
      <p className="site-label site-picker__label" id="dv-what-surface">
        Surface
      </p>
      <div
        aria-labelledby="dv-what-surface"
        className="site-choices"
        role="group"
      >
        {SURFACE_OPTIONS.map((item) => (
          <Choice
            key={item.id}
            onPress={() => onSurface(item.id)}
            pressed={surface === item.id}
          >
            {item.label}
          </Choice>
        ))}
      </div>
    </div>
  );
}
