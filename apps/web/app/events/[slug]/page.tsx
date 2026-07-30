import { formatMoney, formatVenueTime } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import {
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  MapPin,
  ShieldCheck,
  Trophy,
  Users,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getServerCaller } from "@/lib/api";

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const caller = await getServerCaller();
  const event = await caller.public
    .eventBySlug({ slug })
    .catch(() => undefined);
  return { title: event?.title ?? "Event" };
}

export default async function EventPage({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const caller = await getServerCaller();
  const [event, people] = await Promise.all([
    caller.public.eventBySlug({ slug }).catch(() => undefined),
    caller.public.players({ limit: 4 }),
  ]);
  if (!event) notFound();
  return (
    <main className="public-detail">
      <SiteHeader />
      <section className="event-detail-hero">
        <div className="event-detail-hero__art">
          <div className="event-detail-hero__sun" />
          <div className="event-detail-hero__court" />
        </div>
        <div className="event-detail-hero__content">
          <div>
            <Badge tone={event.live ? "live" : "neutral"}>
              {event.live ? "Live now" : event.kind.replace("-", " ")}
            </Badge>
            {event.tags.slice(0, 2).map((tag) => (
              <Badge key={tag}>{tag}</Badge>
            ))}
          </div>
          <h1>{event.title}</h1>
          <p>{event.organizationName}</p>
          <div className="event-detail-hero__facts">
            <span>
              <CalendarDays aria-hidden size={18} />
              <strong>
                {formatVenueTime(event.startsAt, event.timezone, "en-US", {
                  weekday: "long",
                  year: "numeric",
                })}
              </strong>
            </span>
            <span>
              <MapPin aria-hidden size={18} />
              <strong>{event.venueName}</strong>
            </span>
            <span>
              <Users aria-hidden size={18} />
              <strong>
                <Numeric>{event.spotsRemaining}</Numeric> spots left
              </strong>
            </span>
          </div>
        </div>
      </section>

      <section className="event-detail-layout">
        <article className="event-detail-copy">
          <span className="section__eyebrow">The run</span>
          <h2>A proper South Bay night.</h2>
          <p>
            {event.description ??
              "Competitive games, simple check-in, live scoring, and a field tuned to your Sand Rating. Arrive ready to warm up; Duna handles the rest."}
          </p>
          {event.divisions && event.divisions.length > 0 && (
            <>
              <h3>Choose your division</h3>
              <div className="event-divisions">
                {event.divisions.map((division) => (
                  <Link
                    href={`/app/checkout/${event.slug}?division=${division.id}`}
                    key={division.id}
                  >
                    <span>
                      <strong>{division.name}</strong>
                      <small>
                        {division.discipline.replace("-", " ")} ·{" "}
                        {division.ratingBasis.replaceAll("-", " ")}
                      </small>
                    </span>
                    <span>
                      <Numeric>
                        {division.price.amountMinor === 0
                          ? "Free"
                          : formatMoney(
                              division.price.amountMinor,
                              division.price.currency,
                            )}
                      </Numeric>
                      <small>
                        <Numeric>{division.spotsRemaining}</Numeric> spots
                      </small>
                    </span>
                    <ArrowRight aria-hidden size={17} />
                  </Link>
                ))}
              </div>
            </>
          )}
          <div className="event-detail-highlights">
            <article>
              <Trophy aria-hidden size={22} />
              <span>
                <strong>
                  {event.kind === "tournament"
                    ? "Structured competition"
                    : "Verified play"}
                </strong>
                <small>
                  {event.kind === "tournament"
                    ? "Bracket, scoring, and results stay in one place"
                    : "Results can feed your Sand Rating"}
                </small>
              </span>
            </article>
            <article>
              <Clock3 aria-hidden size={22} />
              <span>
                <strong>Fast arrival</strong>
                <small>
                  Waiver, eligibility, and payment checked before you arrive
                </small>
              </span>
            </article>
            <article>
              <ShieldCheck aria-hidden size={22} />
              <span>
                <strong>Clear policies</strong>
                <small>
                  Weather credits default to Duna Wallet; original method
                  available
                </small>
              </span>
            </article>
          </div>
          <h3>Community profiles</h3>
          <div className="event-attendees">
            {people.map((person) => (
              <Link href={`/players/${person.handle}`} key={person.id}>
                <span className="avatar">{person.initials}</span>
                <span>
                  <strong>{person.displayName}</strong>
                  <small>{person.homeMarket.split(",")[0]}</small>
                </span>
                <Numeric>{person.rating.display.toFixed(2)}</Numeric>
              </Link>
            ))}
          </div>
        </article>

        <aside className="event-booking-card">
          <span>
            Entry{event.divisions && event.divisions.length > 0 ? " from" : ""}
          </span>
          <Numeric>
            {event.price.amountMinor === 0
              ? "Free"
              : formatMoney(event.price.amountMinor, event.price.currency)}
          </Numeric>
          <small>
            Exact fees and tender are calculated before confirmation.
          </small>
          <ul>
            <li>
              <Check aria-hidden size={15} /> Eligibility checked instantly
            </li>
            <li>
              <Check aria-hidden size={15} /> Wallet applies first
            </li>
            <li>
              <Check aria-hidden size={15} /> One transparent Duna fee
            </li>
          </ul>
          <Link href={`/app/checkout/${event.slug}`}>
            {event.live ? "Open live event" : "Take the spot"}
            <ArrowRight aria-hidden size={17} />
          </Link>
          <p>
            <Numeric>{event.capacity - event.spotsRemaining}</Numeric> of{" "}
            <Numeric>{event.capacity}</Numeric> spots taken
          </p>
          <div className="capacity-meter">
            <span
              style={{
                width: `${((event.capacity - event.spotsRemaining) / event.capacity) * 100}%`,
              }}
            />
          </div>
        </aside>
      </section>
      <SiteFooter />
    </main>
  );
}
