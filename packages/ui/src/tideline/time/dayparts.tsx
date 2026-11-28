"use client";

import {
  DAYPART_LABELS,
  DAYPARTS,
  daypartBounds,
  daypartGlyph,
  type Daypart,
  type DayLight,
} from "@duna/tideline-core";
import { useState } from "react";
import { cx } from "../base/cx";
import { Icon } from "../base/icons";
import { minuteRangeLabel } from "./time-format";

export interface DaypartsProps {
  /** Names the filter ("When do you play?"). */
  label: string;
  /** The venue's light in wall-clock minutes (`dayLightMinutes` in `@duna/tideline-core`). */
  light: DayLight;
  /** Closing minute, so the evening reads "4:45 – 10:00 PM". Default 10:00 PM. */
  closeMinute?: number;
  courtIsLit?: boolean;
  value?: ReadonlyArray<Daypart>;
  defaultValue?: ReadonlyArray<Daypart>;
  onValueChange?: (value: ReadonlyArray<Daypart>) => void;
  locale?: string;
  className?: string;
}

/**
 * Filter by light, not the clock: morning, midday, afternoon, golden hour and
 * evening, with each venue's own times. Multi-select toggle buttons
 * (`aria-pressed`); a daypart the day squeezes out (no afternoon in a
 * northern winter) is left out.
 */
export function Dayparts({
  label,
  light,
  closeMinute = 22 * 60,
  courtIsLit = true,
  value,
  defaultValue = [],
  onValueChange,
  locale = "en-US",
  className,
}: DaypartsProps) {
  const [inner, setInner] = useState<ReadonlyArray<Daypart>>(defaultValue);
  const chosen = value ?? inner;
  const bounds = daypartBounds(light).filter((b) => b.toMinute > b.fromMinute);
  return (
    <div
      aria-label={label}
      className={cx("td-dayparts", className)}
      role="group"
    >
      {DAYPARTS.filter((d) => bounds.some((b) => b.daypart === d)).map(
        (daypart) => {
          const b = bounds.find((x) => x.daypart === daypart);
          if (!b) return null;
          const on = chosen.includes(daypart);
          const range = minuteRangeLabel(
            daypart === "morning"
              ? (light.sunriseMinute ?? 6 * 60)
              : b.fromMinute,
            daypart === "evening" ? closeMinute : b.toMinute,
            locale,
          );
          return (
            <button
              aria-label={`${DAYPART_LABELS[daypart]}, ${range}`}
              aria-pressed={on}
              className="td-daypart"
              key={daypart}
              onClick={() => {
                const next = on
                  ? chosen.filter((d) => d !== daypart)
                  : [...chosen, daypart];
                setInner(next);
                onValueChange?.(next);
              }}
              type="button"
            >
              <Icon name={daypartGlyph(daypart, courtIsLit)} size="control" />
              <span className="td-daypart__words">
                <b>{DAYPART_LABELS[daypart]}</b>
                <small>{range}</small>
              </span>
            </button>
          );
        },
      )}
    </div>
  );
}
