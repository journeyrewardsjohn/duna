import type { PublicCoach } from "@duna/api";
import { formatVenueTime } from "@duna/core";
import { Chip, ClubMark, Icon, OfflineBanner, Rally } from "@duna/ui/tideline";
import Link from "next/link";
import { ArrowLink, LinkButton } from "@/components/site/link-button";
import { ActionBar, type PageAction } from "../club/action-bar";
import { offeringPrice, offeringPriceLine, subtypeWords } from "../club/offers";
import { ClubWords, Section, sessionWhen } from "../club/parts";
import {
  coachCredentials,
  nextSlots,
  weeklyHours,
  type CoachClub,
  type CoachOffering,
} from "./coach-model";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

const productHref = (offering: CoachOffering) =>
  `/clubs/${offering.clubSlug}/products/${offering.item.slug}`;

/**
 * A coach's public profile: their own photo (or the honest placeholder),
 * what they coach and where, only the credentials the data has, the next
 * openings with one action to book, and the clubs they coach at.
 */
export function CoachPage({
  coach,
  clubs,
  offerings,
  clubColors,
  now,
}: {
  readonly coach: PublicCoach;
  readonly clubs: readonly CoachClub[];
  readonly offerings: readonly CoachOffering[];
  /** Each club's published colour, for its mark. */
  readonly clubColors: Readonly<Record<string, string | null>>;
  readonly now: Date;
}) {
  const credentials = coachCredentials(coach);
  const slots = nextSlots({ personId: coach.personId, offerings, now });
  const hours = weeklyHours(coach.availability);
  const coaches = [
    ...new Set(
      offerings.map((offering) => subtypeWords(offering.item.subtype)),
    ),
  ];
  const first = slots[0];
  const action: PageAction | undefined = first
    ? {
        label: `Book ${sessionWhen(first.occurrence).day}`,
        href: productHref(first.offering),
        note: `${first.offering.item.title} · ${sessionWhen(first.occurrence).time}`,
      }
    : offerings[0]
      ? {
          label: `Book with ${coach.displayName.split(" ")[0]}`,
          href: productHref(offerings[0]),
        }
      : undefined;
  const upcomingEvents = coach.upcomingSessions.filter(
    (session) => Date.parse(session.endsAt) > now.getTime(),
  );

  return (
    <main
      className="club-page coach-page"
      data-zone="editorial"
      id="main"
      tabIndex={-1}
    >
      <OfflineBanner className="site-wrap club-offline" writes="refused" />
      <section
        aria-labelledby="coach-title"
        className="site-wrap club-hero coach-hero"
      >
        <Rally className="club-hero__copy">
          <p className="site-label">
            {coach.homeMarket ? `Coach · ${coach.homeMarket}` : "Coach on Duna"}
          </p>
          <h1 className="club-display" id="coach-title">
            {coach.displayName}
          </h1>
          {coaches.length ? (
            <p className="site-lead">{coaches.join(" · ")}</p>
          ) : null}
          <dl className="club-facts">
            {clubs.length ? (
              <div>
                <dt>Where</dt>
                <dd>
                  {clubs.map((club, index) => (
                    <span key={club.slug}>
                      {index > 0 ? ", " : ""}
                      <Link href={`/clubs/${club.slug}`}>{club.name}</Link>
                    </span>
                  ))}
                </dd>
              </div>
            ) : null}
            {credentials.length ? (
              <div>
                <dt>Background</dt>
                <dd>{credentials.join(" · ")}</dd>
              </div>
            ) : null}
            {first ? (
              <div>
                <dt>Next opening</dt>
                <dd>
                  <span className="club-num">
                    {sessionWhen(first.occurrence).day} ·{" "}
                    {sessionWhen(first.occurrence).time}
                  </span>
                  <span className="site-meta">{first.offering.item.title}</span>
                </dd>
              </div>
            ) : null}
          </dl>
          {action ? (
            <div className="site-actions">
              <LinkButton href={action.href} size="lg" variant="primary">
                {action.label}
              </LinkButton>
            </div>
          ) : (
            <p className="site-body">
              No openings are published right now. Check back, or ask{" "}
              {clubs[0] ? (
                <Link href={`/clubs/${clubs[0].slug}#contact`}>
                  {clubs[0].name}
                </Link>
              ) : (
                "the club"
              )}
              .
            </p>
          )}
          {coach.bio ? (
            <ClubWords club={coach.displayName}>{coach.bio}</ClubWords>
          ) : null}
        </Rally>
        <div className="club-hero__stage coach-hero__stage td-rise">
          {coach.avatarUrl ? (
            <div className="site-photo coach-portrait">
              <img
                alt={coach.displayName}
                className="site-photo__image"
                decoding="async"
                fetchPriority="high"
                src={coach.avatarUrl}
              />
            </div>
          ) : (
            <div
              aria-hidden="true"
              className="club-hero__placeholder coach-portrait coach-portrait--none"
            >
              <span className="coach-portrait__initials">
                {initials(coach.displayName)}
              </span>
            </div>
          )}
        </div>
      </section>

      {slots.length > 0 ? (
        <Section id="openings" label="Openings" title="Next openings">
          <ul className="club-sessions" aria-label="Next openings">
            {slots.map(({ offering, occurrence }) => {
              const when = sessionWhen(occurrence);
              return (
                <li key={occurrence.key}>
                  <Link
                    className="club-sessions__row"
                    href={productHref(offering)}
                  >
                    <span className="club-sessions__when">
                      <strong>{when.day}</strong>
                      <span className="club-num">{when.time}</span>
                    </span>
                    <span className="club-sessions__state">
                      <span>{offering.item.title}</span>
                    </span>
                    <span className="club-sessions__coach">
                      <Icon name="venue" size="chip" /> {offering.clubName}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}

      {offerings.length > 0 ? (
        <Section id="training" label="Training" title="Ways to train">
          <Rally className="club-grid">
            {offerings.map((offering) => (
              <article
                className="club-card club-offering"
                key={offering.item.id}
              >
                <span className="club-offering__top">
                  <span className="site-label">
                    {subtypeWords(offering.item.subtype)}
                  </span>
                </span>
                <h3 className="club-card__title">
                  <Link href={productHref(offering)}>
                    {offering.item.title}
                  </Link>
                </h3>
                {offering.item.shortSummary ? (
                  <p className="site-body">{offering.item.shortSummary}</p>
                ) : null}
                <span className="club-offering__foot">
                  <span className="club-card__price club-num">
                    {offeringPriceLine(offeringPrice(offering.item))}
                  </span>
                  <ArrowLink href={productHref(offering)}>Details</ArrowLink>
                </span>
              </article>
            ))}
          </Rally>
        </Section>
      ) : null}

      {hours.length > 0 ? (
        <Section
          id="hours"
          label="Hours"
          lead="The hours this coach usually teaches. Exact times show when you book."
          title="Weekly hours"
        >
          <dl className="club-policies">
            {hours.map((window, index) => (
              <div key={`${window.day}-${index}`}>
                <dt>{window.day}</dt>
                <dd className="club-num">{window.hours}</dd>
              </div>
            ))}
          </dl>
        </Section>
      ) : null}

      {upcomingEvents.length > 0 ? (
        <Section id="events" label="Events" title="Coming up">
          <ul className="event-matches">
            {upcomingEvents.map((session) => (
              <li key={session.id}>
                <Link className="event-match" href={`/events/${session.slug}`}>
                  <span className="club-num event-match__time">
                    {formatVenueTime(
                      session.startsAt,
                      session.timezone,
                      "en-US",
                      {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      },
                    )}
                  </span>
                  <span>
                    <strong>{session.title}</strong>
                    {session.venueName ? (
                      <span className="site-meta">{session.venueName}</span>
                    ) : null}
                  </span>
                  <Icon name="chevron-right" size="inline" />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {clubs.length > 0 ? (
        <Section
          id="clubs"
          label="Clubs"
          title={`Where ${coach.displayName.split(" ")[0]} coaches`}
        >
          <Rally className="club-coaches">
            {clubs.map((club) => (
              <Link
                className="club-coach club-card"
                href={`/clubs/${club.slug}`}
                key={club.slug}
              >
                <ClubMark
                  color={clubColors[club.slug] ?? null}
                  decorative
                  name={club.name}
                  size="md"
                />
                <span>
                  <strong>{club.name}</strong>
                  <span className="site-meta">Club page</span>
                </span>
                <Icon name="chevron-right" size="inline" />
              </Link>
            ))}
          </Rally>
        </Section>
      ) : null}

      {action ? (
        <ActionBar label={`Book with ${coach.displayName}`} primary={action} />
      ) : null}
      {offerings.length === 0 && !first ? (
        <section className="site-wrap club-section" aria-label="Training">
          <Chip kind="status">No sessions published yet</Chip>
        </section>
      ) : null}
    </main>
  );
}
