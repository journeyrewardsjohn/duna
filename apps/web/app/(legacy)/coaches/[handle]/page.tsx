import type { PublicCatalogItem } from "@duna/api";
import { formatVenueTime } from "@duna/core";
import { Badge } from "@duna/ui";
import {
  ArrowRight,
  CalendarDays,
  Clock3,
  MapPin,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getServerCaller } from "@/lib/api";
import { absolutePublicUrl, serializeJsonLd } from "@/lib/pro-seo";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function serviceHref(slug: string, item: PublicCatalogItem): string {
  return `/clubs/${slug}/products/${item.slug}`;
}

const loadCoach = cache(async (handle: string, organizationSlug?: string) => {
  const caller = await getServerCaller();
  return caller.public
    .coach({ handle, ...(organizationSlug ? { organizationSlug } : {}) })
    .catch(() => undefined);
});

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const coach = await loadCoach(handle);
  if (!coach) return { title: "Coach not found" };
  const canonical = `/coaches/${coach.handle}`;
  const description =
    coach.bio ??
    `Book beach volleyball training and upcoming sessions with ${coach.displayName} on Duna.`;
  return {
    title: `${coach.displayName} beach volleyball coach`,
    description,
    alternates: {
      canonical,
      types: { "text/markdown": `${canonical}.md` },
    },
    openGraph: {
      title: `${coach.displayName} · Duna coach`,
      description,
      type: "profile",
      url: canonical,
      images: coach.avatarUrl
        ? [{ url: coach.avatarUrl, alt: coach.displayName }]
        : undefined,
    },
    robots: { index: true, follow: true },
  };
}

export default async function CoachProfilePage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ handle: string }>;
  readonly searchParams: Promise<{ organization?: string }>;
}) {
  const [{ handle }, query] = await Promise.all([params, searchParams]);
  const coach = await loadCoach(handle, query.organization);
  if (!coach) notFound();
  const profileUrl = absolutePublicUrl(`/coaches/${coach.handle}`);
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ProfilePage",
        "@id": `${profileUrl}#page`,
        url: profileUrl,
        name: `${coach.displayName} beach volleyball coach`,
        mainEntity: { "@id": `${profileUrl}#person` },
        encoding: {
          "@type": "MediaObject",
          encodingFormat: "text/markdown",
          contentUrl: absolutePublicUrl(`/coaches/${coach.handle}.md`),
        },
      },
      {
        "@type": "Person",
        "@id": `${profileUrl}#person`,
        name: coach.displayName,
        alternateName: `@${coach.handle}`,
        url: profileUrl,
        image: coach.avatarUrl,
        description: coach.bio,
        jobTitle: "Beach volleyball coach",
        homeLocation: coach.homeMarket
          ? { "@type": "Place", name: coach.homeMarket }
          : undefined,
        worksFor: {
          "@type": "SportsOrganization",
          "@id": `${absolutePublicUrl(`/clubs/${coach.organizationSlug}`)}#organization`,
          name: coach.organizationName,
          url: absolutePublicUrl(`/clubs/${coach.organizationSlug}`),
        },
        makesOffer: coach.services.map((service) => ({
          "@type": "Offer",
          name: service.title,
          url: absolutePublicUrl(serviceHref(coach.organizationSlug, service)),
        })),
      },
    ],
  };

  const availability = coach.availability
    .map((window) => ({
      weekday: typeof window.weekday === "number" ? window.weekday : undefined,
      startsAt:
        typeof window.startsAt === "string" ? window.startsAt : undefined,
      endsAt: typeof window.endsAt === "string" ? window.endsAt : undefined,
    }))
    .filter(
      (
        window,
      ): window is {
        weekday: number;
        startsAt: string;
        endsAt: string;
      } =>
        window.weekday !== undefined &&
        Boolean(window.startsAt) &&
        Boolean(window.endsAt),
    );

  return (
    <main className="public-detail coach-profile-page" data-zone="athletic">
      <SiteHeader />
      <script
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
        type="application/ld+json"
      />
      <section className="coach-profile-hero">
        <div className="coach-profile-hero__portrait">
          {coach.avatarUrl ? (
            <img alt={coach.displayName} src={coach.avatarUrl} />
          ) : (
            <span>{initials(coach.displayName)}</span>
          )}
        </div>
        <div className="coach-profile-hero__copy">
          <div>
            <Badge tone="positive">Duna coach</Badge>
            <Badge>@{coach.handle}</Badge>
          </div>
          <h1>{coach.displayName}</h1>
          <p>
            {coach.bio ??
              `Book training and upcoming sessions with ${coach.displayName}.`}
          </p>
          <div className="coach-profile-hero__meta">
            <Link href={`/clubs/${coach.organizationSlug}`}>
              <MapPin aria-hidden size={17} />
              {coach.organizationName}
            </Link>
            {coach.homeMarket && (
              <span>
                <Sparkles aria-hidden size={17} />
                {coach.homeMarket}
              </span>
            )}
          </div>
          {coach.services[0] && (
            <Link
              className="primary-action"
              href={serviceHref(coach.organizationSlug, coach.services[0])}
            >
              Book with {coach.displayName}
              <ArrowRight aria-hidden size={17} />
            </Link>
          )}
        </div>
      </section>

      <section className="coach-profile-body">
        <section>
          <header className="section__heading">
            <div>
              <span className="section__eyebrow">Training</span>
              <h2>Ways to work together.</h2>
            </div>
          </header>
          <div className="coach-service-grid">
            {coach.services.map((service) => (
              <Link
                href={serviceHref(coach.organizationSlug, service)}
                key={service.id}
              >
                <Badge>{service.subtype.replaceAll("-", " ")}</Badge>
                <h3>{service.title}</h3>
                <p>
                  {service.shortSummary ??
                    service.description ??
                    "See availability and booking options."}
                </p>
                <span>
                  View availability <ArrowRight aria-hidden size={15} />
                </span>
              </Link>
            ))}
            {coach.services.length === 0 && (
              <article className="empty-state">
                <h3>New availability is coming.</h3>
                <p>
                  Follow this coach through {coach.organizationName} for the
                  next published session.
                </p>
              </article>
            )}
          </div>
        </section>

        <aside className="coach-availability">
          <span className="section__eyebrow">Typical availability</span>
          <h2>Find a time that fits.</h2>
          <div>
            {availability.map((window, index) => (
              <p key={`${window.weekday}-${window.startsAt}-${index}`}>
                <span>{WEEKDAYS[window.weekday]}</span>
                <strong>
                  {window.startsAt}–{window.endsAt}
                </strong>
              </p>
            ))}
            {availability.length === 0 && (
              <p>
                <span>Schedule</span>
                <strong>Shown during booking</strong>
              </p>
            )}
          </div>
          <small>
            Final availability is calculated from the coach, service, venue, and
            equipment calendars.
          </small>
        </aside>

        {coach.upcomingSessions.length > 0 && (
          <section className="coach-upcoming">
            <header className="section__heading">
              <div>
                <span className="section__eyebrow">On the calendar</span>
                <h2>Upcoming with {coach.displayName}.</h2>
              </div>
            </header>
            <div>
              {coach.upcomingSessions.map((session) => (
                <Link href={`/events/${session.slug}`} key={session.id}>
                  <CalendarDays aria-hidden size={19} />
                  <span>
                    <strong>{session.title}</strong>
                    <small>
                      {formatVenueTime(
                        session.startsAt,
                        session.timezone,
                        "en-US",
                        { weekday: "long", month: "short", day: "numeric" },
                      )}
                    </small>
                  </span>
                  <span>
                    <Clock3 aria-hidden size={15} />
                    {session.venueName ?? "Details"}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </section>
      <SiteFooter />
    </main>
  );
}
