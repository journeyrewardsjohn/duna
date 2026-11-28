"use client";

import {
  addDays,
  parseIsoDate,
  toIsoDate,
  weekdayOf,
  type StripDay,
} from "@duna/tideline-core";
import {
  Radio as UiRadio,
  RadioGroup as UiRadioGroup,
} from "@ui-sdk/react/radio";
import {
  type ComponentProps,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { DunaMark } from "../../brand/duna-mark";
import { cx } from "../base/cx";
import { Icon } from "../base/icons";
import { formatIsoDate, type IsoDate } from "../calendar/date-utils";

type UiRadioGroupProps = ComponentProps<typeof UiRadioGroup<string>>;
type GroupProps = Omit<UiRadioGroupProps, "className" | "children" | "render">;

/** A day to show. `StripDay` from `dayStrip()` in `@duna/tideline-core` fits as is. */
export interface DayStripDay {
  date: IsoDate;
  /** Games, sessions or open slots that day; `0` shows an em dash. Omit to show no count. */
  count?: number | null;
  /** Today on the venue's calendar. */
  isToday?: boolean;
  /** Nothing open: faded, still focusable and announced, cannot be chosen. */
  faded?: boolean;
  /** Not offered at all (outside the booking window): skipped by the arrow keys. */
  disabled?: boolean;
}

export interface DayStripProps extends GroupProps {
  className?: string;
  /**
   * The days, usually `dayStrip({ items, timeZone, now }).days` from
   * `@duna/tideline-core`, so dates are the venue's calendar days.
   */
  days?: ReadonlyArray<DayStripDay | StripDay>;
  /** Legacy: the first day shown, as an ISO date (use `days`). */
  start?: IsoDate;
  /** Legacy: how many days to show from `start`. */
  count?: number;
  /** Legacy: days with nothing open (use `faded` on `days`). */
  unavailable?: ReadonlyArray<IsoDate>;
  /** Marks today, as an ISO date, when `days` do not say. */
  today?: IsoDate;
  /** The language of the day names. Fixed by default so servers and browsers agree. */
  locale?: string;
  /** Added to the name of a faded day. */
  unavailableLabel?: string;
  /** Added to the name of today. */
  todayLabel?: string;
  /** The count in words, for screen readers: default "3 games", "no games". */
  countLabel?: (count: number) => string;
  /** The name of the scroll button. */
  moreLabel?: string;
  /** A line under the strip ("Sat 28 Nov · sunset 4:45 PM"). */
  caption?: ReactNode;
}

interface Cell {
  date: IsoDate;
  weekday: number;
  day: number;
  startsMonth: boolean;
  count: number | null;
  today: boolean;
  faded: boolean;
  disabled: boolean;
}

const defaultCountLabel = (count: number): string =>
  count === 0 ? "no games" : count === 1 ? "1 game" : `${count} games`;

function cellsFrom(
  props: Pick<
    DayStripProps,
    "days" | "start" | "count" | "unavailable" | "today"
  >,
): Cell[] {
  const faded = new Set(props.unavailable ?? []);
  const list: ReadonlyArray<DayStripDay | StripDay> =
    props.days ??
    (props.start
      ? Array.from(
          { length: Math.max(0, Math.trunc(props.count ?? 14)) },
          (_, index) => {
            const first = parseIsoDate(props.start as string);
            return {
              date: first
                ? toIsoDate(addDays(first, index))
                : (props.start as string),
            };
          },
        )
      : []);
  return list.map((day, index) => {
    const civil = parseIsoDate(day.date);
    const previous =
      index > 0 ? parseIsoDate(list[index - 1]?.date ?? "") : null;
    const strip = "dayOfMonth" in day ? (day as StripDay) : null;
    const plain = day as DayStripDay;
    return {
      date: day.date,
      weekday: civil ? weekdayOf(civil) : 0,
      day: civil?.day ?? 0,
      startsMonth:
        index === 0 ||
        (civil !== null && previous !== null && civil.month !== previous.month),
      count: strip ? strip.count : (plain.count ?? null),
      today: strip
        ? strip.isToday
        : (plain.isToday ?? day.date === props.today),
      faded: faded.has(day.date) || Boolean(plain.faded),
      disabled: Boolean(plain.disabled),
    };
  });
}

/**
 * Pick a day from a row that scrolls sideways. Each day shows its weekday
 * ("Today" for today), its date and an availability hint (a micro mark and
 * the count, an em dash when there is nothing). The month is named above the
 * first day and wherever a new month starts. The selected day is Night Court
 * with `aria-current="date"`, and it is scrolled into view when it changes.
 *
 * UI SDK Radio: one tab stop, arrow keys move between days. A faded day takes
 * focus and says why but cannot be chosen; a disabled day is skipped.
 * Scroll-snapped; the chevron scrolls on, and hides at the end. Parts: Root,
 * Row, Month, Day, Weekday, Number, Hint, More, Caption.
 */
export function DayStrip(props: DayStripProps) {
  const {
    days,
    start,
    count,
    unavailable,
    today,
    locale = "en",
    unavailableLabel = "nothing open",
    todayLabel = "today",
    countLabel = defaultCountLabel,
    moreLabel = "More days",
    caption,
    className,
    onValueChange,
    value,
    defaultValue,
    ...group
  } = props;
  const cells = cellsFrom({ days, start, count, unavailable, today });
  const showCounts = cells.some((cell) => cell.count !== null);
  const row = useRef<HTMLDivElement>(null);
  const [atEnd, setAtEnd] = useState(true);
  const [inner, setInner] = useState<string | null>(defaultValue ?? null);
  const selected = value !== undefined ? value : inner;

  const checkEnd = useCallback(() => {
    const element = row.current;
    if (!element) return;
    setAtEnd(
      element.scrollLeft + element.clientWidth >= element.scrollWidth - 2,
    );
  }, []);

  useEffect(() => {
    checkEnd();
    const element = row.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(checkEnd);
    observer.observe(element);
    return () => observer.disconnect();
  }, [checkEnd, cells.length]);

  // Keep the selected day in view, without moving the page.
  useEffect(() => {
    const element = row.current;
    if (!element || !selected) return;
    const day = element.querySelector<HTMLElement>(`[data-date="${selected}"]`);
    if (!day) return;
    const left = day.offsetLeft - element.offsetLeft;
    const right = left + day.offsetWidth;
    const reduce =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (left < element.scrollLeft) {
      element.scrollTo({
        left: left - 8,
        behavior: reduce ? "auto" : "smooth",
      });
    } else if (right > element.scrollLeft + element.clientWidth) {
      element.scrollTo({
        left: right - element.clientWidth + 8,
        behavior: reduce ? "auto" : "smooth",
      });
    }
  }, [selected]);

  const blocked = new Set(cells.filter((c) => c.faded).map((c) => c.date));

  return (
    <div className={cx("td-daystrip-root", className)}>
      <div className="td-daystrip__wrap" data-end={atEnd ? "" : undefined}>
        <UiRadioGroup
          className="td-daystrip"
          data-counts={showCounts ? "" : undefined}
          onScroll={checkEnd}
          onValueChange={(value, details) => {
            if (value !== null && blocked.has(value)) {
              details.cancel();
              return;
            }
            setInner(value);
            onValueChange?.(value, details);
          }}
          ref={row}
          {...group}
          value={selected}
        >
          {cells.map((cell) => {
            const name = formatIsoDate(cell.date, locale, {
              weekday: "long",
              month: "long",
              day: "numeric",
            });
            const isSelected = selected === cell.date;
            return (
              <UiRadio
                aria-current={isSelected ? "date" : undefined}
                aria-disabled={cell.faded || undefined}
                aria-label={[
                  name,
                  cell.today ? todayLabel : "",
                  cell.count !== null ? countLabel(cell.count) : "",
                  cell.faded ? unavailableLabel : "",
                ]
                  .filter(Boolean)
                  .join(", ")}
                className="td-day"
                data-date={cell.date}
                data-month-start={cell.startsMonth ? "" : undefined}
                data-today={cell.today ? "" : undefined}
                data-unavailable={cell.faded ? "" : undefined}
                disabled={cell.disabled}
                key={cell.date}
                value={cell.date}
              >
                <span aria-hidden="true" className="td-day__month">
                  {cell.startsMonth
                    ? formatIsoDate(cell.date, locale, { month: "short" })
                    : ""}
                </span>
                <span aria-hidden="true" className="td-day__dow">
                  {cell.today
                    ? "Today"
                    : formatIsoDate(cell.date, locale, { weekday: "short" })}
                </span>
                <b aria-hidden="true" className="td-day__num">
                  {cell.day}
                </b>
                {showCounts ? (
                  <span aria-hidden="true" className="td-day__hint">
                    {cell.count === null || cell.count === 0 || cell.faded ? (
                      "—"
                    ) : (
                      <>
                        <DunaMark decorative micro size={10} />
                        {cell.count}
                      </>
                    )}
                  </span>
                ) : null}
              </UiRadio>
            );
          })}
        </UiRadioGroup>
        {atEnd ? null : (
          <button
            aria-label={moreLabel}
            className="td-daystrip__more"
            onClick={() => {
              const element = row.current;
              if (element) {
                element.scrollBy({
                  left: element.clientWidth * 0.6,
                  behavior: "smooth",
                });
              }
            }}
            tabIndex={-1}
            type="button"
          >
            <Icon name="chevron-right" size="inline" />
          </button>
        )}
      </div>
      {caption ? <p className="td-daystrip__caption">{caption}</p> : null}
    </div>
  );
}
