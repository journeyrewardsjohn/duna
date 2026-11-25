"use client";

import {
  Calendar as UiCalendar,
  CalendarDay as UiCalendarDay,
  CalendarGrid as UiCalendarGrid,
  CalendarHeading as UiCalendarHeading,
  CalendarNext as UiCalendarNext,
  CalendarPrevious as UiCalendarPrevious,
  CalendarWeekday as UiCalendarWeekday,
  CalendarWeekdays as UiCalendarWeekdays,
  CalendarWeeks as UiCalendarWeeks,
} from "@ui-sdk/react/calendar";
import {
  DatePicker as UiDatePicker,
  DatePickerContent as UiDatePickerContent,
  DatePickerInput as UiDatePickerInput,
  DatePickerTrigger as UiDatePickerTrigger,
} from "@ui-sdk/react/date-picker";
import { TimeInput as UiTimeInput } from "@ui-sdk/react/time-input";
import type { ComponentProps } from "react";
import { cx } from "./cx";
import { Icon } from "./icons";

interface CalendarPartsProps {
  months?: number;
  previousLabel?: string;
  nextLabel?: string;
}

/** The month view's parts, shared by Calendar and the date pickers. */
function CalendarParts({
  months = 1,
  previousLabel = "Previous month",
  nextLabel = "Next month",
}: CalendarPartsProps) {
  return (
    <>
      <div className="td-calendar__head">
        <UiCalendarPrevious
          aria-label={previousLabel}
          className="td-iconbtn td-iconbtn--sm td-calendar__nav"
        >
          <Icon name="chevron-left" />
        </UiCalendarPrevious>
        <UiCalendarHeading className="td-calendar__heading" />
        <UiCalendarNext
          aria-label={nextLabel}
          className="td-iconbtn td-iconbtn--sm td-calendar__nav"
        >
          <Icon name="chevron-right" />
        </UiCalendarNext>
      </div>
      <div className="td-calendar__months">
        {Array.from({ length: Math.max(1, months) }, (_, offset) => (
          <UiCalendarGrid
            className="td-calendar__grid"
            key={offset}
            offset={offset}
          >
            <UiCalendarWeekdays>
              {(index) => (
                <UiCalendarWeekday
                  className="td-calendar__weekday"
                  index={index}
                  key={index}
                />
              )}
            </UiCalendarWeekdays>
            <UiCalendarWeeks>
              {(cell) => (
                <UiCalendarDay
                  className="td-calendar__day"
                  key={cell.date}
                  value={cell.date}
                />
              )}
            </UiCalendarWeeks>
          </UiCalendarGrid>
        ))}
      </div>
    </>
  );
}

export interface CalendarProps
  extends
    Omit<ComponentProps<typeof UiCalendar>, "className" | "children">,
    Omit<CalendarPartsProps, "months"> {
  className?: string;
}

/**
 * A month grid for one date, several dates or a range (`mode`). UI SDK
 * Calendar: one tab stop, arrow keys by day and week, Page keys by month,
 * Home and End by week, Enter or Space to select. Values are ISO dates.
 */
export function Calendar({
  className,
  previousLabel,
  nextLabel,
  ...props
}: CalendarProps) {
  return (
    <UiCalendar className={cx("td-calendar", className)} {...props}>
      <CalendarParts
        months={props.months}
        nextLabel={nextLabel}
        previousLabel={previousLabel}
      />
    </UiCalendar>
  );
}

type UiDatePickerProps = ComponentProps<typeof UiDatePicker>;
type DatePickerChangeDetails = Parameters<
  NonNullable<UiDatePickerProps["onValueChange"]>
>[1];

interface PickerShared
  extends
    Omit<
      UiDatePickerProps,
      | "className"
      | "children"
      | "mode"
      | "value"
      | "defaultValue"
      | "onValueChange"
    >,
    Omit<CalendarPartsProps, "months"> {
  className?: string;
  /** The name of the button that opens the calendar. */
  triggerLabel?: string;
}

export interface DatePickerProps extends PickerShared {
  /** An ISO date, or `null` when empty. */
  value?: string | null;
  defaultValue?: string | null;
  onValueChange?: (
    value: string | null,
    details: DatePickerChangeDetails,
  ) => void;
  /** Names the input when the picker is not inside a `Field`. */
  "aria-label"?: string;
}

/**
 * Type a date or choose one from a calendar. UI SDK Date Picker: Alt+Down
 * opens the calendar from the input, the calendar takes focus on the selected
 * date, and Escape returns focus to the field.
 */
export function DatePicker({
  className,
  triggerLabel = "Choose date",
  previousLabel,
  nextLabel,
  "aria-label": ariaLabel,
  value,
  defaultValue,
  onValueChange,
  ...props
}: DatePickerProps) {
  return (
    <UiDatePicker
      className={cx("td-datepicker", className)}
      defaultValue={defaultValue}
      mode="single"
      onValueChange={(next, details) => {
        onValueChange?.(typeof next === "string" ? next : null, details);
      }}
      value={value}
      {...props}
    >
      <UiDatePickerInput
        aria-label={ariaLabel}
        className="td-input td-datepicker__input"
      />
      <UiDatePickerTrigger
        aria-label={triggerLabel}
        className="td-datepicker__trigger"
      >
        <Icon name="calendar" />
      </UiDatePickerTrigger>
      <UiDatePickerContent
        className="td-popup td-datepicker__content"
        sideOffset={6}
      >
        <CalendarParts
          months={props.months}
          nextLabel={nextLabel}
          previousLabel={previousLabel}
        />
      </UiDatePickerContent>
    </UiDatePicker>
  );
}

export type DateRange = [start: string, end: string];

export interface DateRangePickerProps extends PickerShared {
  /** `[start, end]` as ISO dates, or `null` when empty. */
  value?: DateRange | null;
  defaultValue?: DateRange | null;
  onValueChange?: (
    value: DateRange | null,
    details: DatePickerChangeDetails,
  ) => void;
  /** The name of the first input. */
  startLabel?: string;
  /** The name of the second input. */
  endLabel?: string;
}

function isDateRange(value: unknown): value is DateRange {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "string" &&
    typeof value[1] === "string"
  );
}

/**
 * A start and an end date, typed or picked. UI SDK Date Picker in range mode:
 * the first press sets the start, the second the end, and Escape drops an
 * unfinished range before it closes the popup.
 */
export function DateRangePicker({
  className,
  triggerLabel = "Choose dates",
  startLabel = "Start date",
  endLabel = "End date",
  previousLabel,
  nextLabel,
  value,
  defaultValue,
  onValueChange,
  ...props
}: DateRangePickerProps) {
  return (
    <UiDatePicker
      className={cx("td-datepicker td-datepicker--range", className)}
      defaultValue={defaultValue}
      mode="range"
      onValueChange={(next, details) => {
        onValueChange?.(isDateRange(next) ? next : null, details);
      }}
      value={value}
      {...props}
    >
      <UiDatePickerInput
        aria-label={startLabel}
        className="td-input td-datepicker__input"
      />
      <span aria-hidden="true" className="td-datepicker__to">
        to
      </span>
      <UiDatePickerInput
        aria-label={endLabel}
        className="td-input td-datepicker__input"
        end
      />
      <UiDatePickerTrigger
        aria-label={triggerLabel}
        className="td-datepicker__trigger"
      >
        <Icon name="calendar" />
      </UiDatePickerTrigger>
      <UiDatePickerContent
        className="td-popup td-datepicker__content"
        sideOffset={6}
      >
        <CalendarParts
          months={props.months}
          nextLabel={nextLabel}
          previousLabel={previousLabel}
        />
      </UiDatePickerContent>
    </UiDatePicker>
  );
}

export interface TimePickerProps extends Omit<
  ComponentProps<typeof UiTimeInput>,
  "className"
> {
  className?: string;
}

/**
 * A time typed one part at a time, on the locale's clock. UI SDK Time Input:
 * arrow keys step each part, and the value is always 24-hour `HH:MM`.
 */
export function TimePicker({ className, ...props }: TimePickerProps) {
  return (
    <UiTimeInput
      className={cx("td-input td-timeinput", className)}
      {...props}
    />
  );
}
