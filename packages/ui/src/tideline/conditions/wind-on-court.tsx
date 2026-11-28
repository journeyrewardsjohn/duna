import {
  compassPoint,
  kphToMph,
  windOnCourt,
  windOnCourtSentence,
  type CompassPoint,
  type UnitSystem,
} from "@duna/tideline-core";
import { cx } from "../base/cx";
import { Icon } from "../base/icons";
import { CrestGlyph } from "../time/crest-glyph";
import { windChip, windStrength } from "./conditions-logic";

export interface WindOnCourtProps {
  /** Sustained wind, km/h (the forecast contract's unit). */
  speedKph: number;
  gustKph?: number;
  /** Where the wind comes FROM, degrees clockwise from north. */
  windFromDeg: number;
  /** Bearing of the court's long axis, either direction (0 and 180 are the same court). */
  courtAxisDeg: number;
  /** Names for the ends by the compass point of the end: `{ W: "Ocean end", E: "Street end" }`. */
  endNames?: Readonly<Partial<Record<CompassPoint, string>>>;
  /** Display units; US (mph) by default. */
  units?: UnitSystem;
  className?: string;
}

/**
 * Wind relative to the court and its net: the court drawn end to end, the
 * wind crossing it (Cross, once), the end it favours tinted and named in
 * words, and the speed in crests (light, steady, strong). A chip appears only
 * when the wind changes the plan: steady 12 mph or gusts 14 mph and up.
 */
export function WindOnCourt({
  speedKph,
  gustKph,
  windFromDeg,
  courtAxisDeg,
  endNames,
  units = "us",
  className,
}: WindOnCourtProps) {
  const wind = windOnCourt(speedKph, windFromDeg, courtAxisDeg);
  const topEnd = compassPoint(courtAxisDeg);
  const bottomEnd = compassPoint(courtAxisDeg + 180);
  const name = (end: CompassPoint) => endNames?.[end] ?? `${end} end`;
  const sentence = windOnCourtSentence(wind, { endNames });
  const goodTop = wind.goodEndCompass === topEnd;
  const goodBottom = wind.goodEndCompass === bottomEnd;
  const relative = windFromDeg - courtAxisDeg;
  const strength = windStrength(speedKph);
  const unit = units === "us" ? "mph" : "km/h";
  const speed = (kph: number) =>
    Math.round(units === "us" ? kphToMph(kph) : kph);
  const chip = windChip(
    { at: 0, windSpeedKph: speedKph, windGustKph: gustKph },
    units,
  );

  return (
    <div className={cx("td-woc", className)}>
      <svg
        aria-label={sentence}
        className="td-woc__court"
        role="img"
        viewBox="0 -20 120 216"
      >
        <text className="td-woc__end" textAnchor="middle" x={60} y={-6}>
          {name(topEnd)}
        </text>
        {goodTop ? (
          <rect className="td-woc__good" height={80} width={92} x={14} y={8} />
        ) : null}
        {goodBottom ? (
          <rect className="td-woc__good" height={80} width={92} x={14} y={88} />
        ) : null}
        <rect className="td-woc__lines" height={160} width={92} x={14} y={8} />
        <rect className="td-woc__net" height={6} width={108} x={6} y={85} />
        {wind.dominant === "calm" ? null : (
          <g className="td-woc__flow" transform={`rotate(${relative} 60 88)`}>
            <path d="M38 24V150M60 24V150M82 24V150" />
            <path d="M33 143L38 150L43 143M55 143L60 150L65 143M77 143L82 150L87 143" />
          </g>
        )}
        <text className="td-woc__end" textAnchor="middle" x={60} y={192}>
          {name(bottomEnd)}
        </text>
      </svg>
      <div className="td-woc__txt">
        <div className="td-woc__speed">
          <CrestGlyph filled={strength.crests} size={24} />
          <div>
            <b>
              {wind.windFromCompass ? `${wind.windFromCompass} ` : ""}
              {speed(speedKph)} {unit}
            </b>
            <span>
              {strength.word}
              {gustKph !== undefined
                ? ` · gusts ${speed(gustKph)} ${unit}`
                : ""}
            </span>
          </div>
        </div>
        {chip ? (
          <span className="td-woc__chip">
            <Icon
              name={chip.startsWith("Gusty") ? "gust" : "wind"}
              size="chip"
            />
            {chip}
          </span>
        ) : null}
        <p className="td-woc__sentence">{sentence}</p>
      </div>
    </div>
  );
}
