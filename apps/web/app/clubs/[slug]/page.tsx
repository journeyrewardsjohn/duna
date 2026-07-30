import { Badge, Numeric } from "@duna/ui";
import { ArrowRight, Check, MapPin, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EventCard } from "@/components/event-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getServerCaller } from "@/lib/api";

export default async function ClubPage({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const caller = await getServerCaller();
  const [organization, allEvents, allVenues] = await Promise.all([
    caller.public.organizationBySlug({ slug }).catch(() => undefined),
    caller.public.events(),
    caller.public.venues(),
  ]);
  if (!organization) notFound();
  const events = allEvents.filter(
    (event) => event.organizationName === organization.name,
  );
  const venues = allVenues.filter(
    (venue) => venue.organizationId === organization.id,
  );
  const mark = organization.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return (
    <main className="public-detail">
      <SiteHeader />
      <section className="club-hero">
        <div className="club-hero__art">
          <div />
          <span>{mark}</span>
        </div>
        <div className="club-hero__copy">
          <div>
            <Badge tone="positive">Verified club</Badge>
            <Badge>{organization.plan.replace("-", " ")}</Badge>
          </div>
          <h1>{organization.name}</h1>
          <p>
            Structured training, serious competition, and easy ways into the
            South Bay beach community.
          </p>
          <div className="club-hero__stats">
            <span>
              <Numeric>{organization.memberCount}</Numeric>
              <small>members</small>
            </span>
            <span>
              <Numeric>{organization.staffCount}</Numeric>
              <small>coaches + staff</small>
            </span>
            <span>
              <Numeric>{organization.venueCount}</Numeric>
              <small>venues</small>
            </span>
          </div>
          <Link href="/app/discover">
            Explore programs <ArrowRight size={17} />
          </Link>
        </div>
      </section>
      <section className="club-body">
        <div className="section__heading">
          <div>
            <span className="section__eyebrow">Book now</span>
            <h2>What’s happening.</h2>
          </div>
        </div>
        <div className="event-grid">
          {events.slice(0, 4).map((event) => (
            <EventCard event={event} key={event.id} />
          ))}
          {events.length === 0 && (
            <article className="empty-state">
              <h3>No published sessions yet.</h3>
              <p>This club’s next public offering will appear here.</p>
            </article>
          )}
        </div>
        <div className="club-values">
          <article>
            <Users />
            <strong>A place at every level</strong>
            <p>First sessions through Open division competition.</p>
          </article>
          <article>
            <ShieldCheck />
            <strong>Built-in safety</strong>
            <p>Verified coaches, guardian structure, versioned waivers.</p>
          </article>
          <article>
            <Check />
            <strong>One clean account</strong>
            <p>Bookings, packages, memberships, events, and messages.</p>
          </article>
        </div>
        <div className="club-locations">
          <div>
            <span className="section__eyebrow">Where we play</span>
            <h2>
              {venues.length} {venues.length === 1 ? "venue" : "venues"}. One
              club.
            </h2>
          </div>
          <div>
            {venues.map((venue) => (
              <article key={venue.id}>
                <MapPin size={18} />
                <span>
                  <strong>{venue.name}</strong>
                  <small>
                    {venue.city}, {venue.region}
                  </small>
                </span>
                <Badge>{venue.courtCount} courts</Badge>
              </article>
            ))}
          </div>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
