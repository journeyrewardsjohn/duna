import type { PublicProCoverage } from "@duna/api";
import { Badge } from "@duna/ui";
import { CalendarDays, Radio, Trophy } from "lucide-react";
import Link from "next/link";
import { TourBrandMark } from "@/components/tour-brand-mark";

type ProEvent = PublicProCoverage["events"][number];

function eventDates(start?: string, end?: string): string {
  if (!start) return "Date pending";
  const format = (value: string, includeYear: boolean) =>
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      ...(includeYear ? { year: "numeric" } : {}),
      timeZone: "UTC",
    }).format(new Date(`${value}T12:00:00Z`));
  if (!end || end === start) return format(start, true);
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${format(start, !sameYear)} – ${format(end, true)}`;
}

export function ProEventCard({ event }: { readonly event: ProEvent }) {
  const progress = event.matchCount
    ? Math.min(100, (event.completedMatchCount / event.matchCount) * 100)
    : 0;
  return (
    <Link className="pro-event-card" href={`/events/${event.slug}`}>
      <figure className={event.poster ? "has-poster" : undefined}>
        {event.poster ? (
          <img alt={event.poster.alt} src={event.poster.url} />
        ) : (
          <div className="pro-event-card__brand">
            <TourBrandMark brand={event.source} />
            <Trophy aria-hidden size={30} />
          </div>
        )}
        <div className="pro-event-card__badges">
          <Badge tone={event.live ? "danger" : "neutral"}>
            {event.live ? (
              <>
                <Radio aria-hidden size={11} /> Live
              </>
            ) : (
              event.status
            )}
          </Badge>
          <span>{event.genderCategory}</span>
        </div>
      </figure>
      <div className="pro-event-card__body">
        <div className="pro-event-card__tour">
          <TourBrandMark brand={event.source} compact decorative />
          <span>{event.category ?? "Professional beach volleyball"}</span>
        </div>
        <h3>{event.name}</h3>
        <div className="pro-event-card__stage">
          {event.currentRound && <strong>{event.currentRound}</strong>}
          {event.liveMatchCount > 0 && (
            <span>{event.liveMatchCount} matches live</span>
          )}
        </div>
        <footer>
          <span>
            <CalendarDays aria-hidden size={14} />
            {eventDates(event.startsOn, event.endsOn)}
          </span>
          <span>{event.location ?? "Location pending"}</span>
        </footer>
        {event.matchCount > 0 ? (
          <>
            <div className="pro-event-card__progress" aria-hidden>
              <span style={{ width: `${progress}%` }} />
            </div>
            <small>
              {event.completedMatchCount}/{event.matchCount} matches complete
            </small>
          </>
        ) : (
          <small>Match schedule connecting</small>
        )}
      </div>
    </Link>
  );
}
