"use client";

import { DateRangePicker, DayStrip, isoDateOf } from "@duna/ui/tideline";
import {
  type Surface,
  SURFACES,
  WHAT_CATEGORIES,
  type WhatCategory,
  WHEN_PRESETS,
  type WhenChoice,
} from "./search-query";

function ChoiceChip({
  pressed,
  onPress,
  children,
}: {
  readonly pressed: boolean;
  readonly onPress: () => void;
  readonly children: string;
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
 * When (spec 2.3): Today, Tonight (from 4 PM), This weekend, This week, Any
 * time; a seven-day strip for one day; the design system's calendar for a
 * range.
 */
export function WhenPicker({
  value,
  onChange,
}: {
  readonly value: WhenChoice;
  readonly onChange: (next: WhenChoice) => void;
}) {
  const today = isoDateOf(new Date());
  const day =
    value.kind === "range" && value.start === value.end ? value.start : null;
  return (
    <div className="site-picker">
      <div aria-label="When" className="site-choices" role="group">
        {WHEN_PRESETS.map((preset) => (
          <ChoiceChip
            key={preset.id}
            onPress={() => onChange({ kind: "preset", preset: preset.id })}
            pressed={value.kind === "preset" && value.preset === preset.id}
          >
            {preset.label}
          </ChoiceChip>
        ))}
      </div>
      <p className="site-label site-picker__label">Or pick a day</p>
      <DayStrip
        aria-label="Pick a day"
        count={7}
        onValueChange={(next) => {
          if (typeof next === "string") {
            onChange({ kind: "range", start: next, end: next });
          }
        }}
        start={today}
        today={today}
        value={day ?? ""}
      />
      <p className="site-label site-picker__label">Or choose dates</p>
      <DateRangePicker
        endLabel="To"
        onValueChange={(range) => {
          if (range)
            onChange({ kind: "range", start: range[0], end: range[1] });
        }}
        startLabel="From"
        value={
          value.kind === "range" && value.start !== value.end
            ? [value.start, value.end]
            : null
        }
      />
    </div>
  );
}

/** What (spec 2.3): the kinds of play, several at once, and the surface. */
export function WhatPicker({
  what,
  surface,
  onWhat,
  onSurface,
}: {
  readonly what: ReadonlyArray<WhatCategory>;
  readonly surface: Surface;
  readonly onWhat: (next: WhatCategory[]) => void;
  readonly onSurface: (next: Surface) => void;
}) {
  return (
    <div className="site-picker">
      <p className="site-label site-picker__label" id="site-what-kinds">
        What
      </p>
      <div
        aria-labelledby="site-what-kinds"
        className="site-choices"
        role="group"
      >
        {WHAT_CATEGORIES.map((category) => {
          const on = what.includes(category.id);
          return (
            <ChoiceChip
              key={category.id}
              onPress={() =>
                onWhat(
                  on
                    ? what.filter((id) => id !== category.id)
                    : [...what, category.id],
                )
              }
              pressed={on}
            >
              {category.label}
            </ChoiceChip>
          );
        })}
      </div>
      <p className="site-label site-picker__label" id="site-what-surface">
        Surface
      </p>
      <div
        aria-labelledby="site-what-surface"
        className="site-choices"
        role="group"
      >
        {SURFACES.map((item) => (
          <ChoiceChip
            key={item.id}
            onPress={() => onSurface(item.id)}
            pressed={surface === item.id}
          >
            {item.label}
          </ChoiceChip>
        ))}
      </div>
    </div>
  );
}
