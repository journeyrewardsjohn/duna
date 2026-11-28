"use client";

import {
  dayLightMinutes,
  dstTransition,
  railModel,
  wallClockMinutes,
  zonedTimeToInstant,
  type SunTimes,
} from "@duna/tideline-core";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { cx } from "../base/cx";
import { Icon } from "../base/icons";
import { LightMark } from "../conditions/light-mark";
import {
  civilDate,
  minuteLabel,
  minuteRangeLabel,
  type VenueDate,
} from "./time-format";
import { TimeZoneNote } from "./zone-note";

export interface TimeRailEvent {
  id: string;
  /** Wall-clock minutes after the venue's midnight. */
  startMinute: number;
  endMinute: number;
  title: string;
  /** A short line under the title ("Court 3 · 7 of 9"). */
  meta?: string;
  /** `blocked` is hatched (maintenance, closed); the rest are bookings. */
  kind?: "booking" | "lesson" | "event" | "blocked";
  href?: string;
}

export interface TimeRailProps {
  /** Names the rail ("Court 3, Saturday 28 November"). */
  label: string;
  /** First and last wall-clock minute shown (opening hours). */
  startMinute: number;
  endMinute: number;
  events: ReadonlyArray<TimeRailEvent>;
  date: VenueDate;
  timeZone: string;
  viewerTimeZone?: string;
  /**
   * "Now" (epoch ms) from the caller's clock; the line then moves every 30
   * seconds on its own. Omit for a day that is not today.
   */
  now?: number | null;
  sun?: SunTimes | null;
  /** Gaps shorter than this are not offered as free. Default 30 minutes. */
  minFreeMinutes?: number;
  /** Makes each free window a button ("Book 2:00 – 3:30 PM"). */
  onSelectFree?: (window: { startMinute: number; endMinute: number }) => void;
  onSelectEvent?: (event: TimeRailEvent) => void;
  /** Pixels per hour. Default 56. */
  hourHeight?: number;
  locale?: string;
  /** Shown when the day has no events. */
  empty?: ReactNode;
  className?: string;
}

/** Ticks a caller-given "now" forward on the device clock, every 30 s. */
function useMovingNow(initial: number | null | undefined): number | null {
  const [state, setState] = useState<{ base: number | null; offset: number }>({
    base: initial ?? null,
    offset: 0,
  });
  useEffect(() => {
    if (initial == null) {
      setState({ base: null, offset: 0 });
      return;
    }
    const startedAt = Date.now();
    setState({ base: initial, offset: 0 });
    const timer = setInterval(() => {
      setState({ base: initial, offset: Date.now() - startedAt });
    }, 30_000);
    return () => clearInterval(timer);
  }, [initial]);
  return state.base === null ? null : state.base + state.offset;
}

/**
 * The venue's day as a vertical rail: hours down the side, events as blocks
 * (overlaps side by side), free windows outlined, a "now" line that moves,
 * sunrise, golden hour and sunset marked with their light, and the
 * daylight-saving change when the day has one. Wall-clock minutes on the
 * venue's clock. Screen readers get the same day as an ordered list.
 * Parts: Root, Head, Hours, Track, Event, Free, Now, Sun, Note.
 */
export function TimeRail({
  label,
  startMinute,
  endMinute,
  events,
  date,
  timeZone,
  viewerTimeZone,
  now,
  sun,
  minFreeMinutes,
  onSelectFree,
  onSelectEvent,
  hourHeight = 56,
  locale = "en-US",
  empty,
  className,
}: TimeRailProps) {
  const civil = civilDate(date);
  const moving = useMovingNow(now);
  const nowMinute =
    moving === null ? null : wallClockMinutes(moving, civil, timeZone);
  const light = useMemo(
    () => (sun ? dayLightMinutes(sun, civil, timeZone) : null),
    [sun, civil.year, civil.month, civil.day, timeZone],
  );
  const model = railModel({
    startMinute,
    endMinute,
    events,
    nowMinute,
    light,
    minFreeMinutes,
  });
  const dst = dstTransition(civil, timeZone);
  const height = ((model.endMinute - model.startMinute) / 60) * hourHeight;
  const pos = (at: number): CSSProperties => ({ top: `${at * 100}%` });
  const placed = (top: number, size: number): CSSProperties => ({
    top: `${top * 100}%`,
    height: `${size * 100}%`,
  });

  type Entry =
    | { kind: "event"; minute: number; item: (typeof model.events)[number] }
    | { kind: "free"; minute: number; item: (typeof model.free)[number] };
  const entries: Entry[] = [
    ...model.events.map((item) => ({
      kind: "event" as const,
      minute: item.startMinute,
      item,
    })),
    ...model.free.map((item) => ({
      kind: "free" as const,
      minute: item.startMinute,
      item,
    })),
  ].sort((a, b) => a.minute - b.minute);

  return (
    <section aria-label={label} className={cx("td-rail", className)}>
      <div className="td-rail__head">
        {viewerTimeZone ? (
          <TimeZoneNote
            at={zonedTimeToInstant(civil, 12 * 60, timeZone)}
            locale={locale}
            timeZone={timeZone}
            viewerTimeZone={viewerTimeZone}
          />
        ) : null}
        {events.length === 0 && empty ? (
          <div className="td-rail__empty">{empty}</div>
        ) : null}
      </div>
      <div className="td-rail__body" style={{ height: `${height}px` }}>
        <div aria-hidden="true" className="td-rail__hours">
          {model.hours.map((h) => (
            <span className="td-rail__hour" key={h.minute} style={pos(h.at)}>
              {minuteLabel(h.minute, locale)}
            </span>
          ))}
        </div>
        <div
          className="td-rail__track"
          style={
            {
              "--td-rail-hour": `${hourHeight}px`,
              backgroundPositionY: `${(((60 - (model.startMinute % 60)) % 60) / 60) * hourHeight}px`,
            } as CSSProperties
          }
        >
          {model.goldenHour && model.sunset ? (
            <span
              aria-hidden="true"
              className="td-rail__golden"
              style={placed(
                model.goldenHour.at,
                model.sunset.at - model.goldenHour.at,
              )}
            />
          ) : null}
          <ol className="td-rail__list">
            {entries.map((entry) => {
              if (entry.kind === "free") {
                const range = minuteRangeLabel(
                  entry.item.startMinute,
                  entry.item.endMinute,
                  locale,
                );
                return (
                  <li
                    className="td-rail__free"
                    key={`free-${entry.item.startMinute}`}
                    style={placed(entry.item.top, entry.item.height)}
                  >
                    {onSelectFree ? (
                      <button
                        className="td-rail__freebtn"
                        onClick={() =>
                          onSelectFree({
                            startMinute: entry.item.startMinute,
                            endMinute: entry.item.endMinute,
                          })
                        }
                        type="button"
                      >
                        <Icon name="plus" size="chip" />
                        <span>Free {range}</span>
                      </button>
                    ) : (
                      <span className="td-rail__freetext">Free {range}</span>
                    )}
                  </li>
                );
              }
              const { event, lane, lanes } = entry.item;
              const range = minuteRangeLabel(
                event.startMinute,
                event.endMinute,
                locale,
              );
              const style: CSSProperties = {
                ...placed(entry.item.top, entry.item.height),
                left: `calc(${(lane / lanes) * 100}% + 2px)`,
                width: `calc(${100 / lanes}% - 4px)`,
              };
              const body = (
                <>
                  <b className="td-rail__title">{event.title}</b>
                  <span className="td-rail__meta">
                    {range}
                    {event.meta ? ` · ${event.meta}` : ""}
                  </span>
                </>
              );
              return (
                <li
                  className="td-rail__event"
                  data-kind={event.kind ?? "booking"}
                  key={event.id}
                  style={style}
                >
                  {event.href ? (
                    <a className="td-rail__eventbody" href={event.href}>
                      {body}
                    </a>
                  ) : onSelectEvent ? (
                    <button
                      className="td-rail__eventbody"
                      onClick={() => onSelectEvent(event)}
                      type="button"
                    >
                      {body}
                    </button>
                  ) : (
                    <span className="td-rail__eventbody">{body}</span>
                  )}
                </li>
              );
            })}
          </ol>
          {model.sunrise ? (
            <span className="td-rail__sun" style={pos(model.sunrise.at)}>
              <LightMark
                className="td-rail__marklabel"
                label="Sunrise"
                state="first-light"
                time={minuteLabel(model.sunrise.minute, locale)}
              />
            </span>
          ) : null}
          {model.sunset ? (
            <span className="td-rail__sun" style={pos(model.sunset.at)}>
              <LightMark
                className="td-rail__marklabel"
                label="Sunset"
                state="under-lights"
                time={minuteLabel(model.sunset.minute, locale)}
              />
            </span>
          ) : null}
          {dst &&
          dst.atMinute >= model.startMinute &&
          dst.atMinute <= model.endMinute ? (
            <span
              className="td-rail__dst"
              style={pos(
                (dst.atMinute - model.startMinute) /
                  (model.endMinute - model.startMinute),
              )}
            >
              <span className="td-rail__marklabel">
                <Icon name="clock" size="chip" />
                {dst.kind === "spring-forward"
                  ? "Clocks go forward"
                  : "Clocks go back"}{" "}
                {dst.shiftMinutes === 60 ? "1 h" : `${dst.shiftMinutes} min`}
              </span>
            </span>
          ) : null}
          {model.now ? (
            <span className="td-rail__now" style={pos(model.now.at)}>
              <span className="td-rail__nowlabel">
                Now {minuteLabel(model.now.minute, locale)}
              </span>
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}
