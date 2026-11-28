"use client";

import {
  durationCrests,
  durationLabel,
  durationOptions,
  DEFAULT_DURATIONS,
} from "@duna/tideline-core";
import {
  Radio as UiRadio,
  RadioGroup as UiRadioGroup,
} from "@ui-sdk/react/radio";
import { useState } from "react";
import { cx } from "../base/cx";
import { CrestGlyph } from "./crest-glyph";

export interface DurationCrestsProps {
  /** Names the choice for screen readers ("Booking length"). */
  label: string;
  /** The club's enabled lengths in minutes; default 60 / 90 / 120 / 180. */
  options?: ReadonlyArray<number>;
  /** Lengths with no start time left that day: shown, not choosable, and said. */
  unavailable?: ReadonlyArray<number>;
  value?: number | null;
  defaultValue?: number | null;
  onValueChange?: (minutes: number) => void;
  /** A line under each crest option ("Quick game"), by minutes. */
  notes?: Readonly<Record<number, string>>;
  /** `compact` (default): one row of 48 px options. `lg`: tall cards, for marketing pages. */
  size?: "compact" | "lg";
  className?: string;
}

/**
 * Choose a length. Up to three lengths are Crests: one crest for the first
 * hour and one more per half hour (60 → one, 90 → two, 120 → three), drawn
 * beside the words. A club's longer lengths (three hours) follow as plain
 * options in the same row and wrap cleanly. UI SDK Radio: one tab stop,
 * arrow keys move and select.
 */
export function DurationCrests({
  label,
  options = DEFAULT_DURATIONS,
  unavailable = [],
  value,
  defaultValue = null,
  onValueChange,
  notes,
  size = "compact",
  className,
}: DurationCrestsProps) {
  const { crests, extra } = durationOptions(options);
  const [inner, setInner] = useState<number | null>(defaultValue);
  const selected = value !== undefined ? value : inner;
  const blocked = new Set(unavailable);
  const option = (minutes: number, plain: boolean) => {
    const words = durationLabel(minutes).text;
    const note =
      notes?.[minutes] ?? (plain ? "Enabled by this club" : undefined);
    const off = blocked.has(minutes);
    return (
      <UiRadio
        aria-label={[words, note, off ? "no times left this day" : null]
          .filter(Boolean)
          .join(", ")}
        className={cx("td-dur", plain && "td-dur--plain")}
        disabled={off}
        key={minutes}
        value={String(minutes)}
      >
        {plain ? null : (
          <CrestGlyph
            filled={durationCrests(minutes)}
            size={size === "lg" ? 24 : 20}
          />
        )}
        <span className="td-dur__words">
          <b>{words}</b>
          {note && (size === "lg" || notes?.[minutes]) ? (
            <small>{note}</small>
          ) : null}
        </span>
      </UiRadio>
    );
  };
  return (
    <UiRadioGroup
      aria-label={label}
      className={cx("td-durs", size === "lg" && "td-durs--lg", className)}
      onValueChange={(next) => {
        if (next === null) return;
        const minutes = Number(next);
        setInner(minutes);
        onValueChange?.(minutes);
      }}
      value={selected === null ? null : String(selected)}
    >
      {crests.map((m) => option(m, false))}
      {extra.map((m) => option(m, true))}
    </UiRadioGroup>
  );
}
