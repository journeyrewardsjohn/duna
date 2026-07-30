import type { EventSummary } from "@duna/core";
import { formatMoney, formatVenueTime } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import { ArrowUpRight, MapPin } from "lucide-react";
import Link from "next/link";

export function EventCard({
  event,
  featured = false,
}: {
  readonly event: EventSummary;
  readonly featured?: boolean;
}) {
  const isFree = event.price.amountMinor === 0;
  return (
    <Link
      className={featured ? "event-card event-card--featured" : "event-card"}
      href={`/events/${event.slug}`}
    >
      <div className="event-card__art" data-kind={event.kind}>
        <div className="event-card__court-lines" />
        <div className="event-card__badges">
          {event.live && <Badge tone="live">Live now</Badge>}
          <Badge>{event.kind.replace("-", " ")}</Badge>
        </div>
        <span className="event-card__arrow">
          <ArrowUpRight aria-hidden size={19} />
        </span>
      </div>
      <div className="event-card__body">
        <div>
          <p className="event-card__time">
            {formatVenueTime(event.startsAt, event.timezone, "en-US", {
              weekday: "short",
            })}
          </p>
          <h3>{event.title}</h3>
        </div>
        <p className="event-card__venue">
          <MapPin aria-hidden size={15} />
          {event.venueName}
        </p>
        <div className="event-card__meta">
          <span>
            <Numeric>
              {isFree
                ? "Free"
                : formatMoney(
                    event.price.amountMinor,
                    event.price.currency,
                    "en-US",
                  )}
            </Numeric>
          </span>
          <span>
            <Numeric>{event.spotsRemaining}</Numeric> spots
          </span>
          {event.ratingRange && (
            <span>
              <Numeric>
                {event.ratingRange[0].toFixed(1)}–
                {event.ratingRange[1].toFixed(1)}
              </Numeric>
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
