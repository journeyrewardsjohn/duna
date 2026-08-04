import { CalendarDays } from "lucide-react";
import Link from "next/link";

function dayParts(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return {
    day: new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      timeZone: "UTC",
    }).format(date),
    month: new Intl.DateTimeFormat("en-US", {
      month: "short",
      timeZone: "UTC",
    }).format(date),
    weekday: new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      timeZone: "UTC",
    }).format(date),
    accessible: new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(date),
  };
}

export function DatePillFilter({
  eyebrow,
  title,
  dates,
  selectedDate,
  allHref,
  hrefForDate,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly dates: readonly string[];
  readonly selectedDate?: string;
  readonly allHref: string;
  readonly hrefForDate: (date: string) => string;
}) {
  const range = dates.flatMap((date) => {
    const parsed = dayParts(date);
    return parsed ? [parsed] : [];
  });
  const monthLabel =
    range.length > 0
      ? `${range[0]?.month}${range.at(-1)?.month !== range[0]?.month ? ` – ${range.at(-1)?.month}` : ""}`
      : "Choose a day";
  return (
    <nav aria-label={title} className="date-pill-filter" id="date-filter">
      <header>
        <div>
          <span>{eyebrow}</span>
          <strong>{title}</strong>
        </div>
        <span>
          <CalendarDays aria-hidden size={16} /> {monthLabel}
        </span>
      </header>
      <div className="date-pill-filter__rail">
        <Link
          aria-current={!selectedDate ? "date" : undefined}
          className="date-pill-filter__all"
          href={allHref}
        >
          <span>All</span>
          <strong>Dates</strong>
        </Link>
        {dates.map((date) => {
          const parts = dayParts(date);
          return (
            <Link
              aria-label={`Show ${parts.accessible}`}
              aria-current={selectedDate === date ? "date" : undefined}
              href={hrefForDate(date)}
              key={date}
            >
              <span>{parts.weekday}</span>
              <strong>{parts.day}</strong>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
