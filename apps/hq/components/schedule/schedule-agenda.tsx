"use client";

import { DayStrip, EmptyState } from "@duna/ui/tideline";
import { addCalendarDays } from "@duna/scheduling";
import {
  clockRange,
  isLive,
  onDay,
  placeDay,
  type ScheduleItem,
} from "./schedule-model";
import { GroupChip, itemLabel, KindIcon, kindWords } from "./schedule-parts";

/**
 * The agenda: the day as a list, in time order, with a day strip to change
 * day. It is the accessible alternative to the grid and the phone's
 * default view (a squeezed grid helps nobody at 375 px).
 */
export function ScheduleAgenda({
  date,
  today,
  timeZone,
  items,
  nowMs,
  auto,
  onDate,
  onOpen,
  empty,
}: {
  readonly date: string;
  readonly today: string;
  readonly timeZone: string;
  readonly items: readonly ScheduleItem[];
  readonly nowMs: number;
  readonly auto: boolean;
  readonly onDate: (date: string) => void;
  readonly onOpen: (item: ScheduleItem) => void;
  readonly empty: React.ReactNode;
}) {
  const start = addCalendarDays(date, -3);
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = addCalendarDays(start, index);
    const place = placeDay(day, timeZone);
    return {
      date: day,
      isToday: day === today,
      count: items.filter((item) => !item.cancelled && onDay(item, place))
        .length,
    };
  });
  const day = placeDay(date, timeZone);
  const rows = items
    .filter((item) => onDay(item, day))
    .sort(
      (left, right) =>
        Date.parse(left.startsAt) - Date.parse(right.startsAt) ||
        (left.courtName ?? "").localeCompare(right.courtName ?? ""),
    );
  return (
    <section
      aria-label="Schedule list"
      className="sch-agenda"
      data-auto={auto ? "" : undefined}
      data-testid="schedule-agenda"
    >
      <DayStrip
        aria-label="Choose a day"
        countLabel={(count) =>
          count === 0 ? "nothing booked" : `${count} on the schedule`
        }
        days={days}
        onValueChange={(value: unknown) => {
          if (typeof value === "string") onDate(value);
        }}
        today={today}
        value={date}
      />
      {rows.length === 0 ? (
        (empty ?? <EmptyState title="Nothing on this day" />)
      ) : (
        <ol className="sch-agenda__list">
          {rows.map((item) => {
            const live = isLive(item, nowMs);
            return (
              <li
                className="sch-agenda__row"
                data-cancelled={item.cancelled ? "" : undefined}
                data-live={live ? "" : undefined}
                key={`${item.source}:${item.id}`}
              >
                <button
                  aria-label={itemLabel(item, live)}
                  className="sch-agenda__item"
                  onClick={() => onOpen(item)}
                  type="button"
                >
                  <span className="sch-time">
                    {clockRange(item.startsAt, item.endsAt, item.timeZone)}
                  </span>
                  <span className="sch-agenda__what">
                    <strong>
                      <KindIcon kind={item.kind} />
                      <span>{item.title}</span>
                    </strong>
                    <small>
                      {[
                        kindWords(item),
                        item.courtName,
                        item.who,
                        item.cancelled ? "Cancelled" : undefined,
                        live ? "On now" : undefined,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  </span>
                  <GroupChip item={item} />
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
