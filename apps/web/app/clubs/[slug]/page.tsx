import { demoEvents, demoOrganization, demoVenues } from "@duna/core/demo";
import { Badge, Numeric } from "@duna/ui";
import { ArrowRight, Check, MapPin, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { EventCard } from "@/components/event-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function ClubPage() {
  return (
    <main className="public-detail">
      <SiteHeader />
      <section className="club-hero">
        <div className="club-hero__art">
          <div />
          <span>SB</span>
        </div>
        <div className="club-hero__copy">
          <div>
            <Badge tone="positive">Verified club</Badge>
            <Badge>South Bay</Badge>
          </div>
          <h1>{demoOrganization.name}</h1>
          <p>
            Structured training, serious competition, and easy ways into the
            South Bay beach community.
          </p>
          <div className="club-hero__stats">
            <span>
              <Numeric>{demoOrganization.memberCount}</Numeric>
              <small>members</small>
            </span>
            <span>
              <Numeric>{demoOrganization.staffCount}</Numeric>
              <small>coaches + staff</small>
            </span>
            <span>
              <Numeric>{demoOrganization.venueCount}</Numeric>
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
          {demoEvents.slice(0, 4).map((event) => (
            <EventCard event={event} key={event.id} />
          ))}
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
            <h2>Three venues. One club.</h2>
          </div>
          <div>
            {demoVenues.map((venue) => (
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
