import {
  formatSpan,
  formatTime,
  sunArcModel,
  type SunTimes,
} from "@duna/tideline-core";
import { cx } from "../base/cx";

export interface SunArcProps {
  /** Sun times for the venue's date (`sunTimes` in `@duna/tideline-core`). */
  sun: SunTimes;
  /** "Now" from the caller's clock (epoch ms). */
  now: number;
  /** The venue's IANA zone: times read on its clock. */
  timeZone: string;
  /** Tomorrow's sunrise, for "until first light" after sunset. */
  nextSunrise?: number | null;
  locale?: string;
  className?: string;
}

const W = 300;
const BASE = 120;
const RX = 125;
const RY = 100;
const CX = 150;

function point(k: number): [number, number] {
  const a = Math.PI * (1 - Math.min(1, Math.max(0, k)));
  return [CX + RX * Math.cos(a), BASE - RY * Math.sin(a)];
}

function arc(from: number, to: number): string {
  const [x1, y1] = point(from);
  const [x2, y2] = point(to);
  return `M${x1.toFixed(1)} ${y1.toFixed(1)}A${RX} ${RY} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

/**
 * The day as the quarter-turn Crest: the line is the horizon and the arc the
 * sun's path. The elapsed arc draws on once (Rise); golden hour is the
 * Hardwood stretch before sunset. Light left is the number in the middle;
 * after sunset it counts to first light. One picture with an accessible
 * sentence; `Sunrise` stays the page loader.
 */
export function SunArc({
  sun,
  now,
  timeZone,
  nextSunrise,
  locale = "en-US",
  className,
}: SunArcProps) {
  const model = sunArcModel(sun, now, { nextSunrise });
  const time = (ms: number | null) =>
    ms === null ? "—" : formatTime(ms, { locale, timeZone });

  if (model.phase === "polar-day" || model.phase === "polar-night") {
    const words =
      model.phase === "polar-day"
        ? "The sun does not set today."
        : "The sun does not rise today.";
    return (
      <figure className={cx("td-sunarc", className)} data-phase={model.phase}>
        <p className="td-sunarc__polar">{words}</p>
      </figure>
    );
  }

  const after =
    model.phase === "after-sunset" || model.phase === "before-sunrise";
  const big = after
    ? formatSpan(model.minutesUntilFirstLight ?? 0)
    : formatSpan(model.minutesOfLightLeft);
  const small = after ? "until first light" : "of light left";
  const sentence = after
    ? `${big} until first light at ${time(model.phase === "before-sunrise" ? sun.sunrise : (nextSunrise ?? (sun.sunrise === null ? null : sun.sunrise + 86_400_000)))}.`
    : `${big} of light left. Sunrise ${time(sun.sunrise)}, golden hour ${time(sun.goldenHourStart)}, sunset ${time(sun.sunset)}.`;
  const golden = model.goldenFrom;
  const done =
    model.phase === "golden-hour" && golden !== null ? golden : model.progress;
  const [sx, sy] = point(model.progress);

  return (
    <figure
      aria-label={sentence}
      className={cx("td-sunarc", className)}
      data-phase={model.phase}
      role="img"
    >
      <svg aria-hidden="true" focusable="false" viewBox={`0 0 ${W} 136`}>
        <path className="td-sunarc__path" d={arc(0, 1)} />
        {done > 0 && !after ? (
          <path className="td-sunarc__done" d={arc(0, done)} pathLength={1} />
        ) : null}
        {golden !== null ? (
          <path className="td-sunarc__gold" d={arc(golden, 1)} />
        ) : null}
        {!after ? (
          <circle className="td-sunarc__sun" cx={sx} cy={sy} r={7} />
        ) : null}
        <rect
          className="td-sunarc__line"
          height={6}
          width={280}
          x={10}
          y={BASE}
        />
      </svg>
      <div aria-hidden="true" className="td-sunarc__mid">
        <b>{big}</b>
        <span>{small}</span>
      </div>
      <div aria-hidden="true" className="td-sunarc__times">
        <span>
          <small>Sunrise</small>
          <b>{time(sun.sunrise)}</b>
        </span>
        <span>
          <small>Golden hour</small>
          <b>{time(sun.goldenHourStart)}</b>
        </span>
        <span>
          <small>Sunset</small>
          <b>{time(sun.sunset)}</b>
        </span>
      </div>
    </figure>
  );
}
