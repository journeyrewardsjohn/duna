import {
  Radio as UiRadio,
  RadioGroup as UiRadioGroup,
} from "@ui-sdk/react/radio";
import type { ComponentProps } from "react";
import { cx } from "../base/cx";
import { formatTimeLabel, type IsoTime } from "../calendar/date-utils";

type UiRadioGroupProps = ComponentProps<typeof UiRadioGroup<string>>;
type GroupProps = Omit<UiRadioGroupProps, "className" | "children" | "render">;

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
 * Legacy: prefer `TimeSlots`, which groups by daylight, explains every state
 * and never clips. Kept for one release (contract rename rule).
 * Parts: Root, Option, MemberMark.
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
