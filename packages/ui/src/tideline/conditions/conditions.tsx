import {
  formatTime,
  kphToMph,
  LIGHT_GLYPH_LABELS,
  lightMarkFor,
  type CompassPoint,
  type ConditionThresholds,
  type HourlyConditions,
  type PlayCall,
  type SunTimes,
  type UnitSystem,
} from "@duna/tideline-core";
import type { ReactNode } from "react";
import { cx } from "../base/cx";
import { Icon } from "../base/icons";
import { NotConfigured } from "../states/states";
import { CrestGlyph } from "../time/crest-glyph";
import {
  freshness,
  playCallView,
  readings,
  temperatureText,
  type ConditionsStatus,
} from "./conditions-logic";
import { LightMark, lightGlyph } from "./light-mark";
import { SunArc } from "./sun-arc";
import { WindOnCourt } from "./wind-on-court";

export interface ConditionsCourt {
  /** Bearing of the court's long axis. */
  axisDeg: number;
  endNames?: Readonly<Partial<Record<CompassPoint, string>>>;
}

export interface ConditionsProps {
  /** The reading (the forecast contract: C, km/h, percent). */
  conditions?: HourlyConditions | null;
  /** `ready` by default; `loading`, `no-data` for this location, `not-configured` before a weather provider exists. */
  status?: ConditionsStatus;
  /** When the reading was taken (epoch ms); with `now`, older than `freshMinutes` is stale. */
  readAt?: number;
  now?: number;
  /** The conditions service's freshness window; default 60 minutes. */
  freshMinutes?: number;
  /** Display units; US (°F, mph) by default. */
  units?: UnitSystem;
  /** A club's own thresholds (metric, like the forecast). */
  thresholds?: Partial<ConditionThresholds>;
  /** The service's call wins over the numbers (lightning, a club closure). */
  call?: PlayCall;
  /** Words for that call ("Lightning 8 mi away"). */
  reason?: string;
  /** A line after the call ("Gusts to 24 mph after 2 PM from the ocean end."). */
  callText?: string;
  /** "Clear", "Partly cloudy". */
  sky?: string;
  feelsLikeC?: number;
  /** Sun times for the venue's date: adds the light mark and the sun arc. */
  sun?: SunTimes | null;
  courtIsLit?: boolean;
  /** The court's orientation: adds wind on court. */
  court?: ConditionsCourt | null;
  /** The next hours, for a small strip. */
  hourly?: ReadonlyArray<HourlyConditions>;
  timeZone: string;
  locale?: string;
  /** The weather credit the provider requires. */
  credit?: ReactNode;
  /** Names the region ("Conditions for Saturday, Nov 28"). */
  label?: string;
  /** The settings link for an owner when weather is not set up. */
  setup?: ReactNode;
  className?: string;
}

/**
 * Outdoor conditions in full: the temperature first, the sky and its light,
 * a play call in words, an icon and crests (never colour alone), then wind,
 * gusts, UV and rain split by hairlines. Optionally the sun arc, wind on the
 * court and the next hours. Honest states: loading, no data for this place,
 * stale (says when it was read), and not set up yet. Indoor venues show none.
 */
export function Conditions({
  conditions,
  status = "ready",
  readAt,
  now,
  freshMinutes,
  units = "us",
  thresholds,
  call,
  reason,
  callText,
  sky,
  feelsLikeC,
  sun,
  courtIsLit = false,
  court,
  hourly,
  timeZone,
  locale = "en-US",
  credit,
  label = "Conditions",
  setup,
  className,
}: ConditionsProps) {
  if (status === "not-configured") {
    return (
      <section aria-label={label} className={cx("td-cond", className)}>
        <NotConfigured
          canSetUp={Boolean(setup)}
          compact
          feature="Weather"
          needs="a weather provider"
          setup={setup}
        />
      </section>
    );
  }
  if (status === "loading") {
    return (
      <section
        aria-busy="true"
        aria-label={label}
        className={cx("td-cond", className)}
      >
        <div className="td-cond__top" role="status">
          <span className="td-skel td-cond__skel td-cond__skel--temp" />
          <span className="td-skel td-cond__skel td-cond__skel--call" />
          <span className="td-sr">Loading conditions</span>
        </div>
        <span className="td-skel td-cond__skel td-cond__skel--read" />
      </section>
    );
  }
  if (status === "no-data" || !conditions) {
    return (
      <section aria-label={label} className={cx("td-cond", className)}>
        <p className="td-cond__empty" role="status">
          <Icon name="info" size="inline" />
          No weather for this location yet. Check again closer to play.
        </p>
      </section>
    );
  }

  const view = playCallView(conditions, { thresholds, call, reason });
  const fresh = freshness(readAt, now, freshMinutes);
  const light =
    sun && now !== undefined
      ? lightGlyph(lightMarkFor(conditions.at, { sun, courtIsLit }))
      : null;
  const time = (ms: number) => formatTime(ms, { locale, timeZone });

  return (
    <section
      aria-label={label}
      className={cx("td-cond", className)}
      data-call={view.call}
      data-stale={fresh?.stale ? "" : undefined}
    >
      {fresh?.stale && readAt !== undefined ? (
        <p className="td-cond__stale" role="status">
          <Icon name="clock" size="chip" />
          Read at {time(readAt)}, {fresh.ago}. Conditions may have changed.
        </p>
      ) : null}
      <div className="td-cond__top">
        <div className="td-cond__temp">
          <b>
            {conditions.temperatureC !== undefined
              ? temperatureText(conditions.temperatureC, units)
              : "—"}
          </b>
          <div>
            {light ? (
              <LightMark
                label={
                  sky ? `${sky} · ${LIGHT_GLYPH_LABELS[light]}` : undefined
                }
                state={light}
              />
            ) : sky ? (
              <span className="td-cond__sky">{sky}</span>
            ) : null}
            {feelsLikeC !== undefined ? (
              <small>Feels like {temperatureText(feelsLikeC, units)}</small>
            ) : null}
          </div>
        </div>
        <div
          className="td-cond__call"
          data-call={view.call}
          role={view.call === "stop" ? "alert" : undefined}
        >
          <Icon name={view.icon} size="control" />
          <div>
            <b>
              {view.words}
              {view.reason ? <span>: {view.reason}</span> : null}
            </b>
            {callText ? (
              <span className="td-cond__calltext">{callText}</span>
            ) : null}
          </div>
          <CrestGlyph filled={view.crests} size={24} />
        </div>
      </div>
      <dl className="td-cond__read">
        {readings(conditions, units).map((r) => (
          <div key={r.key}>
            <dt>{r.label}</dt>
            <dd>{r.value}</dd>
          </div>
        ))}
      </dl>
      {hourly && hourly.length > 0 ? (
        <ol aria-label="Next hours" className="td-cond__hourly">
          {hourly.map((h) => (
            <li key={h.at}>
              <span>{time(h.at).replace(":00", "")}</span>
              <b>
                {h.temperatureC !== undefined
                  ? temperatureText(h.temperatureC, units).replace(/[FC]$/, "")
                  : "—"}
              </b>
              <span>
                {h.windSpeedKph !== undefined
                  ? `${Math.round(units === "us" ? kphToMph(h.windSpeedKph) : h.windSpeedKph)} ${units === "us" ? "mph" : "km/h"}`
                  : ""}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      {sun && now !== undefined ? (
        <SunArc locale={locale} now={now} sun={sun} timeZone={timeZone} />
      ) : null}
      {court &&
      conditions.windSpeedKph !== undefined &&
      conditions.windFromDeg !== undefined ? (
        <WindOnCourt
          courtAxisDeg={court.axisDeg}
          endNames={court.endNames}
          gustKph={conditions.windGustKph}
          speedKph={conditions.windSpeedKph}
          units={units}
          windFromDeg={conditions.windFromDeg}
        />
      ) : null}
      {(fresh && !fresh.stale && readAt !== undefined) || credit ? (
        <p className="td-cond__foot">
          {fresh && !fresh.stale && readAt !== undefined
            ? `Read at ${time(readAt)}`
            : null}
          {fresh && !fresh.stale && credit ? " · " : null}
          {credit}
        </p>
      ) : null}
    </section>
  );
}
