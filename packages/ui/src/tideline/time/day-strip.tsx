import {
  Radio as UiRadio,
  RadioGroup as UiRadioGroup,
} from "@ui-sdk/react/radio";
import type { ComponentProps } from "react";
import { cx } from "../base/cx";
import {
  dayRange,
  formatIsoDate,
  formatTimeLabel,
  type IsoDate,
  type IsoTime,
} from "../calendar/date-utils";

type UiRadioGroupProps = ComponentProps<typeof UiRadioGroup<string>>;
type GroupProps = Omit<UiRadioGroupProps, "className" | "children" | "render">;

export interface DayStripProps extends GroupProps {
  className?: string;
  /** The first day shown, as an ISO date. */
  start: IsoDate;
  /** How many days to show. */
  count?: number;
  /** Days with nothing open: faded, announced, not selectable. */
  unavailable?: ReadonlyArray<IsoDate>;
  /** Marks today, as an ISO date. Pass it from the caller's clock. */
  today?: IsoDate;
  /** The language of the day names. Fixed by default so servers and browsers agree. */
  locale?: string;
  /** Added to the name of a day that cannot be chosen. */
  unavailableLabel?: string;
  /** Added to the name of today. */
  todayLabel?: string;
}

/**
 * A scrolling row of days to pick one from, for booking and schedules. UI SDK
 * has no day-strip primitive, so this is its Radio: single selection, one tab
 * stop, arrow keys move between days. A day with nothing open is faded and
 * cannot be chosen, but it keeps its place in the arrow-key order and says
 * why, so nobody has to guess what was skipped. The value is an ISO date.
 * Parts: Root, Day, Weekday, Number, Month.
 */
export function DayStrip({
  start,
  count = 14,
  unavailable = [],
  today,
  locale = "en",
  unavailableLabel = "nothing open",
  todayLabel = "today",
  className,
  onValueChange,
  ...props
}: DayStripProps) {
  return (
    <UiRadioGroup
      className={cx("td-daystrip", className)}
      onValueChange={(value, details) => {
        if (value !== null && unavailable.includes(value)) {
          details.cancel();
          return;
        }
        onValueChange?.(value, details);
      }}
      {...props}
    >
      {dayRange(start, count).map((day) => {
        const closed = unavailable.includes(day);
        const name = formatIsoDate(day, locale, {
          weekday: "long",
          month: "long",
          day: "numeric",
        });
        return (
          <UiRadio
            aria-disabled={closed || undefined}
            aria-label={[
              name,
              day === today ? todayLabel : "",
              closed ? unavailableLabel : "",
            ]
              .filter(Boolean)
              .join(", ")}
            className="td-day"
            data-today={day === today ? "" : undefined}
            data-unavailable={closed ? "" : undefined}
            key={day}
            value={day}
          >
            <span aria-hidden="true" className="td-day__dow">
              {formatIsoDate(day, locale, { weekday: "short" })}
            </span>
            <b aria-hidden="true" className="td-day__num">
              {formatIsoDate(day, locale, { day: "numeric" })}
            </b>
            <span aria-hidden="true" className="td-day__mon">
              {formatIsoDate(day, locale, { month: "short" })}
            </span>
          </UiRadio>
        );
      })}
    </UiRadioGroup>
  );
}

export interface TimeSlot {
  /** The slot's start, as 24-hour `HH:MM`. */
  time: IsoTime;
  /** `unavailable` is taken or closed; `member` carries the member-price mark. */
  state?: "available" | "unavailable" | "member";
}

export interface TimeSlotGridProps extends GroupProps {
  className?: string;
  slots: ReadonlyArray<TimeSlot | IsoTime>;
  locale?: string;
  /** Forces a 12 or 24 hour clock; the locale decides otherwise. */
  hourCycle?: 12 | 24;
  /** What the member mark means, for screen readers. */
  memberLabel?: string;
}

/**
 * Pick one start time from the slots on offer. UI SDK Radio again: single
 * selection with arrow keys; unavailable slots are skipped. Use `TimePicker`
 * when any time may be typed. Parts: Root, Option, MemberMark.
 */
export function TimeSlotGrid({
  slots,
  locale = "en",
  hourCycle,
  memberLabel = "Member price",
  className,
  ...props
}: TimeSlotGridProps) {
  return (
    <UiRadioGroup className={cx("td-slotgrid", className)} {...props}>
      {slots.map((slot) => {
        const item: TimeSlot = typeof slot === "string" ? { time: slot } : slot;
        return (
          <UiRadio
            className="td-tslot"
            data-member={item.state === "member" ? "" : undefined}
            disabled={item.state === "unavailable"}
            key={item.time}
            value={item.time}
          >
            {formatTimeLabel(item.time, locale, hourCycle)}
            {item.state === "member" ? (
              <span className="td-tslot__member">
                <span className="td-sr">, {memberLabel}</span>
              </span>
            ) : null}
          </UiRadio>
        );
      })}
    </UiRadioGroup>
  );
}
