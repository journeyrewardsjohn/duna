import {
  LIGHT_GLYPH_LABELS,
  LIGHT_MARK_GLYPH,
  type LightGlyph,
  type LightMark as CoreLightMark,
} from "@duna/tideline-core";
import type { ReactNode } from "react";
import { cx } from "../base/cx";
import { Icon } from "../base/icons";

/** Either the contract's glyph name or the core's `LightMark` value. */
export type LightState = LightGlyph | CoreLightMark;

export function lightGlyph(state: LightState): LightGlyph {
  return state in LIGHT_MARK_GLYPH
    ? LIGHT_MARK_GLYPH[state as CoreLightMark]
    : (state as LightGlyph);
}

export interface LightMarkProps {
  /** First light, full sun, golden hour, under lights or too dark. */
  state: LightState;
  /**
   * `glyph`: the mark alone, named for screen readers (inside a chip or a
   * row that already says the time). `inline`: mark and words in a line.
   * `chip`: mark and words on a quiet fill.
   */
  variant?: "glyph" | "inline" | "chip";
  /** The words; default "Golden hour" and so on. A light mark always has a label. */
  label?: string;
  /** A time after the words, already formatted ("3:45 PM"). */
  time?: ReactNode;
  /** 14 in chips and dense rows (default), 16 inline, 20 in controls. */
  size?: "chip" | "inline" | "control";
  className?: string;
}

/**
 * The light at a time, drawn from one disc and one line: first light, full
 * sun, golden hour (Hardwood), under lights, and too dark for an unlit
 * court. Never colour alone: the glyph always carries its label, visible or
 * as its accessible name.
 */
export function LightMark({
  state,
  variant = "inline",
  label,
  time,
  size = "chip",
  className,
}: LightMarkProps) {
  const glyph = lightGlyph(state);
  const words = label ?? LIGHT_GLYPH_LABELS[glyph];
  if (variant === "glyph") {
    return (
      <Icon
        className={cx("td-lightmark", className)}
        data-light={glyph}
        label={words}
        name={glyph}
        size={size}
      />
    );
  }
  return (
    <span
      className={cx(
        "td-lightmark",
        variant === "chip" && "td-lightmark--chip",
        className,
      )}
      data-light={glyph}
    >
      <Icon name={glyph} size={size} />
      <span className="td-lightmark__words">{words}</span>
      {time ? <span className="td-lightmark__time">{time}</span> : null}
    </span>
  );
}
