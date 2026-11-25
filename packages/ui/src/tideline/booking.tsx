"use client";

import {
  Radio as UiRadio,
  RadioGroup as UiRadioGroup,
} from "@ui-sdk/react/radio";
import {
  type ComponentProps,
  type CSSProperties,
  type ReactNode,
  useId,
  useState,
} from "react";
import { Avatar } from "./avatar";
import { Button } from "./button";
import { cx } from "./cx";
import { Icon } from "./icons";

type UiRadioGroupProps = ComponentProps<typeof UiRadioGroup<string>>;
type GroupProps = Omit<UiRadioGroupProps, "className" | "children" | "render">;

export interface ChoiceCardGroupProps extends GroupProps {
  className?: string;
  /** How many cards sit side by side on a wide screen. */
  columns?: number;
  children: ReactNode;
}

/**
 * One choice from a few explained options, as cards. UI SDK Radio: a single
 * tab stop, arrow keys move and select. Name it with `aria-labelledby`.
 */
export function ChoiceCardGroup({
  className,
  columns = 3,
  children,
  ...props
}: ChoiceCardGroupProps) {
  return (
    <UiRadioGroup
      className={cx("td-choices", className)}
      style={{ "--td-choice-columns": columns } as CSSProperties}
      {...props}
    >
      {children}
    </UiRadioGroup>
  );
}

export interface PriceChoiceCardProps {
  value: string;
  title: ReactNode;
  /** Who and how long, like "1 athlete · 60 min". */
  meta?: ReactNode;
  /** The price, already formatted. */
  price: ReactNode;
  /** What the price is for, like "per session". */
  unit?: ReactNode;
  disabled?: boolean;
  className?: string;
}

/** A choice with a title, a line of detail and a price. */
export function PriceChoiceCard({
  value,
  title,
  meta,
  price,
  unit,
  disabled,
  className,
}: PriceChoiceCardProps) {
  return (
    <UiRadio
      className={cx("td-choice", className)}
      disabled={disabled}
      value={value}
    >
      <span className="td-choice__title">{title}</span>
      {meta ? <span className="td-choice__meta">{meta}</span> : null}
      <span className="td-choice__price">
        <b>{price}</b>
        {unit ? <span className="td-choice__unit"> {unit}</span> : null}
      </span>
    </UiRadio>
  );
}

export interface CoachOption {
  id: string;
  name: string;
  /** One line about them, like a certification. */
  credential?: string;
  avatarUrl?: string;
}

export interface CoachPickerProps extends GroupProps {
  className?: string;
  coaches: ReadonlyArray<CoachOption>;
  /** The value of the "any coach" option. Leave it out to hide that option. */
  anyValue?: string;
  anyLabel?: string;
  anyDetail?: (count: number) => string;
}

/**
 * Choose a coach, or any coach. Photo avatars fall back to initials. UI SDK
 * Radio: single selection with arrow keys.
 */
export function CoachPicker({
  coaches,
  anyValue,
  anyLabel = "Any coach",
  anyDetail = (count) => `${count} ${count === 1 ? "coach" : "coaches"}`,
  className,
  ...props
}: CoachPickerProps) {
  return (
    <UiRadioGroup className={cx("td-coaches", className)} {...props}>
      {anyValue === undefined ? null : (
        <UiRadio className="td-coach" value={anyValue}>
          <span className="td-coach__faces">
            {coaches.slice(0, 2).map((coach) => (
              <Avatar
                decorative
                key={coach.id}
                name={coach.name}
                src={coach.avatarUrl}
              />
            ))}
          </span>
          <span className="td-coach__text">
            <span className="td-coach__name">{anyLabel}</span>
            <span className="td-coach__detail">
              {anyDetail(coaches.length)}
            </span>
          </span>
        </UiRadio>
      )}
      {coaches.map((coach) => (
        <UiRadio className="td-coach" key={coach.id} value={coach.id}>
          <span className="td-coach__faces">
            <Avatar decorative name={coach.name} src={coach.avatarUrl} />
          </span>
          <span className="td-coach__text">
            <span className="td-coach__name">{coach.name}</span>
            {coach.credential ? (
              <span className="td-coach__detail">{coach.credential}</span>
            ) : null}
          </span>
        </UiRadio>
      ))}
    </UiRadioGroup>
  );
}

export interface SlotOption {
  id: string;
  /** The time range, already formatted, like "3:00–4:00pm". */
  time: string;
  coach?: { name: string; avatarUrl?: string };
  status: "available" | "booked";
}

export interface SlotListProps extends GroupProps {
  className?: string;
  slots: ReadonlyArray<SlotOption>;
  /** Shows skeleton cards in place of the slots. */
  loading?: boolean;
  /** How many skeleton cards to show while loading. */
  skeletonCount?: number;
  /** Shown when the day has no sessions at all. */
  emptyText?: ReactNode;
  labels?: { available: string; booked: string; loading: string };
}

/**
 * A day's sessions as cards: available, booked, selected, or loading. Booked
 * sessions stay visible, faded, and cannot be chosen. UI SDK Radio: single
 * selection with arrow keys. `TimeSlotGrid` is the dense variant.
 */
export function SlotList({
  slots,
  loading = false,
  skeletonCount = 2,
  emptyText = "No sessions on this day.",
  labels = {
    available: "Available",
    booked: "Booked",
    loading: "Loading sessions",
  },
  className,
  ...props
}: SlotListProps) {
  if (loading) {
    return (
      <div className={cx("td-slotlist", className)} role="status">
        <span className="td-sr">{labels.loading}</span>
        {Array.from({ length: skeletonCount }, (_, index) => (
          <span
            aria-hidden="true"
            className="td-slotcard td-slotcard--loading"
            key={index}
          >
            <span className="td-skel td-slotcard__bone" />
            <span className="td-skel td-slotcard__bone td-slotcard__bone--short" />
            <span className="td-skel td-slotcard__bone td-slotcard__bone--short" />
          </span>
        ))}
      </div>
    );
  }
  if (slots.length === 0) {
    return <p className="td-slotlist__empty">{emptyText}</p>;
  }
  return (
    <UiRadioGroup className={cx("td-slotlist", className)} {...props}>
      {slots.map((slot) => (
        <UiRadio
          className="td-slotcard"
          data-status={slot.status}
          disabled={slot.status === "booked"}
          key={slot.id}
          value={slot.id}
        >
          <span className="td-slotcard__time">{slot.time}</span>
          {slot.coach ? (
            <span className="td-slotcard__coach">
              <Avatar
                decorative
                name={slot.coach.name}
                size="xs"
                src={slot.coach.avatarUrl}
              />
              {slot.coach.name}
            </span>
          ) : null}
          <span className="td-slotcard__status">
            {slot.status === "booked" ? labels.booked : labels.available}
          </span>
        </UiRadio>
      ))}
    </UiRadioGroup>
  );
}

export interface BookingSummaryItem {
  id: string;
  name: ReactNode;
  detail?: ReactNode;
  /** Already formatted. */
  price: ReactNode;
}

export interface BookingSummaryProps {
  title?: ReactNode;
  items: ReadonlyArray<BookingSummaryItem>;
  /** A row for an optional extra, usually a Switch or Checkbox. */
  addOn?: ReactNode;
  totalLabel?: ReactNode;
  /** Already formatted. */
  total: ReactNode;
  actionLabel: ReactNode;
  /** Runs the action. Return a Promise to show the loading state. */
  onAction: () => unknown;
  loading?: boolean;
  /** Why the action is not available yet. Setting it disables the action. */
  disabledReason?: string;
  /** A line of reassurance under the action. */
  trustLine?: ReactNode;
  /** The names of the button that opens the details on a phone. */
  showDetailsLabel?: string;
  hideDetailsLabel?: string;
  className?: string;
}

/**
 * What is being bought and what it costs, with the one primary action. On a
 * wide screen it is a panel to keep in view (make it sticky in the layout).
 * Below 900px it becomes a bar fixed to the bottom with the total and the
 * action; a button expands it to the full summary. The reason the action is
 * disabled is shown and tied to the button for screen readers.
 */
export function BookingSummary({
  title = "Summary",
  items,
  addOn,
  totalLabel = "Total due today",
  total,
  actionLabel,
  onAction,
  loading = false,
  disabledReason,
  trustLine,
  showDetailsLabel = "Show summary",
  hideDetailsLabel = "Hide summary",
  className,
}: BookingSummaryProps) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const reasonId = useId();
  return (
    <aside
      aria-label={typeof title === "string" ? title : undefined}
      className={cx("td-summary", className)}
      data-expanded={expanded ? "" : undefined}
    >
      <div className="td-summary__details" id={detailsId}>
        <h2 className="td-summary__title">{title}</h2>
        <ul className="td-summary__items">
          {items.map((item) => (
            <li className="td-summary__item" key={item.id}>
              <span className="td-summary__name">{item.name}</span>
              <span className="td-summary__price">{item.price}</span>
              {item.detail ? (
                <span className="td-summary__detail">{item.detail}</span>
              ) : null}
            </li>
          ))}
        </ul>
        {addOn ? <div className="td-summary__addon">{addOn}</div> : null}
      </div>
      <div className="td-summary__total">
        <span className="td-summary__total-label">{totalLabel}</span>
        <b className="td-summary__total-value">{total}</b>
        <button
          aria-controls={detailsId}
          aria-expanded={expanded}
          className="td-summary__toggle"
          onClick={() => setExpanded((open) => !open)}
          type="button"
        >
          {expanded ? hideDetailsLabel : showDetailsLabel}
          <Icon name="chevron-down" size="sm" />
        </button>
      </div>
      <div className="td-summary__action">
        <Button
          aria-describedby={disabledReason ? reasonId : undefined}
          block
          disabled={Boolean(disabledReason)}
          focusableWhenDisabled
          loading={loading}
          onClick={onAction}
          size="lg"
          variant="primary"
        >
          {actionLabel}
        </Button>
        <p className="td-summary__reason" id={reasonId} role="status">
          {disabledReason ?? ""}
        </p>
      </div>
      {trustLine ? <p className="td-summary__trust">{trustLine}</p> : null}
    </aside>
  );
}
