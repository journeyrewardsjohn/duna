import {
  RATING_RING_GEOMETRY,
  ratingRingArcPath,
  ratingRingLabel,
  ratingRingLayout,
  ratingRingModel,
  type RatingChip,
} from "@duna/tideline-core";
import type { CSSProperties } from "react";
import { cx } from "../base/cx";

/** Named sizes: profile hero 260, card 120, inline 40 px. Or a number in px. */
export type RatingRingSize = "hero" | "card" | "inline" | number;

const NAMED_SIZES = { hero: 260, card: 120, inline: 40 } as const;

export interface RatingRingProps {
  /** The Sand Rating, or `null` while provisional. */
  value: number | null;
  /** Change since the previous rating (positive is up). */
  delta?: number | null;
  /** Reliability band, 0 to 3 filled segments. */
  reliability: number;
  /** Matches still needed before the rating shows; > 0 is provisional. */
  matchesLeft?: number;
  /** The next goal; defaults to the next half point. */
  goal?: number;
  size?: RatingRingSize;
  /** What the number is. "Sand Rating" is always two words. */
  label?: string;
  locale?: string;
  /** Rise from the previous value when shown (900 ms). Default on. */
  animate?: boolean;
  className?: string;
}

function chipText(chip: RatingChip): string {
  if (chip.kind === "delta")
    return `${chip.direction === "up" ? "▲" : "▼"} ${chip.text}`;
  if (chip.kind === "reached") return `Reached ${chip.goalText}`;
  return `${chip.count} more ${chip.count === 1 ? "match" : "matches"}`;
}

/**
 * The two-ring Sand Rating (brand book section 4): a progress arc through the
 * current half point on a track, a three-segment reliability band inside it,
 * and the label, number and change chip inside the band. Geometry and
 * states come from `@duna/tideline-core`, so native draws the same ring.
 *
 * The goal tick is drawn in a neutral line colour, not Solar: the brand
 * book's Solar tick is an exception still open with the owner (contract
 * README, open questions), and Solar is for live states only.
 *
 * Its text alternative says everything the drawing does (the Dune band is
 * 1.5:1 on Salt and never carries meaning alone). It renders at its value:
 * a static render never shows 0.00; the arc Rises from where it was.
 */
export function RatingRing({
  value,
  delta,
  reliability,
  matchesLeft,
  goal,
  size = "card",
  label = "Sand Rating",
  locale = "en-US",
  animate = true,
  className,
}: RatingRingProps) {
  const px = typeof size === "number" ? size : NAMED_SIZES[size];
  const model = ratingRingModel({
    value,
    delta,
    reliability,
    matchesLeft,
    goal,
    locale,
  });
  const layout = ratingRingLayout(px);
  const { track, band, tick, viewBox } = RATING_RING_GEOMETRY;
  const arcStroke = layout.arcStroke ?? track.stroke;
  const circumference = 2 * Math.PI * track.radius;
  const text = ratingRingLabel(model, { label, locale });
  const number = model.label.number ?? "—";
  const chip = model.label.chip;

  const style = {
    "--td-ring-size": `${px}px`,
    "--td-ring-from": `${circumference * (1 - model.progressFrom.fraction)}`,
    "--td-ring-to": `${circumference * (1 - model.progress.fraction)}`,
    "--td-ring-c": `${circumference}`,
  } as CSSProperties;

  return (
    <span
      aria-label={text}
      className={cx(
        "td-ring",
        `td-ring--${layout.band}`,
        animate && "td-ring--animate",
        className,
      )}
      data-state={model.state}
      role="img"
      style={style}
    >
      <span aria-hidden="true" className="td-ring__dial">
        <svg
          className="td-ring__svg"
          focusable="false"
          viewBox={`0 0 ${viewBox} ${viewBox}`}
        >
          <circle
            className={cx(
              "td-ring__track",
              model.dotted && "td-ring__track--dotted",
            )}
            cx={viewBox / 2}
            cy={viewBox / 2}
            r={track.radius}
            strokeWidth={arcStroke}
          />
          {model.progress.fraction > 0 ? (
            <circle
              className="td-ring__arc"
              cx={viewBox / 2}
              cy={viewBox / 2}
              r={track.radius}
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - model.progress.fraction)}
              strokeWidth={arcStroke}
              transform={`rotate(-90 ${viewBox / 2} ${viewBox / 2})`}
            />
          ) : null}
          {layout.showBand
            ? model.band.map((segment, index) => (
                <path
                  className={cx(
                    "td-ring__band",
                    segment.filled && "td-ring__band--filled",
                  )}
                  d={ratingRingArcPath(
                    segment.startDeg,
                    segment.endDeg,
                    band.radius,
                  )}
                  key={index}
                  strokeWidth={band.stroke}
                  style={{ "--td-rally-i": index } as CSSProperties}
                />
              ))
            : null}
          {layout.showTick && model.goal !== null ? (
            <line
              className="td-ring__tick"
              strokeWidth={tick.stroke}
              x1={viewBox / 2}
              x2={viewBox / 2}
              y1={tick.y1}
              y2={tick.y2}
            />
          ) : null}
        </svg>
        {layout.showNumber ? (
          <span className="td-ring__inside">
            {layout.showLabel ? (
              <span className="td-ring__label">{label}</span>
            ) : null}
            <span
              className="td-ring__number"
              style={{ fontSize: `${(layout.numberScale ?? 0.25) * px}px` }}
            >
              {number}
            </span>
            {layout.showChip && chip ? (
              <span
                className={cx(
                  "td-ring__chip",
                  `td-ring__chip--${chip.kind === "delta" ? chip.direction : chip.kind}`,
                )}
              >
                {chipText(chip)}
              </span>
            ) : null}
          </span>
        ) : null}
      </span>
      {!layout.showNumber ? (
        <span aria-hidden="true" className="td-ring__beside">
          <span className="td-ring__beside-number">{number}</span>
          {chip ? (
            <span
              className={cx(
                "td-ring__chip",
                `td-ring__chip--${chip.kind === "delta" ? chip.direction : chip.kind}`,
              )}
            >
              {chipText(chip)}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
