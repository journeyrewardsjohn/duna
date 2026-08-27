"use client";

import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useMemo, useState } from "react";

export type AvailabilityCalendarTone = "quiet" | "balanced" | "needed";

export interface AvailabilityCalendarDay {
  readonly available: boolean;
  readonly selected: boolean;
  readonly tone: AvailabilityCalendarTone;
  readonly title: string;
}

export interface AvailabilityCalendarLegend {
  readonly className: string;
  readonly label: string;
}

export function localCalendarDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function AvailabilityCalendar({
  description,
  getDay,
  legend,
  onToggle,
  title,
}: {
  readonly description: string;
  readonly getDay: (date: Date, dateKey: string) => AvailabilityCalendarDay;
  readonly legend: readonly AvailabilityCalendarLegend[];
  readonly onToggle: (dateKey: string, selected: boolean) => void;
  readonly title: string;
}) {
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const months = useMemo(
    () =>
      Array.from({ length: 4 }, (_, offset) => {
        const start = new Date(
          calendarMonth.getFullYear(),
          calendarMonth.getMonth() + offset,
          1,
        );
        const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
        return {
          label: new Intl.DateTimeFormat("en-US", {
            month: "long",
            year: "numeric",
          }).format(start),
          days: [
            ...Array.from(
              { length: start.getDay() },
              () => undefined as Date | undefined,
            ),
            ...Array.from(
              { length: end.getDate() },
              (_, index) =>
                new Date(start.getFullYear(), start.getMonth(), index + 1),
            ),
          ],
        };
      }),
    [calendarMonth],
  );

  return (
    <div className="team-availability-calendar">
      <header>
        <div>
          <span className="team-calendar-icon">
            <CalendarDays aria-hidden size={17} />
          </span>
          <span>
            <strong>{title}</strong>
            <small>{description}</small>
          </span>
        </div>
        <span className="team-calendar-controls">
          <button
            aria-label="Previous four months"
            onClick={() =>
              setCalendarMonth(
                (current) =>
                  new Date(current.getFullYear(), current.getMonth() - 4, 1),
              )
            }
            type="button"
          >
            <ChevronLeft aria-hidden size={17} />
          </button>
          <button
            aria-label="Next four months"
            onClick={() =>
              setCalendarMonth(
                (current) =>
                  new Date(current.getFullYear(), current.getMonth() + 4, 1),
              )
            }
            type="button"
          >
            <ChevronRight aria-hidden size={17} />
          </button>
        </span>
      </header>
      <div className="team-calendar-months">
        {months.map((month) => (
          <section className="team-calendar-month" key={month.label}>
            <h3>{month.label}</h3>
            <div className="team-calendar-weekdays">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="team-calendar-grid">
              {month.days.map((date, index) => {
                if (!date) {
                  return (
                    <span
                      className="team-calendar-blank"
                      key={`${month.label}-blank-${index}`}
                    />
                  );
                }
                const dateKey = localCalendarDateKey(date);
                const day = getDay(date, dateKey);
                return (
                  <button
                    className={`team-calendar-day team-calendar-day--${day.tone}${day.available ? " team-calendar-day--available" : " team-calendar-day--unavailable"}${day.selected ? " team-calendar-day--blackout" : ""}`}
                    key={dateKey}
                    onClick={() => onToggle(dateKey, day.selected)}
                    title={day.title}
                    type="button"
                  >
                    <span>{date.getDate()}</span>
                    {day.selected ? <X aria-hidden size={13} /> : <i />}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <footer>
        {legend.map((item) => (
          <span key={item.label}>
            <i className={item.className} />
            {item.label}
          </span>
        ))}
      </footer>
    </div>
  );
}
