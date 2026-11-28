"use client";

import { Button, RallyOnChange } from "@duna/ui/tideline";
import {
  clock,
  clockRange,
  money,
  nowAndNext,
  type ItemPerson,
  type ScheduleItem,
} from "./schedule-model";

/**
 * The front desk's strip for today: what is on court now, what starts in
 * the next hour, who has not checked in (one tap, with Undo), and unpaid
 * bookings. Hidden on other days.
 */
export function NowAndNextStrip({
  items,
  nowMs,
  canCheckIn,
  onOpen,
  onCheckIn,
}: {
  readonly items: readonly ScheduleItem[];
  readonly nowMs: number;
  readonly canCheckIn: (item: ScheduleItem) => boolean;
  readonly onOpen: (item: ScheduleItem) => void;
  readonly onCheckIn: (item: ScheduleItem, person: ItemPerson) => void;
}) {
  const strip = nowAndNext(items, nowMs);
  const column = (
    title: string,
    count: number,
    body: React.ReactNode,
    empty: string,
  ) => (
    <section aria-label={title} className="sch-now__col">
      <h2>
        {title} ·{" "}
        <RallyOnChange value={count}>
          <span className="sch-now__count">{count}</span>
        </RallyOnChange>
      </h2>
      {count === 0 ? <p className="sch-quiet">{empty}</p> : body}
    </section>
  );
  const itemRow = (item: ScheduleItem) => (
    <li className="sch-now__row" key={`${item.source}:${item.id}`}>
      <button className="sch-link" onClick={() => onOpen(item)} type="button">
        {item.courtName ? `${item.courtName} · ` : ""}
        {item.title}
      </button>
      <span className="sch-time">
        {clockRange(item.startsAt, item.endsAt, item.timeZone)}
      </span>
    </li>
  );
  return (
    <section
      aria-label="Now and next"
      className="sch-now"
      data-testid="now-next"
    >
      {column(
        "On court now",
        strip.onNow.length,
        <ul className="sch-now__list">{strip.onNow.map(itemRow)}</ul>,
        "Nothing on court right now.",
      )}
      {column(
        "In the next hour",
        strip.next.length,
        <ul className="sch-now__list">{strip.next.map(itemRow)}</ul>,
        "Nothing starts in the next hour.",
      )}
      {column(
        "Not checked in",
        strip.notCheckedIn.length,
        <ul className="sch-now__list">
          {strip.notCheckedIn.slice(0, 6).map(({ item, person }) => (
            <li className="sch-now__row" key={`${item.id}:${person.id}`}>
              <span>
                {person.name}
                <span className="sch-time">
                  {" "}
                  · {clock(item.startsAt, item.timeZone)}
                </span>
              </span>
              {canCheckIn(item) ? (
                <Button
                  aria-label={`Check in ${person.name} for ${item.title}`}
                  onClick={() => onCheckIn(item, person)}
                  size="sm"
                  variant="secondary"
                >
                  Check in
                </Button>
              ) : null}
            </li>
          ))}
          {strip.notCheckedIn.length > 6 ? (
            <li className="sch-quiet">
              And {strip.notCheckedIn.length - 6} more on the list below.
            </li>
          ) : null}
        </ul>,
        "Everyone due is checked in.",
      )}
      {column(
        "Unpaid",
        strip.unpaid.length,
        <ul className="sch-now__list">
          {strip.unpaid.map((item) => (
            <li className="sch-now__row" key={item.id}>
              <button
                className="sch-link"
                onClick={() => onOpen(item)}
                type="button"
              >
                {item.who ?? item.title}
              </button>
              <span className="sch-time">
                {money(
                  (item.amountMinor ?? 0) - (item.paidMinor ?? 0),
                  item.currency,
                )}{" "}
                due
              </span>
            </li>
          ))}
        </ul>,
        "No unpaid bookings now.",
      )}
    </section>
  );
}
