import {
  Radio as UiRadio,
  RadioGroup as UiRadioGroup,
} from "@ui-sdk/react/radio";
import type { ComponentProps } from "react";
import { cx } from "./cx";
import {
  dayRange,
  formatIsoDate,
  formatTimeLabel,
  type IsoDate,
  type IsoTime,
  parseIsoDate,
} from "./date-utils";

type UiRadioGroupProps = ComponentProps<typeof UiRadioGroup<string>>;
type GroupProps = Omit<UiRadioGroupProps, "className" | "children" | "render">;

export interface DayStripProps extends GroupProps {
  className?: string;
  /** The first day shown, as an ISO date. */
  start: IsoDate;
  /** How many days to show. */
  count?: number;
  /** Days that cannot be chosen. */
  unavailable?: ReadonlyArray<IsoDate>;
  /** Marks today, as an ISO date. Pass it from the caller's clock. */
  today?: IsoDate;
  /** The language of the day names. Fixed by default so servers and browsers agree. */
  locale?: string;
}

/**
 * A scrolling row of days to pick one from, for booking and schedules. UI SDK
 * has no day-strip primitive, so this is its Radio: single selection, one tab
 * stop, arrow keys move and select, unavailable days are skipped. The value
 * is an ISO date. Parts: Root, Day, Weekday, Number, Month.
 */
export function DayStrip({
  start,
  count = 7,
  unavailable = [],
  today,
  locale = "en",
  className,
  ...props
}: DayStripProps) {
  return (
    <UiRadioGroup className={cx("td-daystrip", className)} {...props}>
      {dayRange(start, count).map((day, index) => (
        <UiRadio
          aria-label={formatIsoDate(day, locale, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
          className="td-day"
          data-today={day === today ? "" : undefined}
          disabled={unavailable.includes(day)}
          key={day}
          value={day}
        >
          <span aria-hidden="true" className="td-day__dow">
            {formatIsoDate(day, locale, { weekday: "short" })}
          </span>
          <b aria-hidden="true" className="td-day__num">
            {formatIsoDate(day, locale, { day: "numeric" })}
          </b>
          {/* The month shows where it starts, and on the first day. */}
          {index === 0 || parseIsoDate(day)?.day === 1 ? (
            <span aria-hidden="true" className="td-day__mon">
              {formatIsoDate(day, locale, { month: "short" })}
            </span>
          ) : null}
        </UiRadio>
      ))}
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
