import type {
  EventSummary,
  PublicProEvent,
  TournamentCompetitionSnapshot,
} from "@duna/api";
import {
  Chip,
  ClubMark,
  ConditionsLine,
  Icon,
  OfflineBanner,
  Rally,
} from "@duna/ui/tideline";
import Link from "next/link";
import { ArrowLink, LinkButton } from "@/components/site/link-button";
import { ActionBar, type PageAction } from "../club/action-bar";
import { ClubMedia } from "../club/club-media";
import { allInNote, allInPrice, priceWords } from "../club/offers";
import { ClubWords, PlaceMap, Section } from "../club/parts";
import { actionHref } from "../club/viewer";
import {
  divisionRows,
  entryDivisions,
  eventPhase,
  eventWhen,
  lowestEntry,
  PHASE_WORDS,
  scheduleRows,
  type EventPhase,
  type StartConditions,
} from "./event-model";

export interface EventExtras {
  /** Published videos of the event (title and state only; the watch page guards the rest). */
  readonly videos?: readonly {
    readonly id: string;
    readonly title: string;
    readonly live: boolean;
  }[];
  /** How many prediction markets the event has (they live on the desk). */
  readonly predictionCount?: number;
  /** A draw or results exist: the full desk is worth a link. */
  readonly hasDraw?: boolean;
  /** Conditions at the first serve, when a forecast covers it. */
  readonly conditions?: StartConditions;
  /** `/discover` around the event's place. */
  readonly nearbyHref?: string;
}

const PHASE_TONE: Readonly<
  Record<EventPhase, "live" | "warning" | "positive" | "danger" | "neutral">
> = {
  open: "positive",
  waitlist: "warning",
  live: "live",
  final: "neutral",
  cancelled: "danger",
};

const KIND_WORDS: Readonly<Record<string, string>> = {
  tournament: "Tournament",
  league: "League",
  clinic: "Clinic",
  "open-play": "Open play",
  "private-lesson": "Private lesson",
  "court-rental": "Court rental",
  pickup: "Pickup game",
};

function plain(markdown: string): string {
  return markdown
    .replaceAll(/^#+\s*/gm, "")
    .replaceAll(/[*_`>]/g, "")
    .trim();
}

/**
 * The public face of a tournament or event: name, dates in the venue's time
 * zone, the place, divisions with spots left and waitlists in the shared
 * words, fees all-in, the schedule when published, the live state (the one
 * use of Solar), results when final, registration into the existing flow,
 * the organiser and the organiser's own policies. Nobody who registered is
 * named.
 */
export function EventPage({
  event,
  competition,
  viewer,
  organiserColor = null,
  extras = {},
}: {
  readonly event: EventSummary;
  readonly competition?: TournamentCompetitionSnapshot;
  readonly viewer: { readonly signedIn: boolean };
  /** The organiser's published colour, for its mark. */
  readonly organiserColor?: string | null;
  readonly extras?: EventExtras;
}) {
  const entries = entryDivisions(event);
  const guests = (event.features ?? []).filter(
    (feature) => feature.kind === "guest",
  );
  const highlights = (event.features ?? []).filter(
    (feature) => feature.kind !== "guest",
  );
  const desk = `/events/${event.slug}/bracket`;
  const phase = eventPhase(event);
  const when = eventWhen(event);
  const divisions = divisionRows(event);
  const schedule = scheduleRows(competition);
  const live = schedule.filter((row) => row.status === "live");
  const results = schedule.filter((row) => row.status === "final");
  const upcomingRows = schedule.filter((row) => row.status === "scheduled");
  const entry = lowestEntry(event);
  const organiser = event.organizationName.replace(/^Hosted by\s+/i, "");
  const location = event.location;
  const venueName = location?.venueName ?? event.venueName;
  const cover =
    event.media?.find((media) => media.kind === "image") ??
    event.media?.find((media) => media.kind === "video");
  const coverUrl = cover?.url ?? event.imageUrl;
  const tickets = (event.tickets ?? []).filter(
    (ticket) => ticket.availableOnline,
  );
  const pickup = event.kind === "pickup";

  let action: PageAction | undefined;
  if (phase === "cancelled") action = undefined;
  else if (pickup) {
    action = {
      label: phase === "final" ? "See the game" : "Join this game",
      href: actionHref({
        signedIn: viewer.signedIn,
        target: `/events/${event.slug}/pickup`,
        product: event.title,
        organization: organiser,
      }),
    };
  } else if (phase === "live") {
    action = { label: "Follow live", href: "#schedule" };
  } else if (phase === "final") {
    action = results.length
      ? { label: "See results", href: "#results" }
      : undefined;
  } else if (divisions.length === 1) {
    action = {
      label: phase === "waitlist" ? "Join the waitlist" : "Register",
      href: divisions[0]!.registerHref,
      note: `${entry.price.label} all-in`,
    };
  } else {
    action = {
      label: phase === "waitlist" ? "Join a waitlist" : "Choose a division",
      href: divisions.length ? "#divisions" : `/checkout/${event.slug}`,
      note: `${entry.from ? "From " : ""}${entry.price.label} all-in`,
    };
  }

  return (
    <main
      className="club-page event-page"
      data-phase={phase}
      data-zone={phase === "live" ? "live" : "editorial"}
      id="main"
      tabIndex={-1}
    >
      <OfflineBanner className="site-wrap club-offline" writes="refused" />
      <section
        aria-labelledby="event-title"
        className="site-wrap club-hero event-hero"
      >
        <Rally className="club-hero__copy">
          <p className="site-label event-hero__label">
            <Chip kind="status" tone={PHASE_TONE[phase]}>
              {PHASE_WORDS[phase]}
            </Chip>
            <span>{KIND_WORDS[event.kind] ?? "Event"}</span>
          </p>
          <h1 className="club-display" id="event-title">
            {event.title}
          </h1>
          <dl className="club-facts">
            <div>
              <dt>When</dt>
              <dd>
                <span>{when.day}</span>
                <span className="club-num">{when.time}</span>
              </dd>
            </div>
            <div>
              <dt>Where</dt>
              <dd>
                {location?.mode === "online" ? "Online" : venueName}
                {location?.address ? (
                  <span className="site-meta">{location.address}</span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt>Entry</dt>
              <dd className="club-num">
                {entry.from ? "From " : ""}
                {entry.price.label}
                {divisions.some((division) => division.teamPrice)
                  ? " per player"
                  : ""}
              </dd>
            </div>
            <div>
              <dt>Organiser</dt>
              <dd>
                {event.organizationSlug ? (
                  <Link href={`/clubs/${event.organizationSlug}`}>
                    {organiser}
                  </Link>
                ) : (
                  organiser
                )}
              </dd>
            </div>
          </dl>
          {allInNote(entry.price) ? (
            <p className="site-meta">{allInNote(entry.price)}</p>
          ) : null}
          {extras.conditions && phase !== "final" && phase !== "cancelled" ? (
            <div className="event-conditions">
              <span className="site-label">At first serve</span>
              <ConditionsLine
                conditions={extras.conditions.conditions}
                timeZone={event.timezone}
              />
              {extras.conditions.attribution ? (
                <span className="site-meta">
                  {extras.conditions.attribution}
                </span>
              ) : null}
            </div>
          ) : null}
          {action ? (
            <div className="site-actions">
              <LinkButton href={action.href} size="lg" variant="primary">
                {action.label}
              </LinkButton>
              {tickets.length ? (
                <LinkButton href="#tickets" size="lg" variant="secondary">
                  Spectator tickets
                </LinkButton>
              ) : null}
            </div>
          ) : null}
          {phase === "cancelled" ? (
            <p className="site-body">
              {organiser} cancelled this event. Anyone registered hears from the
              organiser about refunds.
            </p>
          ) : null}
        </Rally>
        <div className="club-hero__stage td-rise">
          {coverUrl ? (
            <ClubMedia
              alt={cover?.alt ?? `${event.title}, from the organiser`}
              kind={cover?.kind === "video" ? "video" : "image"}
              poster={cover?.posterUrl}
              priority
              url={coverUrl}
            />
          ) : (
            <div aria-hidden="true" className="club-hero__placeholder">
              <ClubMark
                color={organiserColor}
                decorative
                name={organiser}
                size="hero"
              />
            </div>
          )}
        </div>
      </section>

      {live.length > 0 ? (
        <Section id="live" label="Live" title="On court now">
          <ul className="event-matches" aria-label="Matches live now">
            {live.map((row) => (
              <li key={row.id}>
                <Link className="event-match" href={row.href!}>
                  <Chip kind="status" tone="live">
                    Live
                  </Chip>
                  <span>
                    <strong>{row.label}</strong>
                    <span className="site-meta">
                      {[row.division, row.court].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="club-num event-match__score">
                    {row.sets.map(([a, b]) => `${a}–${b}`).join("  ")}
                  </span>
                  <Icon name="chevron-right" size="inline" />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {divisions.length > 0 ? (
        <Section
          id="divisions"
          label="Divisions"
          lead="Prices are all-in. Your team's place is confirmed when the team is complete."
          title="Find your division"
        >
          <Rally className="club-grid">
            {divisions.map((division) => (
              <article className="club-card event-division" key={division.id}>
                <span className="club-offering__top">
                  <h3 className="club-card__title">{division.name}</h3>
                  <Chip
                    kind="status"
                    tone={division.full ? "warning" : "neutral"}
                  >
                    {division.spots}
                  </Chip>
                </span>
                {division.facts.length ? (
                  <p className="site-meta">{division.facts.join(" · ")}</p>
                ) : null}
                {division.waiting ? (
                  <p className="site-meta">Waitlist: {division.waiting}</p>
                ) : null}
                <dl className="event-division__prices">
                  {division.teamPrice ? (
                    <div>
                      <dt>Team</dt>
                      <dd className="club-num">{division.teamPrice.label}</dd>
                    </div>
                  ) : null}
                  {division.playerPrice ? (
                    <div>
                      <dt>Per player</dt>
                      <dd className="club-num">{division.playerPrice.label}</dd>
                    </div>
                  ) : null}
                </dl>
                {phase === "open" || phase === "waitlist" ? (
                  <ArrowLink href={division.registerHref}>
                    {division.full ? "Join the waitlist" : "Register"}
                  </ArrowLink>
                ) : null}
              </article>
            ))}
          </Rally>
        </Section>
      ) : null}

      {extras.hasDraw || extras.predictionCount ? (
        <nav aria-label="Tournament desk" className="site-wrap event-desk">
          {extras.hasDraw ? (
            <ArrowLink href={desk}>Bracket and results</ArrowLink>
          ) : null}
          {extras.predictionCount ? (
            <ArrowLink href={`${desk}#predictions`}>
              {`Predictions (${extras.predictionCount})`}
            </ArrowLink>
          ) : null}
        </nav>
      ) : null}

      {entries.length > 0 ? (
        <Section
          id="entries"
          label="Entries"
          lead="Confirmed teams in seed order, then the waitlist. A player shows only with a public adult profile; juniors and private profiles never appear."
          title="The field"
        >
          <div className="event-entries">
            {entries.map((division) => (
              <section
                aria-label={`${division.name} entries`}
                className="club-card event-entries__division"
                key={division.id}
              >
                <h3 className="club-card__title">{division.name}</h3>
                <ol className="event-entries__list">
                  {[...division.confirmed, ...division.waitlisted].map(
                    (team) => (
                      <li className="event-entry" key={team.id}>
                        <span className="club-num event-entry__seed">
                          {team.seed}
                        </span>
                        <span className="event-entry__team">
                          <strong>{team.name}</strong>
                          {team.players.length ? (
                            <span className="site-meta">
                              {team.players.map((player, index) => (
                                <span key={player.href}>
                                  {index > 0 ? " · " : ""}
                                  <Link href={player.href}>{player.name}</Link>
                                </span>
                              ))}
                            </span>
                          ) : null}
                        </span>
                        {team.averageRating ? (
                          <span className="club-num site-meta">
                            {team.averageRating}
                          </span>
                        ) : null}
                        <Chip
                          kind="status"
                          tone={
                            team.status === "waitlisted"
                              ? "warning"
                              : "positive"
                          }
                        >
                          {team.status === "waitlisted"
                            ? "Waitlist"
                            : "Confirmed"}
                        </Chip>
                      </li>
                    ),
                  )}
                </ol>
              </section>
            ))}
          </div>
        </Section>
      ) : null}

      {upcomingRows.length > 0 ? (
        <Section id="schedule" label="Schedule" title="Match schedule">
          <ul className="event-matches" aria-label="Scheduled matches">
            {upcomingRows.slice(0, 24).map((row) => (
              <li className="event-match" key={row.id}>
                <span className="club-num event-match__time">
                  {row.time ?? "Time to be set"}
                </span>
                <span>
                  <strong>{row.label}</strong>
                  <span className="site-meta">
                    {[row.division, row.court].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="site-meta">
            Team names show in Duna for the players in the event.
          </p>
        </Section>
      ) : phase === "live" ? (
        <section
          className="site-wrap club-section"
          id="schedule"
          aria-label="Schedule"
        >
          <p className="site-body">
            Play is under way. Scores appear here as each match goes live.
          </p>
        </section>
      ) : null}

      {results.length > 0 ? (
        <Section id="results" label="Results" title="Results">
          <ul className="event-matches" aria-label="Completed matches">
            {results.slice(0, 24).map((row) => (
              <li key={row.id}>
                <Link className="event-match" href={row.href!}>
                  <Chip kind="status" tone="neutral">
                    Final
                  </Chip>
                  <span>
                    <strong>{row.label}</strong>
                    <span className="site-meta">{row.division}</span>
                  </span>
                  <span className="club-num event-match__score">
                    {row.sets.map(([a, b]) => `${a}–${b}`).join("  ")}
                  </span>
                  <Icon name="chevron-right" size="inline" />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {event.recurrence ? (
        <Section id="season" label="Season" title="League nights">
          <dl className="club-policies">
            <div>
              <dt>How often</dt>
              <dd>
                {event.recurrence.interval === "weekly"
                  ? "Every week"
                  : "Every other week"}
              </dd>
            </div>
            {event.recurrence.days.map((day) => (
              <div key={day.day}>
                <dt>{day.day[0]!.toUpperCase() + day.day.slice(1)}</dt>
                <dd className="club-num">
                  {day.startsAt} – {day.endsAt}
                </dd>
              </div>
            ))}
            <div>
              <dt>Substitutes</dt>
              <dd>
                {event.recurrence.substitutesAllowed
                  ? event.recurrence.substituteApprovalRequired
                    ? "Allowed with the organiser's approval"
                    : "Allowed"
                  : "Not allowed"}
              </dd>
            </div>
          </dl>
        </Section>
      ) : null}

      {tickets.length > 0 ? (
        <Section id="tickets" label="Tickets" title="Come and watch">
          <Rally className="club-grid">
            {tickets.map((ticket) => {
              const price = allInPrice({
                amountMinor: ticket.price.amountMinor,
                currency: ticket.price.currency,
                kind: "ticket",
              });
              const soldOut = ticket.remaining === 0;
              return (
                <article className="club-card club-offering" key={ticket.id}>
                  <span className="club-offering__top">
                    <h3 className="club-card__title">{ticket.name}</h3>
                    {soldOut ? (
                      <Chip kind="status" tone="warning">
                        Sold out
                      </Chip>
                    ) : null}
                  </span>
                  {ticket.description ? (
                    <p className="site-body">{ticket.description}</p>
                  ) : null}
                  <span className="club-offering__foot">
                    <span className="club-card__price club-num">
                      {priceWords(price)}
                    </span>
                    {!soldOut && (phase === "open" || phase === "waitlist") ? (
                      <ArrowLink
                        href={`/checkout/${event.slug}?ticket=${ticket.id}&quantity=1`}
                      >
                        Get tickets
                      </ArrowLink>
                    ) : null}
                  </span>
                </article>
              );
            })}
          </Rally>
        </Section>
      ) : null}

      {event.description || event.shortSummary ? (
        <Section id="about" label="About" title="About this event">
          <ClubWords club={organiser}>
            {plain(event.description ?? event.shortSummary ?? "")}
          </ClubWords>
        </Section>
      ) : null}

      {guests.length > 0 || highlights.length > 0 ? (
        <Section id="guests" label="Highlights" title="More than the matches">
          <Rally className="club-grid">
            {guests.map((guest) => (
              <article className="club-card club-offering" key={guest.id}>
                <span className="site-label">Featured guest</span>
                <h3 className="club-card__title">
                  {guest.personName ?? guest.title}
                </h3>
                {guest.personName && guest.title !== guest.personName ? (
                  <p className="site-meta">{guest.title}</p>
                ) : null}
                {guest.description ? (
                  <p className="site-body">{guest.description}</p>
                ) : null}
                {guest.personPublicPath ? (
                  <ArrowLink href={guest.personPublicPath}>Profile</ArrowLink>
                ) : null}
              </article>
            ))}
            {highlights.map((feature) => (
              <article className="club-card club-offering" key={feature.id}>
                <span className="site-label">
                  {feature.kind === "sponsor" ? "Sponsor" : "Activity"}
                </span>
                <h3 className="club-card__title">{feature.title}</h3>
                {feature.description ? (
                  <p className="site-body">{feature.description}</p>
                ) : null}
              </article>
            ))}
          </Rally>
        </Section>
      ) : null}

      {extras.videos?.length ? (
        <Section id="watch" label="Watch" title="Watch the event">
          <ul className="event-matches" aria-label="Videos">
            {extras.videos.map((video) => (
              <li key={video.id}>
                <Link className="event-match" href={`/watch/${video.id}`}>
                  <Chip kind="status" tone={video.live ? "live" : "neutral"}>
                    {video.live ? "Live" : "Replay"}
                  </Chip>
                  <span>
                    <strong>{video.title}</strong>
                  </span>
                  <Icon name="chevron-right" size="inline" />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {location?.mode !== "online" ? (
        <Section id="place" label="Place" title={venueName}>
          <PlaceMap
            address={location?.address}
            googlePlaceId={location?.googlePlaceId}
            latitude={location?.latitude}
            longitude={location?.longitude}
            name={venueName}
          />
          {location?.courtNames?.length ? (
            <p className="site-meta">
              Courts: {location.courtNames.join(", ")}
            </p>
          ) : null}
          {extras.nearbyHref ? (
            <ArrowLink href={extras.nearbyHref}>More to play nearby</ArrowLink>
          ) : null}
        </Section>
      ) : null}

      {event.policies?.length ? (
        <Section
          id="policies"
          label="Policies"
          lead={`${organiser}'s own policies, including refunds and weather. Required agreements are signed at checkout.`}
          title="Before you register"
        >
          <div className="club-faq">
            {event.policies.map((policy) => (
              <details key={policy.id}>
                <summary>
                  {policy.title}
                  {policy.required ? (
                    <Chip kind="taxonomy">Signed at checkout</Chip>
                  ) : null}
                </summary>
                <p className="club-policy-text">{plain(policy.markdown)}</p>
              </details>
            ))}
          </div>
        </Section>
      ) : null}

      {event.organizationSlug ? (
        <Section
          id="organiser"
          label="Organiser"
          title={`Hosted by ${organiser}`}
        >
          <div className="club-contact__message">
            {event.organizationSlug ? (
              <ArrowLink href={`/clubs/${event.organizationSlug}`}>
                {organiser} on Duna
              </ArrowLink>
            ) : null}
            {event.organizationSlug ? (
              <LinkButton
                href={actionHref({
                  signedIn: viewer.signedIn,
                  target: `/app/messages?club=${encodeURIComponent(event.organizationSlug)}`,
                })}
                variant="secondary"
              >
                Message the organiser
              </LinkButton>
            ) : null}
          </div>
        </Section>
      ) : null}

      {action ? <ActionBar label={`${event.title}`} primary={action} /> : null}
    </main>
  );
}

/** A Pro Tour event's public summary; the full tour desk stays at `/events/[slug]/tour`. */
export function ProEventSummary({ event }: { readonly event: PublicProEvent }) {
  const liveMatches = event.matches.filter((match) => match.status === "live");
  const champion = event.podium.champion;
  const tour = `/events/${event.slug}/tour`;
  return (
    <main
      className="club-page event-page"
      data-zone={event.live ? "live" : "editorial"}
      id="main"
      tabIndex={-1}
    >
      <section
        aria-labelledby="event-title"
        className="site-wrap club-hero event-hero"
        data-media="none"
      >
        <Rally className="club-hero__copy">
          <p className="site-label event-hero__label">
            <Chip kind="status" tone={event.live ? "live" : "neutral"}>
              {event.live
                ? "Live now"
                : event.status === "completed"
                  ? "Final"
                  : "Pro Tour"}
            </Chip>
          </p>
          <h1 className="club-display" id="event-title">
            {event.name}
          </h1>
          <dl className="club-facts">
            {event.startsOn ? (
              <div>
                <dt>When</dt>
                <dd className="club-num">
                  {event.startsOn}
                  {event.endsOn && event.endsOn !== event.startsOn
                    ? ` – ${event.endsOn}`
                    : ""}
                </dd>
              </div>
            ) : null}
            {event.location ? (
              <div>
                <dt>Where</dt>
                <dd>{event.location}</dd>
              </div>
            ) : null}
            {champion ? (
              <div>
                <dt>Champions</dt>
                <dd>{champion.label}</dd>
              </div>
            ) : null}
          </dl>
          <div className="site-actions">
            <LinkButton href={tour} size="lg" variant="primary">
              Draws, matches and predictions
            </LinkButton>
          </div>
        </Rally>
      </section>
      {liveMatches.length ? (
        <Section id="live" label="Live" title="On court now">
          <ul className="event-matches" aria-label="Matches live now">
            {liveMatches.map((match) => (
              <li key={match.id}>
                <Link
                  className="event-match"
                  href={match.canonicalPath ?? tour}
                >
                  <Chip kind="status" tone="live">
                    Live
                  </Chip>
                  <span>
                    <strong>
                      {match.teamA.label} vs {match.teamB.label}
                    </strong>
                    <span className="site-meta">{match.roundLabel}</span>
                  </span>
                  <Icon name="chevron-right" size="inline" />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </main>
  );
}
